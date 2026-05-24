import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require";

// GET /api/stripe-health
//
// Returns presence (boolean) of every required env var. Never
// returns the actual secret values, but the SET of configured keys
// is itself a backend fingerprint that an attacker could use to
// guide further probing. So the route is admin-gated.
//
// Also returns whether the active Stripe secret is a TEST or LIVE
// key (sk_test_* vs sk_live_*) so the admin can tell at a glance
// which environment the deployment is wired to.

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const stripeSecret = process.env.STRIPE_SECRET_KEY ?? "";
  const stripeMode = stripeSecret.startsWith("sk_test_")
    ? "test"
    : stripeSecret.startsWith("sk_live_")
      ? "live"
      : "unset_or_invalid";

  return NextResponse.json({
    ok: Boolean(stripeSecret),
    stripe_mode: stripeMode,
    keys: {
      STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Boolean(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      ),
      STRIPE_PRICE_SOLO_MONTHLY: Boolean(process.env.STRIPE_PRICE_SOLO_MONTHLY),
      STRIPE_PRICE_SOLO_ANNUAL: Boolean(process.env.STRIPE_PRICE_SOLO_ANNUAL),
      STRIPE_PRICE_PRO_MONTHLY: Boolean(process.env.STRIPE_PRICE_PRO_MONTHLY),
      STRIPE_PRICE_PRO_ANNUAL: Boolean(process.env.STRIPE_PRICE_PRO_ANNUAL),
      STRIPE_PRICE_BROKERAGE_MONTHLY: Boolean(
        process.env.STRIPE_PRICE_BROKERAGE_MONTHLY,
      ),
      STRIPE_PRICE_BROKERAGE_ANNUAL: Boolean(
        process.env.STRIPE_PRICE_BROKERAGE_ANNUAL,
      ),
      STRIPE_PRICE_ONEOFF_REPORT: Boolean(process.env.STRIPE_PRICE_ONEOFF_REPORT),
      STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
      ADMIN_ALERT_EMAILS: Boolean(process.env.ADMIN_ALERT_EMAILS),
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
    },
  });
}
