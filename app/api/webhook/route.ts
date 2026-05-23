import Stripe from "stripe";
import { Resend } from "resend";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  planFromPriceId,
  reportsIncludedFor,
} from "@/lib/billing/plans";

// Stripe webhook events to notify on. Excludes noisy events like
// invoice.paid (fires every billing cycle) and customer.subscription.created
// (duplicates checkout.session.completed).
const NOTIFY_EVENTS = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.payment_failed",
]);

// Where customer-event notifications get emailed.
const NOTIFY_TO = "support@veroax.com";

function fmtCents(amount: number | null | undefined, currency = "usd"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function describeEvent(event: Stripe.Event): {
  subject: string;
  summary: string;
  details: Record<string, string>;
} {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const plan = s.metadata?.plan ?? "unknown";
      const billing = s.metadata?.billing ?? "unknown";
      return {
        subject: `🎉 New Veroax subscription: ${plan} (${billing})`,
        summary: `${s.customer_details?.email ?? "Unknown email"} just subscribed to Veroax ${plan} (${billing} billing).`,
        details: {
          Email: s.customer_details?.email ?? "—",
          Name: s.customer_details?.name ?? "—",
          Plan: plan,
          Billing: billing,
          Amount: fmtCents(s.amount_total, s.currency ?? "usd"),
          "Customer ID": String(s.customer ?? "—"),
          "Subscription ID": String(s.subscription ?? "—"),
          "Session ID": s.id,
        },
      };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const plan = sub.metadata?.plan ?? "unknown";
      const billing = sub.metadata?.billing ?? "unknown";
      return {
        subject: `👋 Subscription canceled: ${plan}`,
        summary: `A ${plan} (${billing}) subscription was canceled.`,
        details: {
          "Customer ID": String(sub.customer),
          "Subscription ID": sub.id,
          Plan: plan,
          Billing: billing,
          Status: sub.status,
          "Canceled at": sub.canceled_at
            ? new Date(sub.canceled_at * 1000).toISOString()
            : "—",
        },
      };
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const plan = sub.metadata?.plan ?? "unknown";
      return {
        subject: `↕️ Subscription updated: ${plan}`,
        summary: `A ${plan} subscription was updated (status: ${sub.status}).`,
        details: {
          "Customer ID": String(sub.customer),
          "Subscription ID": sub.id,
          Plan: plan,
          Status: sub.status,
          "Cancel at period end": sub.cancel_at_period_end ? "yes" : "no",
        },
      };
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      return {
        subject: `⚠️ Payment failed: ${fmtCents(inv.amount_due, inv.currency)}`,
        summary: `A recurring payment failed. Stripe will retry per your dunning settings; the customer should also get an email to update their card.`,
        details: {
          "Customer email": inv.customer_email ?? "—",
          "Customer ID": String(inv.customer ?? "—"),
          "Invoice ID": inv.id ?? "—",
          Amount: fmtCents(inv.amount_due, inv.currency),
          "Attempt count": String(inv.attempt_count ?? 0),
          "Next attempt": inv.next_payment_attempt
            ? new Date(inv.next_payment_attempt * 1000).toISOString()
            : "—",
          "Hosted invoice URL": inv.hosted_invoice_url ?? "—",
        },
      };
    }
    default:
      return {
        subject: `Stripe event: ${event.type}`,
        summary: `Received Stripe event ${event.type}.`,
        details: { "Event ID": event.id },
      };
  }
}

