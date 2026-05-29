import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { IMPERSONATE_COOKIE, stopImpersonation } from "@/lib/admin/impersonation";

// POST /api/admin/impersonate/stop
//
// Clears the impersonation cookie and logs the stop event.
//
// Auth posture: we use requireUser (not requireAdmin) here because
// if the cookie was set by a previously-admin user whose access
// was revoked, we still want the cookie to be clearable. The
// audit row will distinguish "stop by admin" from "stop by
// previous admin" if we ever need that detail.

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const store = await cookies();
  const targetUserId = store.get(IMPERSONATE_COOKIE)?.value ?? null;
  await stopImpersonation();

  if (targetUserId) {
    try {
      const admin = createServiceRoleClient();
      await admin.from("audit_log").insert({
        user_id: user.id,
        event_type: "admin.impersonation_stopped",
        metadata: { target_user_id: targetUserId },
      });
    } catch (err) {
      console.error("[impersonate/stop] audit insert failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
