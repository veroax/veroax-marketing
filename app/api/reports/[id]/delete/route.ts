import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// POST /api/reports/[id]/delete
//
// Hard-deletes a report: removes the storage objects under
// disclosures/{user}/{report}/, deletes the reports row (which cascades
// to email_drafts via FK on delete cascade and sets audit_log.report_id
// to null via FK on delete set null — so the audit trail survives), and
// writes a final report.deleted audit_log row.
//
// Owners can delete their own reports. Admins (profiles.is_admin) can
// delete any report and the audit entry records the admin_actor.
// Body: nothing required; we still parse it defensively so a curious
// CLI hit doesn't crash. There is no "confirm" field server-side — the
// UI handles the type-DELETE-to-confirm gating before calling this.

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(
    (profile as { is_admin?: boolean } | null)?.is_admin,
  );

  // Admins read via service-role so they can reach any user's report.
  // Regular users go through their RLS-scoped client.
  const reader = isAdmin ? createServiceRoleClient() : supabase;
  const { data: report, error: readErr } = await reader
    .from("reports")
    .select("id, user_id, source_file_path, property_address, report_name")
    .eq("id", reportId)
    .maybeSingle();
  if (readErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const isOwner = report.user_id === user.id;
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createServiceRoleClient();

  // ----- Storage cleanup --------------------------------------------------
  // Folder structure is disclosures/{user_id}/{report_id}/* . If
  // source_file_path is set it points at this folder; otherwise compose
  // from the FK. List the folder and remove every object. Storage list
  // and remove use the service-role client to bypass per-user policies
  // when an admin is deleting another user's report.
  const folder =
    report.source_file_path ?? `${report.user_id}/${reportId}`;
  let storageObjectCount = 0;
  try {
    const { data: stored } = await admin.storage
      .from("disclosures")
      .list(folder, { limit: 1000 });
    const paths = (stored ?? []).map((f) => `${folder}/${f.name}`);
    storageObjectCount = paths.length;
    if (paths.length > 0) {
      const { error: rmErr } = await admin.storage
        .from("disclosures")
        .remove(paths);
      if (rmErr) {
        // Don't fail the delete — orphaned storage is a smaller problem
        // than a report stuck in a half-deleted state. Log it for ops.
        console.error(
          `[delete] storage cleanup failed for ${folder}:`,
          rmErr.message,
        );
      }
    }
  } catch (err) {
    console.error(`[delete] storage listing failed for ${folder}:`, err);
  }

  // ----- DB delete --------------------------------------------------------
  // The owner-path goes through the user-scoped client so RLS double-
  // checks ownership server-side; admins use the service-role client.
  const writer = isOwner ? supabase : admin;
  const { error: delErr } = await writer
    .from("reports")
    .delete()
    .eq("id", reportId);
  if (delErr) {
    return NextResponse.json(
      { error: `Could not delete report: ${delErr.message}` },
      { status: 500 },
    );
  }

  // ----- Audit log (report_id is null because the FK is on delete set null,
  // so we capture the deleted ID in metadata for forensic searches). -------
  try {
    await admin.from("audit_log").insert({
      user_id: report.user_id, // owner of the report, for log searches
      event_type:
        !isOwner && isAdmin ? "report.deleted_by_admin" : "report.deleted",
      metadata: {
        deleted_report_id: reportId,
        actor_user_id: user.id,
        actor_is_admin: isAdmin,
        actor_is_owner: isOwner,
        storage_objects_deleted: storageObjectCount,
        property_address: report.property_address,
        report_name: report.report_name,
      },
    });
  } catch (err) {
    console.error("[delete] audit log insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    deleted_report_id: reportId,
    storage_objects_deleted: storageObjectCount,
  });
}
