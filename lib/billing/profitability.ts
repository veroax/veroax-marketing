// Per-user profitability math: what they paid us, what their
// reports cost us, and the resulting margin.
//
// PAID side:
//   - Subscription revenue:
//       monthly plans: $price for each full or partial month the
//         subscription has been active.
//       annual plans:  the annual price counted once when the period
//         is current, prorated across the 12 months.
//     We use lib/billing/plans.PLAN_TIERS as the source of truth for
//     price (env-var Stripe prices are authoritative but we don't
//     have them at lookup time without a Stripe API roundtrip; the
//     PLAN_TIERS prices match by convention).
//   - One-off purchases:
//       For each report_credit_ledger row with reason='oneoff_purchase'
//       we charge ONEOFF_REPORT_PRICE_USD per credit.
//
// COST side:
//   - For each audit_log row with event_type IN
//     ('report.analyzed', 'report.updated') we read metadata.input_tokens
//     and metadata.output_tokens, and compute Anthropic cost using
//     Sonnet 4.5 rates: $3/MTok input, $15/MTok output.
//   - Reports that never produced an analyzed audit row (failed,
//     stale-swept, etc) contribute zero cost; that's the right behavior.
//
// LIMITATIONS we accept on purpose for v1:
//   - Cache-hit input tokens are billed cheaper by Anthropic; we don't
//     differentiate. Overestimates cost (conservative is fine here).
//   - Annual subs are spread evenly across the period; partial-month
//     start dates aren't prorated to the day.
//   - Refunds aren't subtracted (we don't track them yet).
//
// Numbers are returned in CENTS to avoid float drift. Convert to
// dollars at the rendering edge with formatUsdCents().

import { PLAN_TIERS, ONEOFF_REPORT_PRICE_USD } from "./plans";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Anthropic Sonnet 4.5 list prices (per million tokens).
const COST_INPUT_PER_MTOK_USD = 3.0;
const COST_OUTPUT_PER_MTOK_USD = 15.0;

export type ProfitabilityPeriod = "lifetime" | "this_month";

export type ProfitabilityRow = {
  user_id: string;
  // Paid + cost both in cents.
  paid_cents: number;
  cost_cents: number;
  margin_cents: number;
  // Tally helpers.
  report_count: number;
  free_report_count: number; // reports where status='qa_pending|...' and the user is VIP or has trial credits
};

/** Format a cents integer as a USD string like "$12.34" or "$1,250.00". */
export function formatUsdCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Per-user margin label: "Profitable" / "Break-even" / "Unprofitable". */
export function marginLabel(row: ProfitabilityRow): {
  label: "Profitable" | "Break-even" | "Unprofitable" | "No activity";
  tone: "green" | "amber" | "red" | "muted";
} {
  if (row.paid_cents === 0 && row.cost_cents === 0) {
    return { label: "No activity", tone: "muted" };
  }
  if (row.margin_cents > 500) {
    // $5+ margin
    return { label: "Profitable", tone: "green" };
  }
  if (row.margin_cents < -100) {
    // costs us $1+ more than paid
    return { label: "Unprofitable", tone: "red" };
  }
  return { label: "Break-even", tone: "amber" };
}

type SubscriptionRow = {
  user_id: string;
  plan: string;
  billing: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string | null;
};

type LedgerRow = {
  user_id: string;
  amount: number; // credits granted
  reason: string;
  created_at: string;
};

type AnalyzedAuditRow = {
  user_id: string | null;
  metadata: {
    input_tokens?: number;
    output_tokens?: number;
  } | null;
  created_at: string;
};

function planPriceUsd(plan: string, billing: string | null): number {
  const tier = PLAN_TIERS.find((t) => t.id === plan);
  if (!tier) return 0;
  return billing === "annual"
    ? tier.priceAnnualUsd
    : tier.priceMonthlyUsd;
}

