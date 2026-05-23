import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/billing/portal
//
// Creates a Stripe Customer Portal session for the signed-in user
// and redirects them to it. The portal handles all the things we
// don't want to build ourselves: update payment method, view past
// invoices, cancel/upgrade, change billing email. Stripe maintains
// the UI; we just have to create the session.
//
// Prerequisites:
//   - User signed in with a Veroax account.
//   - profiles.stripe_customer_id populated (set by the webhook on
//     first successful checkout).
//
// Failure modes:
//   - Not signed in: 401.
//   - No stripe_customer_id yet: 409 with a hint that the user
//     hasn't started a subscription.
//   - Stripe portal isn't configured in the dashboard: Stripe
//     returns an error which we surface to the user.

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  const customerId =
    typeof (profile as { stripe_customer_id?: string } | null)
      ?.stripe_customer_id === "string"
      ? ((profile as { stripe_customer_id: string }).stripe_customer_id ?? null)
      : null;
  if (!customerId) {
    return NextResponse.json(
      {
        error:
          "No Stripe customer on file yet. Start a subscription first from the pricing page.",
      },
      { status: 409 },
    );
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe is not configured on this environment." },
      { status: 500 },
    );
  }

  const stripe = new Stripe(secret);
  const url = new URL(request.url);
  const origin =
    request.headers.get("x-forwarded-host")
      ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("x-forwarded-host")}`
      : url.origin;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard/billing`,
    });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not open billing portal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
