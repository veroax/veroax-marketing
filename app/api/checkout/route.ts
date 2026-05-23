import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PRICE_ID_ENV, ONEOFF_REPORT_PRICE_ENV } from "@/lib/billing/plans";

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

  // Resolve the signed-in user's email so we can pre-fill Stripe
  // checkout. Webhook also uses email to match the resulting
  // subscription back to the profile row.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const origin = getOrigin(request);

  // ---------- One-off "Pay per report" mode ----------
  // ?plan=oneoff produces a one-time payment for a single report
  // credit. Webhook handler treats session.mode='payment' as the
  // one-off path and increments profiles.report_credits_balance.
  if (plan === "oneoff") {
    const priceId = process.env[ONEOFF_REPORT_PRICE_ENV];
    if (!secretKey || !priceId) {
      return NextResponse.redirect(`${origin}/pricing`, { status: 303 });
    }
    const stripe = new Stripe(secretKey);
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout/cancel`,
        billing_address_collection: "required",
        allow_promotion_codes: true,
        customer_email: user?.email ?? undefined,
        metadata: {
          purchase_type: "oneoff_report",
          report_credits: "1",
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

  // ---------- Subscription mode ----------
  if (!plan || !["solo", "pro", "brokerage"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }
  if (!["monthly", "annual"].includes(billing)) {
    return NextResponse.json({ error: "Invalid billing period." }, { status: 400 });
  }

  const priceEnvName = PRICE_ID_ENV[`${plan}:${billing}`];
  const priceId = priceEnvName ? process.env[priceEnvName] : undefined;

  // Graceful fallback: if either secret or Price ID is missing on this
  // environment, bounce the user to the pricing page (which renders
  // "Contact us" instead of a checkout link when prices aren't set).
  if (!secretKey || !priceId) {
    return NextResponse.redirect(`${origin}/pricing`, { status: 303 });
  }

  const stripe = new Stripe(secretKey);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      billing_address_collection: "required",
      allow_promotion_codes: true,
      // Pre-fill the email when the user is signed in so the webhook
      // can match the subscription back to the profile row.
      customer_email: user?.email ?? undefined,
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
