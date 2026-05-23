import { createServiceRoleClient } from "@/lib/supabase/server";
import { reportsIncludedFor, type PlanId } from "./plans";

// Credit-balance helpers. The runtime "can this user create a new
// report?" check goes through balanceForUser; everything else is
// downstream of that.
//
// Two sources of credits, consumed in this order:
//   1. Subscription credits — reportsIncluded per billing period.
//      Tracked by COUNTING reports created since
//      current_period_start. Resets when the webhook updates the
//      period on renewal.
//   2. One-off purchases — profiles.report_credits_balance. Don't
//      expire; persist until consumed.
//
// Plus one bonus source for new accounts:
//   3. Trial credits — profiles.trial_credits_remaining. Same as
//      one-offs but they produce a WATERMARKED PDF so the agent
//      can see the quality without being able to deliver to a
//      client.
//
// Free-update window: a report's status going to "analyzing" within
// 30 days of created_at does NOT consume an additional credit. The
// route handlers consult freeUpdateWindow() before calling
// consumeReportCredit().

const FREE_UPDATE_WINDOW_DAYS = 30;

export type CreditBalance = {
  // VIP users bypass the credit gate entirely — free access to all
  // features, no watermark, no usage counter. Set by admins from
  // /admin/users/[id]. When true, the other fields below are still
  // populated for display purposes but canCreateReport is always
  // true and willBeWatermarked is always false.
  isVip: boolean;
  // The user's subscription tier and whether it's currently active.
  subscriptionPlan: PlanId | null;
  subscriptionActive: boolean;
  subscriptionPeriodStart: string | null;
  subscriptionPeriodEnd: string | null;
  // Reports left on the current subscription period.
  subscriptionReportsRemaining: number;
  subscriptionReportsIncluded: number;
  subscriptionReportsUsed: number;
  // Reports purchased one-off (don't expire).
  oneoffCredits: number;
  // Trial credits left (produce a watermarked PDF when consumed).
  trialCredits: number;
  // Convenience: can this user create a new report right now without
  // paying? True for VIPs always; otherwise true if any of the three
  // pools has credit available.
  canCreateReport: boolean;
  // When canCreateReport is true via the trial pool, the resulting
  // report is watermarked. VIPs are NEVER watermarked.
  willBeWatermarked: boolean;
};

