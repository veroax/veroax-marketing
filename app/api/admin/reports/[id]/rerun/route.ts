// POST /api/admin/reports/[id]/rerun
//
// Admin-only re-run for a report. Mirrors the agent's
// /api/reports/[id]/analyze flow but uses the service-role client
// to bypass RLS, so an admin can re-run ANY agent's report (not
// just their own). Used from the /admin/reports/[id] detail page
// when the founder wants to retry a failed analysis or refresh an
// older one after a prompt / model change.
//
// Sequence:
//   1. requireAdmin (401 / 403 if not).
//   2. Look up the report via service-role client.
//   3. Concurrency guard: if status='analyzing' and the lock window
//      hasn't expired, return 202 + a note instead of double-firing.
//   4. Stamp status='analyzing', clear failure_reason, set
//      analysis_started_at = now().
//   5. Queue performAnalysis via after(). Same machinery the agent
//      retry path uses, so we automatically get verification pass,
//      market-context, cost-reference, listing reconciliation, etc.
//   6. Audit-log 'report.admin_rerun' with the admin's user_id so
//      we can trace who kicked off which re-run.

import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { performAnalysis } from "@/lib/server/performAnalysis";

const ANALYSIS_LOCK_MINUTES = 15;

// Match the agent analyze route's maxDuration so a re-run has the
// same budget as a normal run.
export const maxDuration = 800;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user: adminUser } = auth;

  const { id: reportId } = await context.params;
  const admin = createServiceRoleClient();

  const { data: report, error: reportErr } = await admin
    .from("reports")
    .select(
      "id, user_id, status, property_address, source_file_path, analysis_started_at, listing_url, listing_text",
    )
    .eq("id", reportId)
    .maybeSingle();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Concurrency guard: an in-flight analysis is left alone. The
  // re-run is queued for next time the agent or admin asks.
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
        note: "Analysis already running; admin rerun ignored until the current run finishes or expires.",
      },
      { status: 202 },
    );
  }

  // Take the lock, clear any prior failure reason, AND increment
  // the run counter. Every admin re-run produces a fresh
  // analysis_run_count value so the report's "Run #N" label tracks
  // every retry across both agent retries and admin re-runs.
  const { data: currentRunRow } = await admin
    .from("reports")
    .select("analysis_run_count")
    .eq("id", reportId)
    .single();
  const nextRunCount =
    ((currentRunRow as { analysis_run_count?: number } | null)
      ?.analysis_run_count ?? 1) + 1;
  await admin
    .from("reports")
    .update({
      status: "analyzing",
      analysis_started_at: new Date().toISOString(),
      failure_reason: null,
      analysis_run_count: nextRunCount,
    })
    .eq("id", reportId);

  // Audit trail, both for the founder's own retrospective AND for
  // a /admin/audit drill-down on a specific report.
  try {
    await admin.from("audit_log").insert({
      user_id: adminUser.id,
      report_id: reportId,
      event_type: "report.admin_rerun",
      metadata: {
        report_owner_id: report.user_id,
        prior_status: report.status,
      },
    });
  } catch (err) {
    console.error("[admin-rerun] audit insert failed:", err);
  }

  // Queue the analysis in after() so the response goes back
  // immediately. Same pattern as the agent retry path.
  after(async () => {
    const bg = createServiceRoleClient();
    try {
      // Resolve the owning agent's email so the completion
      // notification (if not skipped) still goes to them, not to
      // the admin. We don't expose this on the report row for
      // privacy reasons, so look it up via profiles.
      const { data: ownerProfile } = await bg
        .from("profiles")
        .select("email")
        .eq("id", report.user_id)
        .maybeSingle();
      const ownerEmail =
        (ownerProfile as { email?: string | null } | null)?.email ?? null;

      await performAnalysis({
        admin: bg,
        userId: report.user_id, // the agent who owns the report
        userEmail: ownerEmail,
        report: {
          id: report.id,
          property_address: report.property_address,
          source_file_path: report.source_file_path,
          listing_url:
            (report as { listing_url?: string | null }).listing_url ?? null,
          listing_text:
            (report as { listing_text?: string | null }).listing_text ?? null,
        },
        // Admin re-runs skip the "your report is ready" email by
        // default. The agent didn't ask for it; we don't want them
        // surprised by a fresh email about an old report. If the
        // founder wants to notify the agent, that's a manual
        // follow-up.
        skipNotificationEmail: true,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Re-run failed.";
      try {
        await bg
          .from("reports")
          .update({ status: "failed", failure_reason: message })
          .eq("id", reportId);
      } catch (markErr) {
        console.error("[admin-rerun] failed to mark report failed:", markErr);
      }
      console.error("[admin-rerun] background work failed:", err);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      status: "analyzing",
      note: "Re-run started; polling will detect completion.",
    },
    { status: 202 },
  );
}
