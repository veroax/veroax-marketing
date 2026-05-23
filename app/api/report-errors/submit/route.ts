import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { Resend } from "resend";

// POST /api/report-errors/submit
// Body: { report_id?: string, email: string, phone?: string,
//         categories: string[], message?: string }
//
// Public endpoint. Anonymous users on the /r/{code} share view can
// submit; signed-in agents on the dashboard submit with their user_id
// attached automatically. Either way we email support@veroax.com so
// the admin sees the ticket immediately.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone =
    typeof body?.phone === "string" ? body.phone.trim() : null;
  const categories = Array.isArray(body?.categories)
    ? body.categories.filter((c: unknown): c is string => typeof c === "string")
    : [];
  const message =
    typeof body?.message === "string" ? body.message.trim() : null;
  const reportId =
    typeof body?.report_id === "string" ? body.report_id.trim() : null;

  if (!email || !email.includes("@")) {
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

  // Resolve the user if signed in — auto-attaches their user_id to
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
  // shouldn't fail the user's submission.
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      const reportLink = reportId
        ? `${SITE_URL}/dashboard/reports/${reportId}`
        : "(no report ID)";
      const adminLink = `${SITE_URL}/admin/report-errors`;
      await resend.emails.send({
        from: "Veroax Feedback <contact@veroax.com>",
        to: "support@veroax.com",
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
    }
  } catch (err) {
    console.error("[report-errors] notify failed:", err);
  }

  return NextResponse.json({
    ok: true,
    submission_id: (inserted as { id: string }).id,
  });
}
