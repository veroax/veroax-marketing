import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Admin role gate. The DevRerunButton already requires admin to even
  // appear in the UI, but defense-in-depth — the route is callable
  // directly via HTTP.
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const callerIsAdmin = Boolean(
    (callerProfile as { is_admin?: boolean } | null)?.is_admin,
  );
  if (!callerIsAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const { data: report } = await admin
    .from("reports")
    .select("id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Reset to a clean failed state. analyze accepts "failed" and will
  // kick off a fresh background run. We pick failure_reason wording
  // that's distinguishable from a real failure so anyone reading
  // audit_log knows this was intentional.
  const { error: updErr } = await admin
    .from("reports")
    .update({
      status: "failed",
      failure_reason:
        "Admin force-rerun: prior analysis discarded for re-analysis.",
      analysis_started_at: null,
    })
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
      },
    });
  } catch (err) {
    console.error("[force-rerun] audit log insert failed:", err);
  }

  return NextResponse.json({ ok: true, previous_status: report.status });
}
