import { NextResponse } from "next/server";
import { sendTransactional } from "@/lib/email/sender";
import { SUPPORT } from "@/lib/site";

// Diagnostic endpoint: sends a single test email via Resend so we can
// verify the email path in isolation from Stripe webhooks. Returns
// the Resend message ID (or error) so misconfigurations surface in
// plain HTTP without needing log access.
//
// Auth: requires ?key=<EMAIL_TEST_KEY> matching the env var of the
// same name, so this endpoint isn't a free email-blast vector.
//
// Goes through sendTransactional so the From: and Reply-To: match
// the rest of the app. If verification is broken on the canonical
// noreply@ sender, this is the first place it'll show up.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const provided = url.searchParams.get("key");
  const expected = process.env.EMAIL_TEST_KEY;

  if (!expected) {
    return NextResponse.json(
      { error: "EMAIL_TEST_KEY not configured on this environment." },
      { status: 503 },
    );
  }
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await sendTransactional({
    to: SUPPORT.email,
    subject: "Veroax email diagnostic, please ignore",
    text: "If you received this, the Resend email pipeline is working.",
    html: "<p>If you received this, the Resend email pipeline is working.</p>",
  });

  if (result.skipped) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured." },
      { status: 500 },
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: result.id });
}
