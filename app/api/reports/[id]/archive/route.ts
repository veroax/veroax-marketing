import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// POST /api/reports/[id]/archive
//
// Body: { archived: boolean }
//
// Owner can archive/restore their own reports. Admins
// (profiles.is_admin = true) can additionally archive/restore any
// report — used to recover an agent's archived report on request.
// Admin restore writes an audit_log "report.restored_by_admin" row
// with the admin's user_id so we have a trail.

export async function POST(
  request: Request,
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

  const body = await request.json().catch(() => ({}));
  const archived = body?.archived === true;

  // Look up the target report. RLS already scopes regular users to
  // their own rows; for admins we explicitly use the service-role
  // client to reach across users.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(
    (profile as { is_admin?: boolean } | null)?.is_admin,
  );

  // Resolve the report owner so we know whether to record an admin
  // action. We use the service-role client when the caller is an
  // admin (they may be acting on someone else's report); otherwise
  // the standard user-scoped client which RLS will lock down.
  const reader = isAdmin ? createServiceRoleClient() : supabase;
  const { data: report, error: readErr } = await reader
    .from("reports")
    .select("id, user_id, archived")
    .eq("id", reportId)
    .maybeSingle();
  if (readErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const isOwner = report.user_id === user.id;
  if (!isOwner && !isAdmin) {
    // Defensive — RLS would have already blocked the SELECT for a
    // non-owner regular user, but we double-check.
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // No-op if the desired state is already the current state. Returns
  // 200 so the client can treat archive/restore idempotently.
  if (report.archived === archived) {
    return NextResponse.json({ ok: true, archived, noop: true });
  }

  const writer = isOwner ? supabase : createServiceRoleClient();
  const { error: updErr } = await writer
    .from("reports")
    .update({
      archived,
      archived_at: archived ? new Date().toISOString() : null,
    })
    .eq("id", reportId);
  if (updErr) {
    return NextResponse.json(
      { error: `Could not update archive state: ${updErr.message}` },
      { status: 500 },
    );
  }

  // Audit trail for admin actions on OTHER users' reports.
  if (isAdmin && !isOwner) {
    try {
      const admin = createServiceRoleClient();
      await admin.from("audit_log").insert({
        user_id: report.user_id, // owner of the report, for log searches
        report_id: reportId,
        event_type: archived
          ? "report.archived_by_admin"
          : "report.restored_by_admin",
        metadata: {
          actor_admin_user_id: user.id,
        },
      });
    } catch (err) {
      // Audit-log failure shouldn't fail the operation — log and move
      // on. The state change has already persisted.
      console.error("[archive] audit log insert failed:", err);
    }
  }

  return NextResponse.json({ ok: true, archived });
}
