import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";

// POST /api/admin/force-rerun/[id]
//
// Admin override of /api/reports/[id]/restart. Same shape (resets the
// report to a clean "failed" state with analysis_started_at = null),
// but skips the status guardrail that protects qa_pending / delivered
// reports from accidental restart. Useful from the DevRerunButton on
// the report detail page when iterating on the analyzer — the founder
// wants to discard a completed analysis and run a fresh one against
// updated prompts without manually editing SQL.
//
// After this endpoint returns OK, the client is expected to POST
// /api/reports/[id]/analyze to actually kick off the new run. That
// route accepts status="failed", so the chained call works cleanly.
//
// Audited as "report.force_rerun_by_admin" with the actor user ID.

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

  // Admin role gate. The DevRerunButton already requires admin to even
  // appear in the UI, but defense-in-depth, the route is callable
  // directly via HTTP.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();
  const { data: report } = await admin
    .from("reports")
    .select(
      "id, status, report_data, original_files, source_file_path, versions, update_count, analysis_completed_at",
    )
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Snapshot the existing report_data into versions[] BEFORE reset
  // when there's a real prior analysis worth preserving. The share
  // URL always shows the latest analysis (re-renders the current
  // report_data), but the previous PDF + findings remain accessible
  // via the dashboard's version-download path so the agent can pull
  // up "what the analysis looked like before I reran it."
  //
  // Same shape as the /update endpoint's snapshot — agent-facing
  // version history works the same way for force-rerun snapshots
  // as for add-docs snapshots.
  const hasPriorAnalysis =
    Boolean(report.report_data) &&
    ["qa_pending", "qa_approved", "delivered"].includes(report.status);
  let nextVersions = report.versions;
  let nextUpdateCount = (report.update_count as number | null) ?? 0;
  if (hasPriorAnalysis) {
    nextUpdateCount += 1;
    const snapshot = {
      version_number: nextUpdateCount,
      snapshotted_at: new Date().toISOString(),
      report_data: report.report_data,
      original_files: report.original_files,
      source_file_path: report.source_file_path,
      status: report.status,
      pdf_blob_path: null as string | null,
      // Distinguishable in the version-list UI from /update snapshots
      // (which have removed_filename or added context).
      snapshot_reason: "admin_force_rerun",
      analysis_completed_at: report.analysis_completed_at,
    };
    nextVersions = Array.isArray(report.versions)
      ? [...(report.versions as unknown[]), snapshot]
      : [snapshot];
  }

  // Reset to a clean failed state. analyze accepts "failed" and will
  // kick off a fresh background run. We pick failure_reason wording
  // that's distinguishable from a real failure so anyone reading
  // audit_log knows this was intentional.
  const updatePayload: Record<string, unknown> = {
    status: "failed",
    failure_reason:
      "Admin force-rerun: prior analysis discarded for re-analysis.",
    analysis_started_at: null,
  };
  if (hasPriorAnalysis) {
    updatePayload.versions = nextVersions;
    updatePayload.update_count = nextUpdateCount;
  }
  const { error: updErr } = await admin
    .from("reports")
    .update(updatePayload)
    .eq("id", reportId);
  if (updErr) {
    return NextResponse.json(
      { error: `Could not reset report state: ${updErr.message}` },
      { status: 500 },
    );
  }

  try {
    await admin.from("audit_log").insert({
      report_id: reportId,
      event_type: "report.force_rerun_by_admin",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
        previous_status: report.status,
        snapshotted: hasPriorAnalysis,
        new_version_number: hasPriorAnalysis ? nextUpdateCount : null,
      },
    });
  } catch (err) {
    console.error("[force-rerun] audit log insert failed:", err);
  }

  return NextResponse.json({ ok: true, previous_status: report.status });
}
