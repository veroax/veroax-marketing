// Plan tier definitions — single source of truth for what each plan
// includes. Edit the price IDs in Vercel env vars; everything else
// lives here.
//
// Pricing rationale (sensible defaults the founder can adjust):
// - Solo: $49/mo or $490/yr (10mo effective on annual = ~17% discount),
//   3 reports/month. Right for an indie agent doing 1-3 deals/month.
// - Pro: $149/mo or $1490/yr, 10 reports/month. Right for a busy
//   solo or a 2-3 agent team.
// - Brokerage: $449/mo or $4490/yr, 40 reports/month, multi-user.
//   Right for a small brokerage covering its agents centrally.
// - Pay-as-you-go: $25/report, one-off purchase. Right for the
//   curious agent who doesn't want a subscription.
//
// All prices are illustrative — actual Stripe prices are set in the
// Stripe dashboard and referenced here by env-var ID. Editing the
// numbers below does NOT change what customers are charged.

export type PlanId = "solo" | "pro" | "brokerage";
export type BillingPeriod = "monthly" | "annual";

export type PlanTier = {
  id: PlanId;
  label: string;
  // Short tagline shown on the pricing card.
  tagline: string;
  // How many reports the subscription includes per billing period.
  reportsIncluded: number;
  // How many seats / agents the plan supports. 1 for solo, larger
  // tiers permit more agents under the same billing account.
  seats: number;
  // Display prices. The Stripe price IDs (via env vars) are the
  // authoritative source of what the customer pays; these are for
  // the pricing-page UI.
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
    tagline: "For indie agents doing 1-3 deals a month.",
    reportsIncluded: 3,
    seats: 1,
    priceMonthlyUsd: 49,
    priceAnnualUsd: 490,
    features: [
      "3 disclosure analyses / month",
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
    reportsIncluded: 10,
    seats: 3,
    priceMonthlyUsd: 149,
    priceAnnualUsd: 1490,
    highlight: true,
    features: [
      "10 disclosure analyses / month",
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
    reportsIncluded: 40,
    seats: 25,
    priceMonthlyUsd: 449,
    priceAnnualUsd: 4490,
    features: [
      "40 disclosure analyses / month",
      "25 agent seats included",
      "All Pro features",
      "Brokerage-wide reporting dashboard",
      "Onboarding call + dedicated CSM",
    ],
  },
];

// Env-var lookup map for Stripe price IDs. Set these in Vercel.
// Missing values gracefully degrade — checkout falls back to the
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

// Display price for the one-off purchase. Set in the dashboard;
// shown on the pricing page below the subscription tiers.
export const ONEOFF_REPORT_PRICE_USD = 25;

// Resolve plan + billing → Stripe price ID via env var. Returns
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

// Reverse lookup — when the webhook receives a Stripe event with a
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
