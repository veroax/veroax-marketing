import { NextResponse } from "next/server";

// Returns presence (boolean) of each required Stripe env var.
// Never returns the values — safe to call from any client.
export async function GET() {
  return NextResponse.json({
    ok: Boolean(process.env.STRIPE_SECRET_KEY),
    keys: {
      STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Boolean(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      ),
      STRIPE_PRICE_SOLO_MONTHLY: Boolean(process.env.STRIPE_PRICE_SOLO_MONTHLY),
      STRIPE_PRICE_SOLO_ANNUAL: Boolean(process.env.STRIPE_PRICE_SOLO_ANNUAL),
      STRIPE_PRICE_PRO_MONTHLY: Boolean(process.env.STRIPE_PRICE_PRO_MONTHLY),
      STRIPE_PRICE_PRO_ANNUAL: Boolean(process.env.STRIPE_PRICE_PRO_ANNUAL),
      STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
}
