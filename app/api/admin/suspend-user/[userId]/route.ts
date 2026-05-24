// POST /api/admin/suspend-user/[userId]
//
// Reversible admin action. Bans the auth user from logging in,
// cancels any active Stripe subscriptions so they stop being
// billed, and stamps profiles.is_suspended = true. Data is
// preserved across the suspend/unsuspend cycle so a wrongful
// suspension is fully recoverable.
//
// Body: { reason?: string }   optional, stored on the profile
//                              and the audit row so future-you
//                              knows why it happened.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";
import { cancelStripeSubscriptionsForUser } from "@/lib/server/userLifecycle";
import { notifyAlert } from "@/lib/server/alerting";

// Effectively "forever" until an admin unsuspends. Supabase wants a
// duration string like "8760h" (1 year); we re-apply if needed.
const SUSPEND_DURATION = "8760h";

export async function POST(
  request: Request,
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
  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "You cannot suspend yourself." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 500)
      : null;

  const admin = createServiceRoleClient();

  // Confirm the target exists and we haven't double-suspended.
  const { data: target, error: lookupErr } = await admin
    .from("profiles")
    .select("id, email, is_suspended")
    .eq("id", targetUserId)
    .maybeSingle();
  if (lookupErr || !target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if ((target as { is_suspended?: boolean }).is_suspended) {
    return NextResponse.json(
      { error: "User is already suspended." },
      { status: 409 },
    );
  }

  // Step 1: ban the auth user. This prevents new login + invalidates
  // active sessions on next request.
  const banResult = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: SUSPEND_DURATION,
  });
  if (banResult.error) {
    return NextResponse.json(
      { error: `Failed to ban auth user: ${banResult.error.message}` },
      { status: 500 },
    );
  }

  // Step 2: cancel Stripe subscriptions so the user stops being
  // billed. Failures here are surfaced but do NOT undo the ban.
  const stripeResult = await cancelStripeSubscriptionsForUser(targetUserId);

  // Step 3: stamp the profile row.
  await admin
    .from("profiles")
    .update({
      is_suspended: true,
      suspended_at: new Date().toISOString(),
      suspended_by: user.id,
      suspended_reason: reason,
    })
    .eq("id", targetUserId);

  // Step 4: audit + alert.
  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: "user.suspended_by_admin",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
        reason,
        stripe_cancelled_count: stripeResult.cancelled_count,
        stripe_attempted: stripeResult.attempted,
      },
    });
  } catch (err) {
    console.error("[suspend-user] audit log insert failed:", err);
  }
  try {
    await notifyAlert({
      alert_key: `user.suspended.${targetUserId}`,
      severity: "info",
      status: "firing",
      subject: `User suspended: ${(target as { email?: string }).email ?? targetUserId}`,
      body: `${user.email ?? user.id} just suspended user ${(target as { email?: string }).email ?? targetUserId}.${reason ? `\n\nReason: ${reason}` : ""}\n\nStripe: ${stripeResult.cancelled_count} subscription(s) cancelled.`,
      metadata: {
        suspended_user_id: targetUserId,
        actor: user.email,
        reason,
        stripe: stripeResult,
      },
    });
  } catch (err) {
    console.error("[suspend-user] alert dispatch failed:", err);
  }

  return NextResponse.json({
    ok: true,
    suspended_user_id: targetUserId,
    stripe_cancelled: stripeResult,
  });
}
