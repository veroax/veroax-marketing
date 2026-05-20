import Stripe from "stripe";
import { Resend } from "resend";
import { NextResponse } from "next/server";

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
    // Don't 500 — Stripe will retry forever. Return 200 + log so we can
    // diagnose without burning quota.
    console.error("[webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing");
    return NextResponse.json(
      { received: true, configured: false },
      { status: 200 },
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
