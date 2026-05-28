// POST /api/admin/reports/[id]/delete
// Body: { reason?: string }
//
// Admin soft-delete of any report regardless of owner. Stamps
// deleted_at + deleted_by + purge_after = now() + 30 days. The
// row stays in the database; every existing read path filters
// it out via "deleted_at is null" so the report disappears from
// the agent's dashboard, the admin reports list, the public
// share link, the PDF download, etc. immediately.
//
// Permanent removal happens via /api/cron/purge-deleted-reports
// which sweeps rows whose purge_after has passed. Until then,
// /admin/reports/deleted shows the row + a Restore button so
// mistakes can be corrected.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

const PURGE_GRACE_DAYS = 30;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { id: reportId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    reason?: string;
  };
  const reason =
    typeof body.reason === "string"
      ? body.reason.trim().slice(0, 500) || null
      : null;

  const admin = createServiceRoleClient();

  const { data: report } = await admin
    .from("reports")
    .select("id, user_id, deleted_at")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if ((report as { deleted_at?: string | null }).deleted_at) {
    return NextResponse.json(
      { error: "Report is already in the deleted bucket." },
      { status: 409 },
    );
  }

  const now = new Date();
  const purgeAt = new Date(
    now.getTime() + PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  const { error: updErr } = await admin
    .from("reports")
    .update({
      deleted_at: now.toISOString(),
      deleted_by: user.id,
      deleted_reason: reason,
      purge_after: purgeAt.toISOString(),
    })
    .eq("id", reportId);
  if (updErr) {
    return NextResponse.json(
      { error: `Could not delete report: ${updErr.message}` },
      { status: 500 },
    );
  }

  // Audit trail: who deleted what + when + why.
  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      report_id: reportId,
      event_type: "report.soft_deleted_by_admin",
      metadata: {
        report_owner_id: (report as { user_id: string }).user_id,
        reason,
        purge_after: purgeAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[admin/reports/delete] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    deleted_at: now.toISOString(),
    purge_after: purgeAt.toISOString(),
  });
}