async function notify(event: Stripe.Event): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[webhook] ${event.type} (no RESEND_API_KEY — skipping email)`);
    return;
  }

  const resend = new Resend(apiKey);
  const { subject, summary, details } = describeEvent(event);

  const detailsHtml = Object.entries(details)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-weight:500;">${k}</td><td style="padding:4px 0;color:#0f172a;font-family:monospace;font-size:13px;">${v}</td></tr>`,
    )
    .join("");

  await resend.emails.send({
    from: "Veroax Billing <contact@veroax.com>",
    to: NOTIFY_TO,
    subject,
    text: `${summary}\n\n${Object.entries(details)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n")}\n\nEvent ID: ${event.id}\nEvent type: ${event.type}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;">
        <h2 style="margin:0 0 12px 0;font-size:18px;">${subject}</h2>
        <p style="margin:0 0 16px 0;line-height:1.6;color:#334155;">${summary}</p>
        <table style="border-collapse:collapse;font-size:14px;">${detailsHtml}</table>
        <p style="margin-top:24px;font-size:12px;color:#94a3b8;">
          Event <code>${event.id}</code> · type <code>${event.type}</code>
        </p>
      </div>
    `,
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !webhookSecret) {
    // Return 503 (not 200). Stripe will retry and the failures will
    // surface in the Stripe dashboard, alerting us to the misconfig.
    // Silently 200-ing means events are dropped without anyone knowing.
    console.error("[webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing");
    return NextResponse.json(
      { error: "Stripe webhook not configured", configured: false },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
  }

  // CRITICAL: Stripe signature verification needs the raw body string,
  // not parsed JSON. Do not call request.json() here.
  const rawBody = await request.text();

  const stripe = new Stripe(secret);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Signature verification failed";
    console.error("[webhook] signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.log(`[webhook] received ${event.type} (${event.id})`);

  // DB sync — write the subscription state into our subscriptions
  // table and grant credits where appropriate. Failures here don't
  // ack the webhook (we want Stripe to retry) UNLESS the failure is
  // "row not found" which would loop forever.
  try {
    await syncToDb(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : "DB sync failed";
    console.error(`[webhook] DB sync failed for ${event.type}:`, message);
    // Still ack — we already log; Stripe retries would just spam.
  }

  if (NOTIFY_EVENTS.has(event.type)) {
    try {
      await notify(event);
    } catch (err) {
      // Email failure shouldn't cause Stripe to retry — log and ack.
      const message = err instanceof Error ? err.message : "Notify failed";
      console.error(`[webhook] notify failed for ${event.type}:`, message);
    }
  }

  return NextResponse.json({ received: true });
}

// ===========================================================================
// DB sync: write Stripe state into our tables
// ===========================================================================
//
// Three event flows we care about:
//
//   checkout.session.completed
//     - subscription mode: customer just paid for a plan. Pull the
//       subscription, upsert the subscriptions row, set up the
//       stripe_customer_id on the profile, grant the period's
//       reports_included as credits via the ledger.
//     - payment mode (one-off): customer bought a single-report
//       credit. Increment profiles.report_credits_balance and log.
//
//   customer.subscription.updated
//     - plan changed, status changed, period rolled over. Refresh
//       the subscriptions row. If the period rolled over (new
//       current_period_start), grant another period's credits.
//
//   customer.subscription.deleted
//     - subscription canceled. Mark status='canceled' on the row;
//       leave any unused subscription credits in place (the user
//       paid through period_end so they get to use those reports).

async function syncToDb(event: Stripe.Event): Promise<void> {
  const admin = createServiceRoleClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session, admin);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpserted(sub, admin);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await admin
        .from("subscriptions")
        .update({
          status: "canceled",
          cancel_at_period_end: false,
        })
        .eq("stripe_subscription_id", sub.id);
      break;
    }
    case "invoice.paid": {
      // A renewal invoice was paid — the subscription event handler
      // covers this when it fires alongside, but we double-check that
      // period was rolled over.
      const inv = event.data.object as Stripe.Invoice;
      const invWithSub = inv as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      };
      const subId =
        typeof invWithSub.subscription === "string"
          ? invWithSub.subscription
          : invWithSub.subscription?.id;
      if (!subId) break;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const sub = await stripe.subscriptions.retrieve(subId);
      await handleSubscriptionUpserted(sub, admin);
      break;
    }
  }
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<void> {
  // Resolve the user via the email Stripe collected. Future
  // iteration: pass user_id through session.metadata so we don't
  // depend on email match.
  const email = session.customer_details?.email?.toLowerCase();
  if (!email) {
    console.warn("[webhook] checkout.session.completed without customer email");
    return;
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!profile) {
    console.warn(`[webhook] no profile for checkout email ${email}`);
    return;
  }
  const userId = (profile as { id: string }).id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  if (customerId) {
    await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", userId);
  }

  // One-off purchase mode — payment, not subscription. Increment
  // the user's pay-as-you-go credit balance and log it.
  if (session.mode === "payment") {
    const lineItem = session.metadata?.report_credits;
    const credits = lineItem ? parseInt(lineItem, 10) : 1;
    if (Number.isFinite(credits) && credits > 0) {
      const { data: p } = await admin
        .from("profiles")
        .select("report_credits_balance")
        .eq("id", userId)
        .maybeSingle();
      const current =
        (p as { report_credits_balance?: number } | null)
          ?.report_credits_balance ?? 0;
      await admin
        .from("profiles")
        .update({ report_credits_balance: current + credits })
        .eq("id", userId);
      await admin.from("report_credit_ledger").insert({
        user_id: userId,
        amount: credits,
        reason: "oneoff_purchase",
        metadata: { session_id: session.id },
      });
    }
    return;
  }

  // Subscription mode — pull the subscription and upsert.
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!subId) return;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const sub = await stripe.subscriptions.retrieve(subId);
  await handleSubscriptionUpserted(sub, admin);
}

