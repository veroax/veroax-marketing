import { Resend } from "resend";
import { NextResponse } from "next/server";

// Diagnostic endpoint: sends a single test email via Resend so we can
// verify the email path in isolation from Stripe webhooks. Returns
// the full Resend response (including any error) so misconfigurations
// surface in plain HTTP without needing log access.
//
// Auth: requires ?key=<EMAIL_TEST_KEY> matching the env var of the
// same name, so this endpoint isn't a free email-blast vector.
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured." },
      { status: 500 },
    );
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: "Veroax Diagnostic <contact@veroax.com>",
    to: "support@veroax.com",
    subject: "Veroax email diagnostic, please ignore",
    text: "If you received this, the Resend email pipeline is working.",
    html: "<p>If you received this, the Resend email pipeline is working.</p>",
  });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: { name: error.name, message: error.message },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