function monthsBetween(startIso: string | null, endIso: string): number {
  if (!startIso) return 0;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (end <= start) return 0;
  return (end - start) / (30.44 * 24 * 60 * 60 * 1000);
}

function isInThisMonth(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

function startOfThisMonthIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

function paidCentsForSubscription(
  sub: SubscriptionRow,
  period: ProfitabilityPeriod,
  nowIso: string,
): number {
  const monthlyUsd =
    sub.billing === "annual"
      ? planPriceUsd(sub.plan, "annual") / 12
      : planPriceUsd(sub.plan, "monthly");

  if (period === "this_month") {
    // Active this month? Anything that overlaps [start-of-month, now].
    const startMonthIso = startOfThisMonthIso();
    const subStart = sub.current_period_start || sub.created_at;
    const subEnd = sub.current_period_end || nowIso;
    if (!subStart) return 0;
    const startMs = new Date(subStart).getTime();
    const endMs = new Date(subEnd).getTime();
    const monthStartMs = new Date(startMonthIso).getTime();
    const monthEndMs = new Date(nowIso).getTime();
    const overlap =
      Math.max(0, Math.min(endMs, monthEndMs) - Math.max(startMs, monthStartMs));
    if (overlap === 0) return 0;
    // 1 month proxy = 30.44 days.
    const monthly = monthlyUsd;
    const ratio = Math.min(
      1,
      overlap / (30.44 * 24 * 60 * 60 * 1000),
    );
    return Math.round(monthly * ratio * 100);
  }

  // Lifetime: count months from subscription start to now (or end).
  const startIso = sub.created_at;
  const endIso =
    sub.current_period_end &&
    new Date(sub.current_period_end).getTime() < Date.now()
      ? sub.current_period_end
      : nowIso;
  const months = monthsBetween(startIso, endIso);
  return Math.round(monthlyUsd * months * 100);
}

function paidCentsForLedger(
  rows: LedgerRow[],
  period: ProfitabilityPeriod,
): number {
  let cents = 0;
  for (const r of rows) {
    if (r.reason !== "oneoff_purchase") continue;
    if (period === "this_month" && !isInThisMonth(r.created_at)) continue;
    cents += Math.max(0, r.amount) * ONEOFF_REPORT_PRICE_USD * 100;
  }
  return cents;
}

function costCentsForAudit(
  rows: AnalyzedAuditRow[],
  period: ProfitabilityPeriod,
): number {
  let cents = 0;
  for (const r of rows) {
    if (period === "this_month" && !isInThisMonth(r.created_at)) continue;
    const meta = r.metadata ?? {};
    const inT = Math.max(0, meta.input_tokens ?? 0);
    const outT = Math.max(0, meta.output_tokens ?? 0);
    const usd =
      (inT / 1_000_000) * COST_INPUT_PER_MTOK_USD +
      (outT / 1_000_000) * COST_OUTPUT_PER_MTOK_USD;
    cents += Math.round(usd * 100);
  }
  return cents;
}

/**
 * Compute profitability for many users in one shot.
 *
 * Returns a Map<user_id, ProfitabilityRow> for the requested period.
 * Use lifetime for the user-list summary and this_month for the
 * "how are we doing this month?" view.
 */
export async function computeProfitabilityForUsers(opts: {
  userIds: string[];
  period: ProfitabilityPeriod;
}): Promise<Map<string, ProfitabilityRow>> {
  const { userIds, period } = opts;
  const result = new Map<string, ProfitabilityRow>();
  if (userIds.length === 0) return result;

  const admin = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  // 1. Subscriptions for the cohort.
  const subResp = await admin
    .from("subscriptions")
    .select(
      "user_id, plan, billing, status, current_period_start, current_period_end, created_at",
    )
    .in("user_id", userIds);
  const subs = ((subResp.data ?? []) as SubscriptionRow[]).filter(
    (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due",
  );

  // 2. Ledger entries (one-off purchases).
  const ledgerResp = await admin
    .from("report_credit_ledger")
    .select("user_id, amount, reason, created_at")
    .in("user_id", userIds);
  const ledger = (ledgerResp.data ?? []) as LedgerRow[];

  // 3. Cost audit rows (report.analyzed / report.updated).
  const auditResp = await admin
    .from("audit_log")
    .select("user_id, metadata, created_at, event_type")
    .in("user_id", userIds);
  const auditRowsAll = (auditResp.data ?? []) as Array<
    AnalyzedAuditRow & { event_type: string }
  >;
  const audit = auditRowsAll.filter(
    (a) => a.event_type === "report.analyzed" || a.event_type === "report.updated",
  );

  // Per-user bucket math.
  for (const userId of userIds) {
    const userSubs = subs.filter((s) => s.user_id === userId);
    const userLedger = ledger.filter((l) => l.user_id === userId);
    const userAudit = audit.filter((a) => a.user_id === userId);

    let paid = 0;
    for (const s of userSubs) {
      paid += paidCentsForSubscription(s, period, nowIso);
    }
    paid += paidCentsForLedger(userLedger, period);

    const cost = costCentsForAudit(userAudit, period);

    // "free reports" = analyzed reports whose user has had admin-grant
    // credits applied or whose audit doesn't tie back to a paying period.
    // For v1 we count the admin_grant ledger entries directly: that's
    // the value the founder cares about ("who's been comp'd").
    const freeCount = userLedger
      .filter((l) => l.reason === "admin_grant")
      .filter((l) => period === "lifetime" || isInThisMonth(l.created_at))
      .reduce((acc, l) => acc + Math.max(0, l.amount), 0);

    const reportCount = userAudit.filter(
      (a) => period === "lifetime" || isInThisMonth(a.created_at),
    ).length;

    result.set(userId, {
      user_id: userId,
      paid_cents: paid,
      cost_cents: cost,
      margin_cents: paid - cost,
      report_count: reportCount,
      free_report_count: freeCount,
    });
  }

  return result;
}

/** Fetch one user's active subscription summary for display. */
export async function getActiveSubscription(opts: {
  userId: string;
}): Promise<{
  plan: string;
  billing: string | null;
  status: string;
  monthly_usd: number;
  current_period_end: string | null;
} | null> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("subscriptions")
    .select("plan, billing, status, current_period_end, created_at")
    .eq("user_id", opts.userId)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as Array<{
    plan: string;
    billing: string | null;
    status: string;
    current_period_end: string | null;
  }>;
  if (rows.length === 0) return null;
  const r = rows[0];
  const monthly =
    r.billing === "annual"
      ? planPriceUsd(r.plan, "annual") / 12
      : planPriceUsd(r.plan, "monthly");
  return {
    plan: r.plan,
    billing: r.billing,
    status: r.status,
    monthly_usd: monthly,
    current_period_end: r.current_period_end,
  };
}

/** Fetch active subscriptions for a cohort of users, by user_id. */
export async function getActiveSubscriptionsForUsers(opts: {
  userIds: string[];
}): Promise<Map<string, { plan: string; billing: string | null; status: string }>> {
  const result = new Map<string, { plan: string; billing: string | null; status: string }>();
  if (opts.userIds.length === 0) return result;
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("subscriptions")
    .select("user_id, plan, billing, status, created_at")
    .in("user_id", opts.userIds)
    .in("status", ["active", "trialing", "past_due"]);
  const rows = (data ?? []) as Array<{
    user_id: string;
    plan: string;
    billing: string | null;
    status: string;
    created_at: string | null;
  }>;
  // Keep the most recent active sub if a user has more than one row.
  const sorted = rows.sort((a, b) => {
    const av = a.created_at ?? "";
    const bv = b.created_at ?? "";
    return av < bv ? 1 : -1;
  });
  for (const r of sorted) {
    if (!result.has(r.user_id)) {
      result.set(r.user_id, { plan: r.plan, billing: r.billing, status: r.status });
    }
  }
  return result;
}
