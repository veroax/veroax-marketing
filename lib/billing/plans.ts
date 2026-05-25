// Plan tier definitions, the single source of truth for what each
// plan includes and what it costs. Edit the price IDs in Vercel env
// vars; everything else (display, profitability math, overage
// pricing, marketing copy via PLAN_TIERS) lives here.
//
// PRICING RATIONALE (do not change these numbers without re-doing
// the ladder math; see below):
//
//   Pay-as-you-go ($69/report, no subscription): priced at a
//     premium to the cheapest plan's per-report cost so that any
//     repeat user has a rational reason to upgrade to a plan. Sits
//     above Solo's effective $49 for one report. Aimed at the
//     curious agent doing one or two deals a year, NOT at regular
//     users.
//
//   Solo ($49/mo, 1 report included, $59 overage): for the indie
//     agent who closes one to three deals a month and wants
//     predictable budget. Per-report cost works out to $49 to $58
//     depending on volume, which beats PAYG for any subscriber
//     using their included report.
//
//   Pro ($149/mo, 8 reports included, $35 overage): for the busy
//     solo or 2-3 agent team. Per-report cost works out to $18.60
//     all-included, a 73% per-unit discount vs. PAYG and the
//     largest jump in the ladder. This is the "popular" tier for
//     individual subscribers.
//
//   Team ($449/mo list, 30 reports included, 10 seats, $25 overage):
//     formerly the "Brokerage" tier; renamed in the 0021 schema
//     restructure when "Brokerage" graduated to a custom-priced top
//     tier. Sized for a small office or 4-10 producing agents
//     pooling a shared report quota. Per-report cost works out to
//     $14.97 all-included.
//
//   Brokerage (custom, site-admin-managed): unlimited teams +
//     agents, per-brokerage allocation negotiated with the founder
//     and stored on public.brokerages (agent_seat_limit,
//     reports_per_month, per_report_overage_cents). NOT self-serve;
//     no Stripe price; checkout is closed. Marketed as "Contact us"
//     on the pricing page. Site admin onboards each brokerage by
//     hand via /admin/brokerages.
//
// Break-even math (number of reports per month at which each plan
// beats PAYG):
//   Solo beats PAYG at any volume (the $49 plan price is already
//     less than 1 PAYG charge at $69)
//   Pro beats Solo from report 5+
//   Team beats Pro from report 18+
//
// All prices are illustrative; the actual Stripe prices are set in
// the Stripe dashboard and referenced here by env-var ID. Editing
// the numbers below does NOT change what customers are charged.
// Update Stripe AND update these numbers together, or the
// profitability math on /admin/users will be wrong.

export type PlanId = "solo" | "pro" | "team" | "brokerage";
export type BillingPeriod = "monthly" | "annual";

export type PlanTier = {
  id: PlanId;
  label: string;
  // Short tagline shown on the pricing card.
  tagline: string;
  // How many reports the subscription includes per billing period.
  reportsIncluded: number;
  // Price per additional report once the included quota is used up
  // in the current billing period. Read by /admin/users
  // profitability math AND surfaced in marketing copy (single
  // source of truth so the homepage and FAQ can never drift).
  overageUsd: number;
  // How many seats / agents the plan supports. 1 for solo, larger
  // tiers permit more agents under the same billing account.
  seats: number;
  // Display prices. The Stripe price IDs (via env vars) are the
  // authoritative source of what the customer pays; these are for
  // the pricing-page UI AND the profitability calculations on
  // /admin/users. Keep aligned with Stripe at all times.
  priceMonthlyUsd: number;
  priceAnnualUsd: number;
  // Bullet points shown on the pricing card.
  features: string[];
  // Most-popular highlight on the pricing card.
  highlight?: boolean;
  // Custom-priced tier (no public price; "Contact us" CTA). The
  // Brokerage tier is the only one that sets this today. Custom
  // tiers do NOT participate in self-serve Stripe checkout; site
  // admin sets up the brokerage row + invite by hand.
  isCustom?: boolean;
};

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "solo",
    label: "Solo Agent",
    tagline: "For indie agents doing one to three deals a month.",
    reportsIncluded: 1,
    overageUsd: 59,
    seats: 1,
    priceMonthlyUsd: 49,
    priceAnnualUsd: 480, // $40/mo on annual; saves $108 vs monthly
    features: [
      "1 disclosure analysis / month",
      "$59 per additional report",
      "Branded PDF + public web-share link",
      "Email + dashboard summary",
      "30-day free re-analysis window",
      "Click-to-source for every finding",
    ],
  },
  {
    id: "pro",
    label: "Professional",
    tagline: "For busy solo agents.",
    reportsIncluded: 8,
    overageUsd: 35,
    seats: 1,
    priceMonthlyUsd: 149,
    priceAnnualUsd: 1488, // $124/mo on annual; saves $300 vs monthly
    highlight: true,
    features: [
      "8 disclosure analyses / month",
      "$35 per additional report",
      "Solo seat (no team)",
      "All Solo features",
      "Custom brokerage colors + logo",
      "Priority email support",
    ],
  },
  {
    id: "team",
    label: "Team",
    tagline: "Pool a shared monthly quota across 10 agents.",
    reportsIncluded: 30,
    overageUsd: 25,
    seats: 10,
    priceMonthlyUsd: 449,
    priceAnnualUsd: 4490,
    features: [
      "30 disclosure analyses / month, pooled team-wide",
      "$25 per additional report",
      "Up to 10 agent seats",
      "Team dashboard with shared report visibility",
      "Team owner + admin roles, agent invites",
      "All Professional features",
    ],
  },
  {
    id: "brokerage",
    label: "Brokerage",
    tagline:
      "Unlimited teams and agents under one custom contract.",
    reportsIncluded: 0,
    overageUsd: 0,
    seats: 0,
    priceMonthlyUsd: 0,
    priceAnnualUsd: 0,
    isCustom: true,
    features: [
      "Unlimited teams and direct agents",
      "Per-brokerage allocation (custom seats + reports)",
      "Brokerage logo + DRE on every PDF cover",
      "Site-admin onboarding, dedicated CSM",
      "Custom contract; per-report overage negotiated",
      "Single point of billing for the whole office",
    ],
  },
];