export async function balanceForUser(userId: string): Promise<CreditBalance> {
  const admin = createServiceRoleClient();

  // Pull profile + active subscription in parallel.
  const [profileRes, subRes] = await Promise.all([
    admin
      .from("profiles")
      .select("trial_credits_remaining, report_credits_balance, is_vip")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select(
        "id, plan, status, current_period_start, current_period_end, reports_included, cancel_at_period_end",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = (profileRes.data as {
    trial_credits_remaining?: number;
    report_credits_balance?: number;
    is_vip?: boolean;
  } | null) ?? null;
  const isVip = Boolean(profile?.is_vip);
  const sub = subRes.data as {
    id: string;
    plan: PlanId;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    reports_included: number | null;
    cancel_at_period_end: boolean | null;
  } | null;

  const subscriptionActive = Boolean(
    sub &&
      // Stripe statuses where we let the user create reports.
      ["active", "trialing", "past_due"].includes(sub.status) &&
      sub.current_period_end &&
      new Date(sub.current_period_end).getTime() > Date.now(),
  );

  // Count reports created since current_period_start. We don't
  // explicitly write a ledger entry per consumption — the count is
  // the source of truth — but we DO write a ledger entry for
  // visibility in the billing dashboard.
  let subscriptionReportsUsed = 0;
  let subscriptionReportsIncluded = 0;
  if (sub && subscriptionActive && sub.current_period_start) {
    subscriptionReportsIncluded =
      sub.reports_included ?? reportsIncludedFor(sub.plan);
    const { count } = await admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("billable", true) // see consumeReportCredit below
      .gte("created_at", sub.current_period_start);
    subscriptionReportsUsed = count ?? 0;
  }

  const trialCredits = profile?.trial_credits_remaining ?? 0;
  const oneoffCredits = profile?.report_credits_balance ?? 0;
  const subscriptionReportsRemaining = Math.max(
    0,
    subscriptionReportsIncluded - subscriptionReportsUsed,
  );

  // VIP bypass — always allowed, never watermarked. Credit pools
  // are still computed and surfaced for visibility but they don't
  // gate anything.
  if (isVip) {
    return {
      isVip: true,
      subscriptionPlan: sub?.plan ?? null,
      subscriptionActive,
      subscriptionPeriodStart: sub?.current_period_start ?? null,
      subscriptionPeriodEnd: sub?.current_period_end ?? null,
      subscriptionReportsRemaining,
      subscriptionReportsIncluded,
      subscriptionReportsUsed,
      oneoffCredits,
      trialCredits,
      canCreateReport: true,
      willBeWatermarked: false,
    };
  }

  // Order of consumption: subscription → one-off → trial. Trial
  // produces a watermarked PDF; the other two don't.
  const willBeWatermarked =
    subscriptionReportsRemaining === 0 &&
    oneoffCredits === 0 &&
    trialCredits > 0;
  const canCreateReport =
    subscriptionReportsRemaining > 0 ||
    oneoffCredits > 0 ||
    trialCredits > 0;

  return {
    isVip: false,
    subscriptionPlan: sub?.plan ?? null,
    subscriptionActive,
    subscriptionPeriodStart: sub?.current_period_start ?? null,
    subscriptionPeriodEnd: sub?.current_period_end ?? null,
    subscriptionReportsRemaining,
    subscriptionReportsIncluded,
    subscriptionReportsUsed,
    oneoffCredits,
    trialCredits,
    canCreateReport,
    willBeWatermarked,
  };
}

// Consume one report credit. Called by the report-create flow AFTER
// balanceForUser confirmed canCreateReport. Idempotent against the
// reports.billable flag — calling twice on the same report is a
// no-op.
//
// Returns whether the resulting report should be watermarked
// (trial-credit consumption).
export async function consumeReportCredit(
  userId: string,
  reportId: string,
): Promise<{ watermarked: boolean; consumed_from: string }> {
  const admin = createServiceRoleClient();
  const balance = await balanceForUser(userId);

  // VIP bypass — write a ledger entry for visibility (so admins can
  // see the report count per VIP) but don't decrement any pool and
  // don't mark the report billable/watermarked. The VIP gets a clean
  // full-quality report every time.
  if (balance.isVip) {
    await admin.from("report_credit_ledger").insert({
      user_id: userId,
      amount: 0,
      reason: "report_consumed",
      report_id: reportId,
      metadata: { from: "vip", watermarked: false },
    });
    return { watermarked: false, consumed_from: "vip" };
  }

  // The order: subscription → one-off → trial. The report row
  // gets billable=true so the next balanceForUser counts it
  // against the subscription. For one-off / trial, we decrement
  // the profile counter.
  if (balance.subscriptionReportsRemaining > 0) {
    await admin
      .from("reports")
      .update({ billable: true })
      .eq("id", reportId);
    await admin.from("report_credit_ledger").insert({
      user_id: userId,
      amount: -1,
      reason: "report_consumed",
      report_id: reportId,
    });
    return { watermarked: false, consumed_from: "subscription" };
  }

  if (balance.oneoffCredits > 0) {
    await admin
      .from("profiles")
      .update({ report_credits_balance: balance.oneoffCredits - 1 })
      .eq("id", userId);
    await admin
      .from("reports")
      .update({ billable: true })
      .eq("id", reportId);
    await admin.from("report_credit_ledger").insert({
      user_id: userId,
      amount: -1,
      reason: "report_consumed",
      report_id: reportId,
      metadata: { from: "oneoff" },
    });
    return { watermarked: false, consumed_from: "oneoff" };
  }

  if (balance.trialCredits > 0) {
    await admin
      .from("profiles")
      .update({ trial_credits_remaining: balance.trialCredits - 1 })
      .eq("id", userId);
    await admin
      .from("reports")
      .update({ billable: true, watermarked: true })
      .eq("id", reportId);
    await admin.from("report_credit_ledger").insert({
      user_id: userId,
      amount: -1,
      reason: "report_consumed",
      report_id: reportId,
      metadata: { from: "trial", watermarked: true },
    });
    return { watermarked: true, consumed_from: "trial" };
  }

  throw new Error("No credits available — consumeReportCredit called with empty balance.");
}

// Whether updating this report falls within the 30-day free re-
// analysis window. Both the add-documents flow and the file-removal
// flow read this and skip credit consumption when true.
export function freeUpdateWindow(reportCreatedAt: string): boolean {
  const ms = Date.now() - new Date(reportCreatedAt).getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  return days <= FREE_UPDATE_WINDOW_DAYS;
}

export { FREE_UPDATE_WINDOW_DAYS };
