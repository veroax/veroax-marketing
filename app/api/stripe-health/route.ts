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
    },
  });
}