// Env-var lookup map for Stripe price IDs. Set these in Vercel.
// Missing values gracefully degrade, checkout falls back to the
// contact section and pricing page shows "contact us" instead of
// a checkout button.
//
// NOTE: the Brokerage tier does NOT appear here because it is not
// self-serve; checkout for plan=brokerage is rejected upstream.
export const PRICE_ID_ENV: Record<string, string> = {
  "solo:monthly": "STRIPE_PRICE_SOLO_MONTHLY",
  "solo:annual": "STRIPE_PRICE_SOLO_ANNUAL",
  "pro:monthly": "STRIPE_PRICE_PRO_MONTHLY",
  "pro:annual": "STRIPE_PRICE_PRO_ANNUAL",
  "team:monthly": "STRIPE_PRICE_TEAM_MONTHLY",
  "team:annual": "STRIPE_PRICE_TEAM_ANNUAL",
};

// Backwards-compat: during the 0021 rename window, allow the old
// STRIPE_PRICE_BROKERAGE_* env vars to satisfy the "team" tier so
// the user can update Vercel at their own pace. priceIdFor checks
// the new name first, then this map as a fallback.
const LEGACY_PRICE_ID_ENV: Record<string, string> = {
  "team:monthly": "STRIPE_PRICE_BROKERAGE_MONTHLY",
  "team:annual": "STRIPE_PRICE_BROKERAGE_ANNUAL",
};

// Pay-as-you-go single-report purchase price ID. Same env-var
// pattern but only one (no billing-period concept for a one-off).
export const ONEOFF_REPORT_PRICE_ENV = "STRIPE_PRICE_ONEOFF_REPORT";

// Display price for the one-off (pay-as-you-go) purchase. Set
// deliberately ABOVE Solo's per-report cost so the pricing ladder
// always favors a subscription for repeat use. See top-of-file
// pricing rationale.
export const ONEOFF_REPORT_PRICE_USD = 69;

// Resolve plan + billing -> Stripe price ID via env var. Returns
// null when the env var isn't set (pricing-page UI shows "contact
// us" in that case rather than 500ing the checkout flow). The
// Brokerage tier always returns null because it is not self-serve.
export function priceIdFor(
  plan: PlanId,
  billing: BillingPeriod,
): string | null {
  if (plan === "brokerage") return null;
  const key = `${plan}:${billing}`;
  const envName = PRICE_ID_ENV[key];
  const id = envName ? process.env[envName] : undefined;
  if (id?.trim()) return id.trim();
  // Fall through to the legacy env var name during the rename.
  const legacyEnvName = LEGACY_PRICE_ID_ENV[key];
  const legacyId = legacyEnvName ? process.env[legacyEnvName] : undefined;
  return legacyId?.trim() ? legacyId.trim() : null;
}

// Reverse lookup, when the webhook receives a Stripe event with a
// price ID, map back to the plan. Used to populate the
// subscriptions.plan column. Checks the legacy env vars too so a
// webhook for an existing brokerage-priced subscription still
// resolves to plan=team.
export function planFromPriceId(
  priceId: string,
): { plan: PlanId; billing: BillingPeriod } | null {
  for (const key of Object.keys(PRICE_ID_ENV)) {
    const envName = PRICE_ID_ENV[key];
    if (process.env[envName] === priceId) {
      const [plan, billing] = key.split(":") as [PlanId, BillingPeriod];
      return { plan, billing };
    }
  }
  for (const key of Object.keys(LEGACY_PRICE_ID_ENV)) {
    const envName = LEGACY_PRICE_ID_ENV[key];
    if (process.env[envName] === priceId) {
      const [plan, billing] = key.split(":") as [PlanId, BillingPeriod];
      return { plan, billing };
    }
  }
  return null;
}

export function reportsIncludedFor(plan: PlanId): number {
  return PLAN_TIERS.find((t) => t.id === plan)?.reportsIncluded ?? 0;
}

// Lookup: overage USD per plan. Used by the admin profitability
// math and surfaced in marketing copy so the homepage / FAQ can
// never drift from the underlying number.
export function overagePriceFor(plan: PlanId): number {
  return PLAN_TIERS.find((t) => t.id === plan)?.overageUsd ?? 0;
}
