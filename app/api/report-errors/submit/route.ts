import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendTransactional } from "@/lib/email/sender";
import { SUPPORT } from "@/lib/site";
import { rateLimit, clientIp } from "@/lib/server/rateLimit";

// POST /api/report-errors/submit
// Body: { report_id?: string, email: string, phone?: string,
//         categories: string[], message?: string, company?: string }
//
// Public endpoint. Anonymous users on the /r/{code} share view can
// submit; signed-in agents on the dashboard submit with their user_id
// attached automatically. Either way we email support@veroax.com so
// the admin sees the ticket immediately.
//
// Defended against drive-by abuse by:
//   - per-IP rate limit (5 submissions per 10 minutes)
//   - "company" honeypot field
//   - server-side category whitelisting + message length cap

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

const ALLOWED_CATEGORIES = new Set([
  "irrelevant_findings",
  "missed_critical_finding",
  "wrong_unit",
  "incorrect_cost",
  "broken_links",
  "wrong_severity",
  "factual_error",
  "other",
]);

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = rateLimit({
    key: ip,
    scope: "report-errors-submit",
    max: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Try again in a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  const body = await request.json().catch(() => ({}));

  // Honeypot. Silent success so bots don't retry.
  if (typeof body?.company === "string" && body.company.length > 0) {
    return NextResponse.json({ ok: true, submission_id: "honeypot" });
  }
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone =
    typeof body?.phone === "string" ? body.phone.trim() : null;
  const rawCategories = Array.isArray(body?.categories)
    ? body.categories.filter((c: unknown): c is string => typeof c === "string")
    : [];
  // Whitelist categories server-side so a client can't sneak in
  // free-form strings that we then echo into our admin emails.
  const categories: string[] = (rawCategories as string[])
    .filter((c: string) => ALLOWED_CATEGORIES.has(c))
    .slice(0, 8);
  const rawMessage =
    typeof body?.message === "string" ? body.message.trim() : null;
  const message =
    rawMessage && rawMessage.length > 0 ? rawMessage.slice(0, 5000) : null;
  const reportId =
    typeof body?.report_id === "string" ? body.report_id.trim().slice(0, 64) : null;

  if (!email || !email.includes("@") || email.length > 200) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 },
    );
  }
  if (categories.length === 0 && !message) {
    return NextResponse.json(
      { error: "Pick at least one category or write a message." },
      { status: 400 },
    );
  }

  // Resolve the user if signed in, auto-attaches their user_id to
  // the submission. Public/anonymous submitters skip this step.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const admin = createServiceRoleClient();
  const { data: inserted, error: insErr } = await admin
    .from("report_error_submissions")
    .insert({
      report_id: reportId,
      user_id: userId,
      email,
      phone,
      categories,
      message,
      status: "open",
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { error: `Could not record submission: ${insErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // Notify support immediately so the admin can react. Failure here
  // shouldn't fail the user's submission, sendTransactional already
  // swallows + logs internally.
  const reportLink = reportId
    ? `${SITE_URL}/dashboard/reports/${reportId}`
    : "(no report ID)";
  const adminLink = `${SITE_URL}/admin/report-errors`;
  await sendTransactional({
    to: SUPPORT.email,
    subject: `Report error submitted: ${categories.join(", ") || "(no categories)"}`,
    text:
      `A report-error submission just came in.\n\n` +
      `Submitter: ${email}${phone ? ` · ${phone}` : ""}\n` +
      (userId ? `Veroax user_id: ${userId}\n` : "Anonymous submitter\n") +
      `Report: ${reportLink}\n` +
      `Categories: ${categories.join(", ") || "(none)"}\n\n` +
      (message ? `Message:\n${message}\n\n` : "") +
      `Review + grant credit: ${adminLink}`,
  });

  return NextResponse.json({
    ok: true,
    submission_id: (inserted as { id: string }).id,
  });
}