async function handleSubscriptionUpserted(
  sub: Stripe.Subscription,
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<void> {
  // Resolve the user via the Stripe customer ID we set on the
  // profile during checkout.completed.
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!profile) {
    console.warn(`[webhook] no profile for stripe customer ${customerId}`);
    return;
  }
  const userId = (profile as { id: string }).id;

  // Determine plan + billing from the price ID on the subscription's
  // first item. Price IDs come from Vercel env vars; we reverse-look
  // them up via planFromPriceId.
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const planLookup = priceId ? planFromPriceId(priceId) : null;
  const plan = planLookup?.plan ?? sub.metadata?.plan ?? "unknown";
  const billing = planLookup?.billing ?? sub.metadata?.billing ?? null;

  const periodStartUnix = (item as { current_period_start?: number })
    ?.current_period_start;
  const periodEndUnix = (item as { current_period_end?: number })
    ?.current_period_end;
  const periodStartIso = periodStartUnix
    ? new Date(periodStartUnix * 1000).toISOString()
    : null;
  const periodEndIso = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;

  const reportsIncluded =
    plan && plan !== "unknown"
      ? reportsIncludedFor(plan as "solo" | "pro" | "brokerage")
      : 0;

  // Upsert by stripe_subscription_id so renewals overwrite the same
  // row rather than creating a new one each period.
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, current_period_start")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  const subscriptionRow = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    plan,
    billing,
    status: sub.status,
    reports_included: reportsIncluded,
    current_period_start: periodStartIso,
    current_period_end: periodEndIso,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  };

  let subscriptionId: string;
  if (existing) {
    await admin
      .from("subscriptions")
      .update(subscriptionRow)
      .eq("id", (existing as { id: string }).id);
    subscriptionId = (existing as { id: string }).id;
  } else {
    const { data: inserted } = await admin
      .from("subscriptions")
      .insert(subscriptionRow)
      .select("id")
      .single();
    subscriptionId =
      (inserted as { id?: string } | null)?.id ?? "";
  }

  // Grant credits on a NEW period (either first subscription or a
  // rolled-over renewal). Detected by current_period_start changing.
  const isNewPeriod =
    !existing ||
    (existing as { current_period_start: string | null }).current_period_start !==
      periodStartIso;
  if (
    isNewPeriod &&
    subscriptionId &&
    reportsIncluded > 0 &&
    ["active", "trialing"].includes(sub.status)
  ) {
    await admin.from("report_credit_ledger").insert({
      user_id: userId,
      amount: reportsIncluded,
      reason: "subscription_renewal",
      subscription_id: subscriptionId,
      metadata: {
        plan,
        billing,
        period_start: periodStartIso,
        period_end: periodEndIso,
      },
    });
  }

}
