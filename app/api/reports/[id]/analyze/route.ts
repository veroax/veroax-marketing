import { NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { performAnalysis } from "@/lib/server/performAnalysis";
import { requireUser } from "@/lib/auth/require";

// Concurrency lock window. Matched to the analyze function's maxDuration
// (800s) plus a small safety margin.
const ANALYSIS_LOCK_MINUTES = 15;

// Max function runtime. Vercel Pro supports up to 800s. We use after()
// to run the actual analysis work AFTER the HTTP response is sent so we
// don't hit Vercel's gateway timeout (~5min), the function keeps
// executing in the background until maxDuration or completion.
export const maxDuration = 800;

// ============================================================================
// POST handler, performs the synchronous validation + lock-taking, then
// kicks off the heavy analysis work via after() and returns 202 immediately.
//
// The heavy work itself lives in lib/server/performAnalysis.ts, shared
// with /api/reports/[id]/update for re-analysis on added documents.
// ============================================================================

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select(
      "id, user_id, status, property_address, source_file_path, analysis_started_at",
    )
    .eq("id", reportId)
    .single();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (!["analyzing", "failed"].includes(report.status)) {
    return NextResponse.json(
      { error: `Report is already ${report.status}.`, status: report.status },
      { status: 409 },
    );
  }

  // Concurrency lock: if status="analyzing" and the previous run was
  // started recently, assume it's still in flight and don't spawn a
  // duplicate.
  const startedAt = report.analysis_started_at
    ? new Date(report.analysis_started_at)
    : null;
  const lockWindowMs = ANALYSIS_LOCK_MINUTES * 60 * 1000;
  const isWithinLock =
    startedAt && Date.now() - startedAt.getTime() < lockWindowMs;
  if (report.status === "analyzing" && isWithinLock) {
    return NextResponse.json(
      {
        ok: true,
        status: "analyzing",
        note: "Analysis already running, polling will detect completion.",
      },
      { status: 202 },
    );
  }

  // Take the lock by stamping analysis_started_at.
  await supabase
    .from("reports")
    .update({
      status: "analyzing",
      analysis_started_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq("id", reportId);

  // Schedule the heavy work to run AFTER the response is sent. Vercel's
  // HTTP gateway times out around 5 minutes regardless of maxDuration,
  // so running the work synchronously inside the request handler gives
  // the client a 504 even though the function is still alive. after()
  // keeps the function running for up to maxDuration (800s) while the
  // response goes out immediately.
  after(async () => {
    const admin = createServiceRoleClient();
    try {
      await performAnalysis({
        admin,
        userId: user.id,
        userEmail: user.email ?? null,
        report: {
          id: report.id,
          property_address: report.property_address,
          source_file_path: report.source_file_path,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Analysis failed.";
      try {
        await admin
          .from("reports")
          .update({ status: "failed", failure_reason: message })
          .eq("id", reportId);
      } catch (markErr) {
        console.error("[analyze] failed to mark report as failed:", markErr);
      }
      console.error("[analyze] background work failed:", err);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      status: "analyzing",
      note: "Analysis started, polling will detect completion.",
    },
    { status: 202 },
  );
}
