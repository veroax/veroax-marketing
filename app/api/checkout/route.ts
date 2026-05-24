import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { priceIdFor, ONEOFF_REPORT_PRICE_ENV } from "@/lib/billing/plans";

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

  // Resolve the signed-in user. Required: anonymous checkout creates
  // an orphan payment because the webhook has no Veroax profile to
  // attach the subscription to. Unauthenticated callers get bounced
  // to /signup with a next-param that brings them back here after
  // email confirmation. Returning users see the same redirect; /signup
  // has a prominent "Already have an account? Log in" link that
  // preserves the next-param.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const origin = getOrigin(request);

  if (!user) {
    // Preserve the full checkout URL (with plan + billing) so the
    // post-signup redirect sends the user right back to where they
    // intended to go.
    const checkoutPath = `/api/checkout${url.search}`;
    const signupUrl = new URL("/signup", origin);
    signupUrl.searchParams.set("next", checkoutPath);
    return NextResponse.redirect(signupUrl.toString(), { status: 303 });
  }

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
        // SECURITY: pass user.id through both client_reference_id
        // (Stripe-native field, propagates to every event) and
        // session.metadata.user_id (redundant defense). The webhook
        // matches on these first and falls back to email only when
        // both are absent. Prevents the "I paid with the victim's
        // email at Stripe checkout to grant them credits" attack.
        ...(user?.id
          ? {
              client_reference_id: user.id,
              metadata: {
                purchase_type: "oneoff_report",
                report_credits: "1",
                user_id: user.id,
              },
            }
          : {
              metadata: {
                purchase_type: "oneoff_report",
                report_credits: "1",
              },
            }),
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

  // Single source of truth for plan -> Stripe price id resolution.
  // Lives in lib/billing/plans so the checkout route and any other
  // call site (admin tools, scripts) can never drift.
  const priceId = priceIdFor(plan as "solo" | "pro" | "brokerage", billing as "monthly" | "annual");

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
      // SECURITY: pass user.id through client_reference_id AND
      // metadata.user_id. The webhook matches on these first so a
      // signed-in user paying with someone else's email at the
      // Stripe checkout page cannot redirect credits to that
      // someone else. See the one-off block for the same pattern.
      ...(user?.id ? { client_reference_id: user.id } : {}),
      metadata: {
        plan,
        billing,
        ...(user?.id ? { user_id: user.id } : {}),
      },
      subscription_data: {
        metadata: {
          plan,
          billing,
          ...(user?.id ? { user_id: user.id } : {}),
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
