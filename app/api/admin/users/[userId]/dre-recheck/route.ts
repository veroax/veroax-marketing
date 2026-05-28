// POST /api/admin/users/[userId]/dre-recheck
//
// Site-admin action: force a fresh DRE lookup for the target agent,
// bypassing the 24h cache. Useful when:
//   - An agent's name was misspelled at signup and they fixed it
//   - The DRE site was flaky and we want to retry
//   - An agent reports their status should now be Active (renewed
//     license) and we want to refresh the cache early
//
// Synchronous (not after()), the admin clicks the button and waits
// for the result so the UI can show the updated status immediately.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyDreLicense, persistDreResult } from "@/lib/server/dreVerify";

export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  // Pull the target agent's license + name so we can recheck.
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("dre_license, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const target = targetProfile as
    | { dre_license: string | null; full_name: string | null; email: string }
    | null;
  if (!target) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }
  if (!target.dre_license) {
    return NextResponse.json(
      {
        error:
          "This user has no DRE license number on file. Ask them to enter one in their settings first.",
      },
      { status: 409 },
    );
  }

  const result = await verifyDreLicense({
    licenseId: target.dre_license,
    agentFullName: target.full_name,
  });
  await persistDreResult(admin, userId, result);

  // Audit so we can see who triggered the recheck.
  try {
    await admin.from("audit_log").insert({
      user_id: userId,
      event_type: "dre.recheck",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
        result_status: result.status,
        license_id: result.license_id,
      },
    });
  } catch (err) {
    console.error("[dre-recheck] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    remote_status: result.remote_status,
    remote_name: result.remote_name,
    remote_expiration: result.remote_expiration,
    checked_at: result.checked_at,
    error_message: result.error_message,
  });
}
