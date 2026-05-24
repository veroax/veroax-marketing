// POST /api/admin/unsuspend-user/[userId]
//
// Reverses a suspend. Clears the auth ban and the suspension flag
// on the profile. Does NOT re-create any Stripe subscriptions
// (cancelled at suspend time); the user can self-resubscribe via
// the pricing page if/when they're ready.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";

export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  if (!targetUserId) {
    return NextResponse.json(
      { error: "userId is required." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();

  const { data: target, error: lookupErr } = await admin
    .from("profiles")
    .select("id, email, is_suspended")
    .eq("id", targetUserId)
    .maybeSingle();
  if (lookupErr || !target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (!(target as { is_suspended?: boolean }).is_suspended) {
    return NextResponse.json(
      { error: "User is not suspended." },
      { status: 409 },
    );
  }

  // Clear the auth ban. "none" tells Supabase to remove banned_until.
  const banResult = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: "none",
  });
  if (banResult.error) {
    return NextResponse.json(
      { error: `Failed to clear auth ban: ${banResult.error.message}` },
      { status: 500 },
    );
  }

  await admin
    .from("profiles")
    .update({
      is_suspended: false,
      suspended_at: null,
      suspended_by: null,
      suspended_reason: null,
    })
    .eq("id", targetUserId);

  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: "user.unsuspended_by_admin",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
      },
    });
  } catch (err) {
    console.error("[unsuspend-user] audit log insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    unsuspended_user_id: targetUserId,
  });
}
