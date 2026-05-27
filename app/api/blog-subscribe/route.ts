// POST /api/blog-subscribe
// Body: { email: string, source?: string }
//
// Lightweight subscribe endpoint. Forwards the new subscriber via
// Resend to support@veroax.com so the founder can manually add them
// to a mailing list (or hook up a real audience later). Keeps a one-
// shot acknowledgement email going back to the subscriber so they
// know the form actually worked.
//
// No database write. No PII at rest. If the founder later wants a
// subscribers table, swap the body of this handler to also write
// there. The form contract on the client stays the same.

import { NextResponse } from "next/server";
import { sendTransactional } from "@/lib/email/sender";
import { SUPPORT } from "@/lib/site";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Crude per-IP token bucket. Process-local; resets on cold start.
// Good enough to stop dumb scripted spam without adding a DB or
// edge-runtime KV. If the deployment scales horizontally, this
// becomes per-instance which is fine for a low-traffic blog form.
const RATE_BUCKET = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRate(ip: string): boolean {
  const now = Date.now();
  const list = (RATE_BUCKET.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return false;
  list.push(now);
  RATE_BUCKET.set(ip, list);
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!checkRate(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    source?: string;
    // Honeypot. Real users never fill this; bots commonly do.
    company?: string;
  };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const source =
    typeof body.source === "string" && body.source.length < 80
      ? body.source.trim()
      : "blog";

  // Honeypot: if a hidden "company" field is populated, treat as
  // bot traffic. Return 200 so the bot does not retry, but do not
  // actually email anyone.
  if (body.company && body.company.length > 0) {
    return NextResponse.json({ ok: true });
  }

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    // 1) Notify support of the new subscriber.
    const adminResult = await sendTransactional({
      to: SUPPORT.email,
      subject: `New blog subscriber: ${email}`,
      html: `
        <p>A new Veroax blog subscriber:</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Source:</strong> ${escapeHtml(source)}</p>
        <p><strong>IP:</strong> ${escapeHtml(ip)}</p>
        <p style="color:#888;font-size:12px;">
          Add them to your real mailing list when you are ready.
          This endpoint does not persist anything server-side.
        </p>
      `,
    });
    if (adminResult.skipped) {
      console.error("[blog-subscribe] RESEND_API_KEY missing");
      return NextResponse.json(
        { error: "Subscribe is not configured on this deployment yet." },
        { status: 503 },
      );
    }
    if (!adminResult.ok) {
      throw new Error(adminResult.error ?? "Subscribe send failed");
    }

    // 2) Send a friendly acknowledgement back to the subscriber so
    //    they know the form worked.
    await sendTransactional({
      to: email,
      subject: "You are on the Veroax blog list",
      html: `
        <p>Thanks for subscribing to the Veroax blog.</p>
        <p>
          We send a short note when a new disclosure-analysis playbook
          or California real-estate piece goes live. No more than once
          a week, usually less.
        </p>
        <p>
          If you have a topic you want us to cover, just reply to this
          email. A real person reads every reply.
        </p>
        <p>Veroax<br/>${SUPPORT.email}</p>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[blog-subscribe] resend failed:", err);
    const message = err instanceof Error ? err.message : "Subscribe failed.";
    return NextResponse.json(
      { error: `Could not record your subscription: ${message}` },
      { status: 500 },
    );
  }
}
