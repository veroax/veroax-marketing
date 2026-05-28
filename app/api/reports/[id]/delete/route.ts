import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require";

// POST /api/reports/[id]/delete
//
// SOFT-DELETE: stamps reports.deleted_at + deleted_by + purge_after
// (now + 30 days). The row stays in the database and the storage
// files stay in disclosures/<user>/<report>/ so the row is
// recoverable from /admin/reports/deleted for the full 30-day
// grace window. After 30 days the daily
// /api/cron/purge-deleted-reports cron permanently removes the
// row and its storage.
//
// Owners can soft-delete their own reports. Admins
// (profiles.is_admin) can soft-delete any report. Same endpoint
// serves both surfaces so the soft-delete pattern stays
// single-sourced.
//
// Optional body: { reason?: string }, an audit-only note.
// Returns 409 when the report is already in the deleted bucket.

const PURGE_GRACE_DAYS = 30;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(
    (profile as { is_admin?: boolean } | null)?.is_admin,
  );

  const body = (await request.json().catch(() => ({}))) as {
    reason?: string;
  };
  const reason =
    typeof body.reason === "string"
      ? body.reason.trim().slice(0, 500) || null
      : null;

  // Admins read via service-role so they can reach any user's
  // report; regular users go through their RLS-scoped client.
  const admin = createServiceRoleClient();
  const reader = isAdmin ? admin : supabase;
  const { data: report, error: readErr } = await reader
    .from("reports")
    .select("id, user_id, deleted_at")
    .eq("id", reportId)
    .maybeSingle();
  if (readErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const isOwner = (report as { user_id: string }).user_id === user.id;
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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

  // Owner-path goes through the user-scoped client so RLS
  // double-checks ownership server-side; admins use the
  // service-role client.
  const writer = isOwner ? supabase : admin;
  const { error: updErr } = await writer
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

  // Audit trail. Distinguish admin-actor deletes from owner-actor
  // deletes so the admin-restore view can show the right "deleted
  // by" attribution. PII rule respected, no property addresses or
  // client names.
  try {
    await admin.from("audit_log").insert({
      user_id: (report as { user_id: string }).user_id,
      report_id: reportId,
      event_type:
        !isOwner && isAdmin
          ? "report.soft_deleted_by_admin"
          : "report.soft_deleted_by_owner",
      metadata: {
        actor_user_id: user.id,
        actor_is_admin: isAdmin,
        actor_is_owner: isOwner,
        reason,
        purge_after: purgeAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[delete] audit log insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    deleted_at: now.toISOString(),
    purge_after: purgeAt.toISOString(),
  });
}
