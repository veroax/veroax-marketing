import { NextResponse } from "next/server";
import { sendTransactional } from "@/lib/email/sender";
import { SUPPORT } from "@/lib/site";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

// Public contact form endpoint. Anonymous and unauthenticated by
// design (the form lives on the marketing site). Defended by:
//   - per-IP rate limit (3 per 10 min) to throttle scripted spam
//   - HTML-escaping every user-supplied string before interpolation
//     into the support-team email body
//   - a "company" honeypot field (real users never fill it; bots do)
//
// The email goes to support@veroax.com via Resend. replyTo is set
// to the form-supplied email so we can reply directly.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const limit = rateLimit({
    key: ip,
    scope: "contact",
    max: 3,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests. Try again in a few minutes.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    email?: unknown;
    message?: unknown;
    company?: unknown; // honeypot
  };

  // Honeypot. Bots commonly fill every visible field; users do not
  // see this one. Treat a populated honeypot as a successful no-op
  // so the bot does not retry.
  if (typeof body.company === "string" && body.company.length > 0) {
    return NextResponse.json({ success: true });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "All fields are required." },
      { status: 400 },
    );
  }
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }
  if (message.length < 10) {
    return NextResponse.json(
      { error: "Please add a few more sentences so we can help." },
      { status: 400 },
    );
  }
  if (message.length > 5000) {
    return NextResponse.json(
      { error: "Message is too long. Trim it to under 5,000 characters." },
      { status: 400 },
    );
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessageHtml = escapeHtml(message).replace(/\n/g, "<br />");

  // replyTo override: support staff want to reply directly to the
  // user. The From: stays as the canonical noreply@ sender.
  const result = await sendTransactional({
    to: SUPPORT.email,
    replyTo: email,
    subject: `New message from ${name.slice(0, 80)}`,
    text: `Name: ${name}\nEmail: ${email}\nFrom IP: ${ip}\n\n${message}`,
    html: `
      <p><strong>Name:</strong> ${safeName}</p>
      <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
      <p style="color:#888;font-size:11px;">IP: ${escapeHtml(ip)}</p>
      <hr />
      <p>${safeMessageHtml}</p>
    `,
  });

  if (result.skipped) {
    console.error("[contact] RESEND_API_KEY missing");
    return NextResponse.json(
      { error: "Email sender is not configured. Please email support directly." },
      { status: 503 },
    );
  }
  if (!result.ok) {
    console.error("[contact] resend send failed:", result.error);
    return NextResponse.json(
      { error: result.error ?? "Send failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
