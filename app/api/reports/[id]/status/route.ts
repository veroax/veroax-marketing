import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";

// Lightweight polling endpoint for the AnalysisRunner. Returns the
// report's current status plus the recent audit_log events for it so
// the client can show "Uploaded X of Y" / "Running Claude" / etc.

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // RLS-bound select confirms the report belongs to this user.
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select(
      "id, status, failure_reason, analysis_started_at, analysis_completed_at",
    )
    .eq("id", reportId)
    .maybeSingle();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Recent audit_log entries scoped to this report.
  const { data: events } = await supabase
    .from("audit_log")
    .select("event_type, metadata, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true })
    .limit(100);

  return NextResponse.json({
    status: report.status,
    failure_reason: report.failure_reason,
    analysis_started_at: report.analysis_started_at,
    analysis_completed_at: report.analysis_completed_at,
    events: events ?? [],
  });
}
