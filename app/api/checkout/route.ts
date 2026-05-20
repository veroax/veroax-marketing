import Stripe from "stripe";
import { NextResponse } from "next/server";

// Map of plan + billing period to env var holding the Stripe Price ID.
// Keeping the lookup explicit (rather than computed) avoids accidental
// exposure of unrelated env vars via crafted query strings.
const PRICE_ID_ENV: Record<string, string> = {
  "solo:monthly": "STRIPE_PRICE_SOLO_MONTHLY",
  "solo:annual": "STRIPE_PRICE_SOLO_ANNUAL",
  "pro:monthly": "STRIPE_PRICE_PRO_MONTHLY",
  "pro:annual": "STRIPE_PRICE_PRO_ANNUAL",
};

function getOrigin(request: Request): string {
  // Prefer the forwarded host (Vercel sets these) so success_url points at the
  // production domain when running behind the proxy.
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }
  return url.origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");
  const billing = url.searchParams.get("billing") ?? "monthly";

  if (!plan || !["solo", "pro"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }
  if (!["monthly", "annual"].includes(billing)) {
    return NextResponse.json({ error: "Invalid billing period." }, { status: 400 });
  }

  const priceEnvName = PRICE_ID_ENV[`${plan}:${billing}`];
  const priceId = priceEnvName ? process.env[priceEnvName] : undefined;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  // Graceful fallback: if either secret or Price ID is missing on this
  // environment, bounce the user to the contact section so the page never
  // 500s in production while the env vars are still being provisioned.
  if (!secretKey || !priceId) {
    const origin = getOrigin(request);
    return NextResponse.redirect(`${origin}/#contact`, { status: 303 });
  }

  const stripe = new Stripe(secretKey);
  const origin = getOrigin(request);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      billing_address_collection: "required",
      allow_promotion_codes: true,
      // Enable once Stripe Tax is configured in the dashboard.
      // automatic_tax: { enabled: true },
      metadata: {
        plan,
        billing,
      },
      subscription_data: {
        metadata: {
          plan,
          billing,
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe session created without URL." },
        { status: 500 },
      );
    }

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create checkout session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
