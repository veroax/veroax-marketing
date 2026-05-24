// POST /api/admin/delete-user/[userId]
//
// HARD delete. Permanently removes the user and everything they own:
//   - Cancels any active Stripe subscriptions (so billing stops)
//   - Deletes every storage object under disclosures/{user_id}/
//   - Deletes auth.users row, which cascades through public.profiles,
//     public.reports, public.subscriptions, public.email_drafts,
//     public.report_credit_ledger via foreign-key on-delete-cascade
//   - audit_log rows for the user are KEPT but their user_id is
//     nulled out (on-delete-set-null) so the trail survives
//
// Body: { confirm_email: string }   the admin types the user's
//   email as anti-fat-finger. Mismatch = 409. The UI also gates
//   the button behind a typed confirmation.
//
// Stripe customer record is intentionally NOT deleted; financial
// history needs to survive for refund / dispute / accounting
// purposes even after the user is removed.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";
import {
  cancelStripeSubscriptionsForUser,
  deleteUserStorageFolder,
} from "@/lib/server/userLifecycle";
import { notifyAlert } from "@/lib/server/alerting";

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
      { error: "You cannot delete yourself." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirm_email?: string;
  };
  const confirmEmail =
    typeof body.confirm_email === "string"
      ? body.confirm_email.trim().toLowerCase()
      : "";

  const admin = createServiceRoleClient();

  const { data: target, error: lookupErr } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", targetUserId)
    .maybeSingle();
  if (lookupErr || !target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const targetEmail = ((target as { email?: string }).email ?? "")
    .trim()
    .toLowerCase();
  if (!confirmEmail || confirmEmail !== targetEmail) {
    return NextResponse.json(
      {
        error:
          "Confirmation email did not match. Type the user's email exactly.",
      },
      { status: 409 },
    );
  }

  // Step 1: cancel Stripe subscriptions. Don't block on failure.
  const stripeResult = await cancelStripeSubscriptionsForUser(targetUserId);

  // Step 2: delete storage objects.
  const storageResult = await deleteUserStorageFolder(targetUserId);

  // Step 3: capture identifying info for the audit log BEFORE the
  // cascade wipes the profile row. PII rule: we store the SHA-256
  // of the email rather than the email itself in the audit metadata,
  // so the trail can be matched if the user later asks "was my
  // account really deleted?" without leaving their address in the log.
  const { createHash } = await import("node:crypto");
  const emailHash = targetEmail
    ? createHash("sha256").update(targetEmail).digest("hex").slice(0, 16)
    : null;

  // Step 4: delete the auth user. This cascades to all our tables
  // via FK on-delete-cascade. audit_log uses on-delete-set-null so
  // the historical trail survives.
  const delResult = await admin.auth.admin.deleteUser(targetUserId);
  if (delResult.error) {
    return NextResponse.json(
      { error: `Failed to delete auth user: ${delResult.error.message}` },
      { status: 500 },
    );
  }

  // Step 5: audit + alert. user_id on the audit row is null (the
  // user was just deleted); we keep operational info only.
  try {
    await admin.from("audit_log").insert({
      user_id: null,
      event_type: "user.deleted_by_admin",
      metadata: {
        deleted_user_id: targetUserId,
        deleted_email_sha256_16: emailHash,
        actor_user_id: user.id,
        actor_email: user.email,
        stripe_cancelled_count: stripeResult.cancelled_count,
        stripe_attempted: stripeResult.attempted,
        storage_removed_count: storageResult.removed_count,
        storage_error: storageResult.error ?? null,
      },
    });
  } catch (err) {
    console.error("[delete-user] audit log insert failed:", err);
  }
  try {
    await notifyAlert({
      alert_key: `user.deleted.${targetUserId}`,
      severity: "warning",
      status: "firing",
      subject: `User permanently deleted`,
      body: `${user.email ?? user.id} just permanently deleted a user account.\n\nStripe subscriptions cancelled: ${stripeResult.cancelled_count}\nStorage objects removed: ${storageResult.removed_count}\n\nThe Stripe customer record was preserved for financial-history purposes; only the subscription was cancelled.`,
      metadata: {
        deleted_email_sha256_16: emailHash,
        actor: user.email,
        stripe: stripeResult,
        storage: storageResult,
      },
    });
  } catch (err) {
    console.error("[delete-user] alert dispatch failed:", err);
  }

  return NextResponse.json({
    ok: true,
    deleted_user_id: targetUserId,
    stripe_cancelled: stripeResult,
    storage_removed: storageResult,
  });
}
