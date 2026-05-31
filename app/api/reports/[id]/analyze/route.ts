import { NextResponse } from "next/server";
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
      "id, user_id, status, property_address, source_file_path, analysis_started_at, listing_url, listing_text",
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
  // started recently AND has actually written audit events, assume
  // it's still in flight and don't spawn a duplicate.
  //
  // The audit-events check matters because /api/reports/[id]/finalize
  // sets status='analyzing' + analysis_started_at=now() BEFORE the
  // AnalysisRunner ever POSTs to this route. Without the audit-event
  // probe, the lock check above would see "status='analyzing' and
  // analysis_started_at is recent" and 202-skip the first legitimate
  // /analyze call, leaving the report stuck at "Starting analysis..."
  // forever (Mataro Way symptom: 16+ minutes stuck, zero analysis.*
  // events). performAnalysis writes "analysis.upload_started" as its
  // FIRST act, so if no analysis.* events exist for this report
  // since analysis_started_at, no worker has actually started and
  // the lock is orphaned, not active.
  const startedAt = report.analysis_started_at
    ? new Date(report.analysis_started_at)
    : null;
  const lockWindowMs = ANALYSIS_LOCK_MINUTES * 60 * 1000;
  const isWithinLock =
    startedAt && Date.now() - startedAt.getTime() < lockWindowMs;
  if (report.status === "analyzing" && isWithinLock && startedAt) {
    // Probe for actual worker activity since the lock was taken.
    const { count: activeWorkerEventCount } = await supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("report_id", reportId)
      .like("event_type", "analysis.%")
      .gte("created_at", startedAt.toISOString());
    const workerHasRun = (activeWorkerEventCount ?? 0) > 0;
    if (workerHasRun) {
      return NextResponse.json(
        {
          ok: true,
          status: "analyzing",
          note: "Analysis already running, polling will detect completion.",
        },
        { status: 202 },
      );
    }
    // Lock is orphaned (set by /finalize, performAnalysis never
    // started). Fall through to the take-the-lock + run path below.
    // We refresh analysis_started_at so the lock-window clock
    // resets from this attempt, not the finalize timestamp.
  }

  // Take the lock by stamping analysis_started_at AND increment the
  // run counter. This route only fires for retries (the original
  // analysis goes through /finalize -> performAnalysis), so we
  // always increment here when we proceed past the lock check. Use
  // the embedded SQL expression so the increment is atomic against
  // concurrent retries; if two retries race, the lock check above
  // catches the second one anyway.
  const { data: currentRunRow } = await supabase
    .from("reports")
    .select("analysis_run_count")
    .eq("id", reportId)
    .single();
  const nextRunCount =
    ((currentRunRow as { analysis_run_count?: number } | null)
      ?.analysis_run_count ?? 1) + 1;
  // Clear report_data on the live row when starting a retry so the
  // dashboard does NOT surface the previous failed attempt's partial
  // findings during the re-run, or after a stall. First-time
  // analyses already have report_data=null so this is a no-op for
  // them; retries from status='failed' (or admin-triggered re-runs
  // that route here) are the cases this protects. The prior
  // report_data, if any, was snapshotted into versions[] earlier in
  // the failure / update flow that produced the bad data.
  await supabase
    .from("reports")
    .update({
      status: "analyzing",
      analysis_started_at: new Date().toISOString(),
      failure_reason: null,
      analysis_run_count: nextRunCount,
      report_data: null,
    })
    .eq("id", reportId);

  // Run the analyzer synchronously inside the request handler. We
  // used to call after() here to schedule the heavy work in the
  // background and return 202 immediately, but Vercel's after()
  // proved unreliable in production: on multiple first-time
  // analysis runs (1544 San Antonio, 434 Hibiscus) the function
  // returned 202, after() never fired, the report sat at
  // status='analyzing' with zero analysis.* audit events, and the
  // user watched "Starting analysis..." spin forever. The
  // structural fix is to await performAnalysis directly. The
  // browser fetch will hold the connection open; if Cloudflare /
  // Vercel's proxy times out the request before performAnalysis
  // finishes, the AnalysisRunner's /status polling loop will keep
  // observing audit events and detect completion from the
  // database state. The function itself stays alive for the full
  // maxDuration (800s) regardless of whether the client is still
  // connected.
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
        listing_url:
          (report as { listing_url?: string | null }).listing_url ?? null,
        listing_text:
          (report as { listing_text?: string | null }).listing_text ?? null,
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
    console.error("[analyze] performAnalysis threw:", err);
    return NextResponse.json(
      { ok: false, status: "failed", error: message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: "qa_pending",
      note: "Analysis completed.",
    },
    { status: 200 },
  );
}
