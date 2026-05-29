import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { startImpersonation } from "@/lib/admin/impersonation";

// POST /api/admin/impersonate
// Body: { user_id: string }
//
// Sets the vx_impersonate_user_id cookie so subsequent dashboard
// reads scope to the target user. Admin-only; non-admin sessions
// reach the auth gate and bounce.
//
// Writes an audit_log row "admin.impersonation_started" so we have
// a forensic trail of which admin viewed which user's data and
// when. Stops are logged via the matching /stop route.

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user: adminUser } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    user_id?: unknown;
  };
  const targetUserId =
    typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!targetUserId) {
    return NextResponse.json(
      { error: "user_id is required." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json(
      { error: "Target user not found." },
      { status: 404 },
    );
  }

  await startImpersonation(targetUserId);
  await admin.from("audit_log").insert({
    user_id: adminUser.id,
    event_type: "admin.impersonation_started",
    metadata: {
      target_user_id: targetUserId,
      target_email: (target as { email: string }).email,
    },
  });

  return NextResponse.json({
    ok: true,
    target: {
      id: (target as { id: string }).id,
      full_name: (target as { full_name: string | null }).full_name,
      email: (target as { email: string }).email,
    },
  });
}
