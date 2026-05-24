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
//     largest jump in the ladder. This is the "popular" tier.
//
//   Brokerage ($449/mo list, 30 reports included, $25 overage):
//     for a brokerage covering its agents centrally. Per-report
//     cost works out to $14.97 all-included, an 80% per-unit
//     discount vs. PAYG, plus team seats and white-label. Marketed
//     as "Custom" on the homepage so we can negotiate per deal.
//
// Break-even math (number of reports per month at which each plan
// beats PAYG):
//   Solo beats PAYG at any volume (the $49 plan price is already
//     less than 1 PAYG charge at $69)
//   Pro beats Solo from report 5+
//   Brokerage beats Pro from report 18+
//
// All prices are illustrative; the actual Stripe prices are set in
// the Stripe dashboard and referenced here by env-var ID. Editing
// the numbers below does NOT change what customers are charged.
// Update Stripe AND update these numbers together, or the
// profitability math on /admin/users will be wrong.

export type PlanId = "solo" | "pro" | "brokerage";
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
    label: "Pro",
    tagline: "For busy solos and small teams.",
    reportsIncluded: 8,
    overageUsd: 35,
    seats: 3,
    priceMonthlyUsd: 149,
    priceAnnualUsd: 1488, // $124/mo on annual; saves $300 vs monthly
    highlight: true,
    features: [
      "8 disclosure analyses / month",
      "$35 per additional report",
      "3 agent seats included",
      "All Solo features",
      "Custom brokerage colors + logo",
      "Priority email support",
    ],
  },
  {
    id: "brokerage",
    label: "Brokerage",
    tagline: "Centralized billing for the whole office.",
    reportsIncluded: 30,
    overageUsd: 25,
    seats: 25,
    priceMonthlyUsd: 449,
    priceAnnualUsd: 4490, // marketed as "Custom" on the homepage
    features: [
      "30 disclosure analyses / month",
      "$25 per additional report",
      "25 agent seats included",
      "All Pro features",
      "White-label PDF + brokerage-wide dashboard",
      "Onboarding call + dedicated CSM",
    ],
  },
];

// Env-var lookup map for Stripe price IDs. Set these in Vercel.
// Missing values gracefully degrade, checkout falls back to the
// contact section and pricing page shows "contact us" instead of
// a checkout button.
export const PRICE_ID_ENV: Record<string, string> = {
  "solo:monthly": "STRIPE_PRICE_SOLO_MONTHLY",
  "solo:annual": "STRIPE_PRICE_SOLO_ANNUAL",
  "pro:monthly": "STRIPE_PRICE_PRO_MONTHLY",
  "pro:annual": "STRIPE_PRICE_PRO_ANNUAL",
  "brokerage:monthly": "STRIPE_PRICE_BROKERAGE_MONTHLY",
  "brokerage:annual": "STRIPE_PRICE_BROKERAGE_ANNUAL",
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
// us" in that case rather than 500ing the checkout flow).
export function priceIdFor(
  plan: PlanId,
  billing: BillingPeriod,
): string | null {
  const envName = PRICE_ID_ENV[`${plan}:${billing}`];
  const id = envName ? process.env[envName] : undefined;
  return id?.trim() ? id.trim() : null;
}

// Reverse lookup, when the webhook receives a Stripe event with a
// price ID, map back to the plan. Used to populate the
// subscriptions.plan column.
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
