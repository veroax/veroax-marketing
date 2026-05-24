// Helpers for the destructive user-management actions (suspend,
// unsuspend, delete). Each one needs to reach into Stripe and
// storage, not just our own tables, so the logic lives here and is
// shared between /api/admin/suspend-user, /api/admin/unsuspend-user,
// and /api/admin/delete-user. Resilient by design: a Stripe failure
// during delete does NOT block the local-DB delete, and storage
// failures during delete do NOT block either. Each step logs its
// own error; the overall result includes per-step success flags so
// the UI can show the founder exactly what worked.

import Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type StripeCancelResult = {
  attempted: boolean;
  cancelled_count: number;
  details: Array<{
    subscription_id: string;
    ok: boolean;
    error?: string;
  }>;
};

/**
 * Cancel every active Stripe subscription for a Veroax user. Uses
 * the user's stripe_customer_id from profiles (preferred) and falls
 * back to the subscriptions table when the customer ID is missing.
 * Safe to call when the user has no subscriptions.
 */
export async function cancelStripeSubscriptionsForUser(
  userId: string,
): Promise<StripeCancelResult> {
  const result: StripeCancelResult = {
    attempted: false,
    cancelled_count: 0,
    details: [],
  };

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return result;
  }
  const admin = createServiceRoleClient();

  // Gather every subscription we know about for this user from our
  // own table. The webhook keeps this in sync, so this should match
  // Stripe's reality in most cases.
  const { data: rows } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due", "incomplete"]);
  const subscriptionIds = (rows ?? [])
    .map((r) => (r as { stripe_subscription_id: string }).stripe_subscription_id)
    .filter(Boolean);

  if (subscriptionIds.length === 0) {
    return result;
  }

  result.attempted = true;
  const stripe = new Stripe(secret);
  for (const subId of subscriptionIds) {
    try {
      await stripe.subscriptions.cancel(subId, {
        invoice_now: false,
        prorate: false,
      });
      // Mirror the cancel locally so /admin/users sees it instantly
      // (the Stripe webhook will eventually overwrite this with the
      // canonical state, but this avoids a confusing race in the UI).
      await admin
        .from("subscriptions")
        .update({ status: "canceled", cancel_at_period_end: false })
        .eq("stripe_subscription_id", subId);
      result.cancelled_count += 1;
      result.details.push({ subscription_id: subId, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[userLifecycle] stripe.subscriptions.cancel failed for ${subId}:`,
        err,
      );
      result.details.push({ subscription_id: subId, ok: false, error: message });
    }
  }

  return result;
}

export type StorageCleanupResult = {
  attempted: boolean;
  removed_count: number;
  error?: string;
};

/**
 * Delete every storage object under disclosures/{user_id}/. Used
 * during the hard-delete flow so we don't leak buyer PII in
 * orphaned PDFs after a user is removed.
 */
export async function deleteUserStorageFolder(
  userId: string,
): Promise<StorageCleanupResult> {
  const admin = createServiceRoleClient();
  const folder = userId; // disclosures bucket is keyed by user_id directly
  try {
    const { data: listed, error: listErr } = await admin.storage
      .from("disclosures")
      .list(folder, { limit: 1000 });
    if (listErr) {
      return { attempted: true, removed_count: 0, error: listErr.message };
    }
    if (!listed || listed.length === 0) {
      return { attempted: true, removed_count: 0 };
    }
    // Each list result returns the immediate children. We need to
    // descend one level for the per-report subfolders.
    const allPaths: string[] = [];
    for (const top of listed) {
      // If this is a folder (no metadata.size), recurse one level.
      const isFolder =
        (top as { id?: string | null } | undefined)?.id == null ||
        (top as { metadata?: { size?: number } | null } | undefined)?.metadata
          ?.size == null;
      if (isFolder) {
        const sub = await admin.storage
          .from("disclosures")
          .list(`${folder}/${top.name}`, { limit: 1000 });
        for (const child of sub.data ?? []) {
          allPaths.push(`${folder}/${top.name}/${child.name}`);
        }
      } else {
        allPaths.push(`${folder}/${top.name}`);
      }
    }
    if (allPaths.length === 0) {
      return { attempted: true, removed_count: 0 };
    }
    const { error: rmErr } = await admin.storage
      .from("disclosures")
      .remove(allPaths);
    if (rmErr) {
      return {
        attempted: true,
        removed_count: 0,
        error: rmErr.message,
      };
    }
    return { attempted: true, removed_count: allPaths.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { attempted: true, removed_count: 0, error: message };
  }
}
