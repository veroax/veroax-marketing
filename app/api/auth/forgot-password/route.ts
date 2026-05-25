// POST /api/auth/forgot-password
//
// Public, unauthenticated endpoint. Triggers a Supabase password-
// reset email to the supplied address. By design, returns 200 even
// when the email doesn't match any account so attackers can't
// enumerate registered emails.
//
// Body: { email: string }
//
// Rate-limited per IP (3 per 10 min) so attackers can't blast our
// mailer.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = rateLimit({
    key: ip,
    scope: "forgot-password",
    max: 3,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
  };
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const redirectTo = `${SITE_URL}/auth/confirm?next=${encodeURIComponent("/auth/reset-password")}`;

  // We always return 200 to prevent email enumeration. Errors from
  // resetPasswordForEmail (e.g., email doesn't exist) are logged
  // server-side but not surfaced to the client.
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    console.warn("[forgot-password] resetPasswordForEmail error:", error.message);
  }

  return NextResponse.json({ ok: true });
}
