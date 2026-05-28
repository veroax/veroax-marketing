// POST /api/admin/reports/[id]/restore
//
// Reverses a soft-delete: nulls out deleted_at + deleted_by +
// deleted_reason + purge_after so the row becomes visible on
// every read path again. Admin-only because mistakes during
// triage can be expensive (restoring a report the agent
// intentionally deleted, etc.).
//
// Refuses if the report isn't actually in the deleted bucket
// (returns 409 with a clear message).

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { id: reportId } = await context.params;
  const admin = createServiceRoleClient();

  const { data: report } = await admin
    .from("reports")
    .select("id, user_id, deleted_at, deleted_by, purge_after")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  const wasDeletedAt = (report as { deleted_at?: string | null }).deleted_at;
  if (!wasDeletedAt) {
    return NextResponse.json(
      { error: "Report is not in the deleted bucket." },
      { status: 409 },
    );
  }

  const { error: updErr } = await admin
    .from("reports")
    .update({
      deleted_at: null,
      deleted_by: null,
      deleted_reason: null,
      purge_after: null,
    })
    .eq("id", reportId);
  if (updErr) {
    return NextResponse.json(
      { error: `Could not restore: ${updErr.message}` },
      { status: 500 },
    );
  }

  // Audit trail preserves the prior deleted_at + purge_after so
  // we can see who originally deleted it and when the purge
  // would have fired.
  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      report_id: reportId,
      event_type: "report.restored_from_delete",
      metadata: {
        report_owner_id: (report as { user_id: string }).user_id,
        was_deleted_at: wasDeletedAt,
        was_deleted_by: (report as { deleted_by?: string | null }).deleted_by,
        was_purge_after: (report as { purge_after?: string | null }).purge_after,
      },
    });
  } catch (err) {
    console.error("[admin/reports/restore] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
