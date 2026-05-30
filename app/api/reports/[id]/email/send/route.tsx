import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireUser } from "@/lib/auth/require";

// POST /api/reports/[id]/email/send
//
// Two dispatch paths driven by `via`:
//
//  - via='mailto': the agent's own email client will send the message.
//    We never see the actual send. We just log the draft to
//    email_drafts so there's an audit trail of what the agent
//    intended to send.
//
//  - via='resend': we send the message through Resend, from a Veroax-
//    controlled address with Reply-To set to the agent's email.
//
// Repositioned product (no client delivery): the email is a brief
// summary inviting the client to talk; the analysis itself stays
// with the agent. We do NOT attach the PDF. The full report stays
// in the agent's hands. This route previously rendered the PDF on
// every resend; that code path is gone.
//
// In both cases the email_drafts row records recipient + subject +
// body. The 'resend' row also gets sent_at + sent_via='resend'. The
// 'mailto' row gets sent_via='mailto' but sent_at stays null (we
// don't actually know if the agent followed through).

type SendBody = {
  recipient_email?: string;
  subject?: string;
  body_plain?: string;
  body_html?: string;
  via?: "mailto" | "resend";
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const body = (await request.json().catch(() => ({}))) as SendBody;
  const recipient = typeof body.recipient_email === "string" ? body.recipient_email.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const bodyPlain = typeof body.body_plain === "string" ? body.body_plain : "";
  const bodyHtml = typeof body.body_html === "string" ? body.body_html : "";
  const via = body.via === "resend" || body.via === "mailto" ? body.via : null;

  if (!via) {
    return NextResponse.json(
      { error: "via must be 'mailto' or 'resend'." },
      { status: 400 },
    );
  }
  if (!recipient || !EMAIL_REGEX.test(recipient)) {
    return NextResponse.json(
      { error: "A valid recipient email is required." },
      { status: 400 },
    );
  }
  if (!subject) {
    return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  }
  if (!bodyPlain && !bodyHtml) {
    return NextResponse.json({ error: "Email body is empty." }, { status: 400 });
  }

  // Auth-gate report access. RLS on reports enforces ownership; the
  // explicit select gives us a clean 404 path.
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, status, property_address")
    .eq("id", reportId)
    .maybeSingle();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Profile-completeness gate. The signature in the email body uses
  // the agent's full name, DRE license, brokerage, phone, and email.
  // Without at least full_name + dre_license, the email reads as
  // unsigned and undermines trust with the client. We also confirm a
  // usable email exists for the Reply-To header so the client's
  // reply has somewhere to go. Applied to BOTH the mailto and
  // resend paths.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, dre_license, display_email")
    .eq("id", user.id)
    .maybeSingle();
  const profileFullName = (
    profile as { full_name?: string | null } | null
  )?.full_name?.trim();
  const profileDre = (
    profile as { dre_license?: string | null } | null
  )?.dre_license?.trim();
  const profileDisplayEmail = (
    profile as { display_email?: string | null } | null
  )?.display_email?.trim();
  const usableEmail = profileDisplayEmail || user.email || null;
  const missingFields: string[] = [];
  if (!profileFullName) missingFields.push("full name");
  if (!profileDre) missingFields.push("DRE license");
  if (!usableEmail) missingFields.push("email address");
  if (missingFields.length > 0) {
    return NextResponse.json(
      {
        error: `Complete your agent profile before sending emails. Missing: ${missingFields.join(", ")}. Visit /dashboard/settings to add them.`,
      },
      { status: 412 },
    );
  }

  // ---------- mailto path ----------
  // The mail client is the actual sender. We just record what the
  // agent intended so we can show "you emailed Jane on Mar 14" later
  // in the report history.
  if (via === "mailto") {
    const { data: draftRow, error: insertErr } = await supabase
      .from("email_drafts")
      .insert({
        report_id: reportId,
        user_id: user.id,
        recipient_email: recipient,
        subject,
        body: bodyPlain || stripHtml(bodyHtml),
        sent_at: null,
        sent_via: "mailto",
      })
      .select("id")
      .single();
    if (insertErr) {
      return NextResponse.json(
        { error: `Could not log draft: ${insertErr.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, draft_id: draftRow.id, via: "mailto" });
  }

  // ---------- resend path ----------
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email send is not configured on this deployment." },
      { status: 503 },
    );
  }

  // Reply-To uses the agent's profile display_email when set; falls
  // back to their auth email. Both are validated by the gate above.
  const replyToEmail = usableEmail ?? undefined;

  const resend = new Resend(process.env.RESEND_API_KEY);
  // We send from a Veroax-controlled address (Resend won't deliver
  // from a domain you don't own). The reply-to is the agent's own
  // email so client responses go directly to them, not to support.
  const fromEmail = process.env.VEROAX_EMAIL_FROM || "Veroax <reports@veroax.com>";

  try {
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: recipient,
      replyTo: replyToEmail,
      subject,
      text: bodyPlain || stripHtml(bodyHtml),
      html: bodyHtml || `<pre>${escapeHtml(bodyPlain)}</pre>`,
    });
    if (error) {
      return NextResponse.json(
        { error: `Resend rejected the message: ${error.message}` },
        { status: 502 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { data: draftRow, error: insertErr } = await supabase
    .from("email_drafts")
    .insert({
      report_id: reportId,
      user_id: user.id,
      recipient_email: recipient,
      subject,
      body: bodyPlain || stripHtml(bodyHtml),
      sent_at: new Date().toISOString(),
      sent_via: "resend",
    })
    .select("id")
    .single();
  if (insertErr) {
    // Email was sent successfully but our log row failed. Surface a
    // 200 with a warning, undeliverable side effects aren't worth
    // failing the caller after the email already went out.
    return NextResponse.json({
      ok: true,
      via: "resend",
      warning: `Email sent, but draft log failed: ${insertErr.message}`,
    });
  }

  return NextResponse.json({ ok: true, draft_id: draftRow.id, via: "resend" });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
