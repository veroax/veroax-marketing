import { NextResponse } from "next/server";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import {
  ReportPDF,
  type AgentBranding,
  type OriginalFile,
} from "@/lib/pdf-render/ReportPDF";
import type { ReportData } from "@/lib/anthropic/schema";

// POST /api/reports/[id]/email/send
//
// Two dispatch paths driven by `via`:
//
//  - via='mailto': the agent's own email client will send the message.
//    We never see the actual send. We just log the draft to
//    email_drafts so there's an audit trail of what the agent
//    intended to send.
//
//  - via='resend': we render the report PDF and send the message
//    through Resend with the PDF attached, from the agent's
//    profile email. Less personal than mailto but useful when the
//    agent wants to skip switching apps.
//
// In both cases the email_drafts row records recipient + subject +
// body. The 'resend' row also gets sent_at + sent_via='resend'. The
// 'mailto' row gets sent_via='mailto' but sent_at stays null (we
// don't actually know if the agent followed through).

// PDF rendering for the resend path can take a few seconds.
export const maxDuration = 60;

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

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
    .select("id, status, report_data, property_address, report_name, client_name, original_files")
    .eq("id", reportId)
    .maybeSingle();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
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
  if (!report.report_data) {
    return NextResponse.json(
      { error: "Cannot attach a report that hasn't finished analysis yet." },
      { status: 409 },
    );
  }

  // Re-render the PDF for the attachment. Same logic as
  // /api/reports/[id]/pdf — we don't want to fetch from ourselves
  // (cookie/auth handoff would be fragile).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, brokerage, dre_license, brokerage_dre, phone, display_email, brokerage_logo_url, headshot_url, brand_accent_hex, tagline, website_url, office_address")
    .eq("id", user.id)
    .maybeSingle();

  // Same hard requirement as /pdf — name/DRE/brokerage must appear
  // on the cover, so we won't send a report missing any of them.
  const missing: string[] = [];
  if (!profile?.full_name?.trim()) missing.push("full name");
  if (!profile?.dre_license?.trim()) missing.push("DRE license");
  if (!profile?.brokerage?.trim()) missing.push("brokerage");
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Complete your agent profile before sending reports — missing ${missing.join(", ")}. Visit /dashboard/settings to add them.`,
      },
      { status: 412 },
    );
  }

  const displayEmail = (
    profile as { display_email?: string | null } | null
  )?.display_email?.trim();

  const pBrand = profile as {
    brokerage_dre?: string | null;
    brokerage_logo_url?: string | null;
    headshot_url?: string | null;
    brand_accent_hex?: string | null;
    tagline?: string | null;
    website_url?: string | null;
    office_address?: string | null;
  } | null;

  const agent: AgentBranding = {
    fullName: profile?.full_name ?? null,
    brokerage: profile?.brokerage ?? null,
    dreLicense: profile?.dre_license ?? null,
    brokerageDre: pBrand?.brokerage_dre ?? null,
    phone: profile?.phone ?? null,
    email: displayEmail || user.email || null,
    brokerageLogoUrl: pBrand?.brokerage_logo_url ?? null,
    headshotUrl: pBrand?.headshot_url ?? null,
    brandAccentHex: pBrand?.brand_accent_hex ?? null,
    tagline: pBrand?.tagline ?? null,
    websiteUrl: pBrand?.website_url ?? null,
    officeAddress: pBrand?.office_address ?? null,
  };

  const reportData = report.report_data as ReportData;
  const propertyAddress =
    reportData.property_snapshot?.address ??
    report.property_address ??
    "Disclosure Analysis";

  const reportName =
    typeof (report as { report_name?: unknown }).report_name === "string"
      ? ((report as { report_name?: string }).report_name as string)
      : null;
  const clientName =
    typeof (report as { client_name?: unknown }).client_name === "string"
      ? ((report as { client_name?: string }).client_name as string)
      : null;

  const originalFilesRaw = (report as { original_files?: unknown }).original_files;
  const originalFiles: OriginalFile[] | null = Array.isArray(originalFilesRaw)
    ? (originalFilesRaw as unknown[])
        .filter(
          (e): e is OriginalFile =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as { name?: unknown }).name === "string",
        )
        .map((e) => ({
          name: (e as OriginalFile).name,
          pages: Number((e as OriginalFile).pages) || 0,
          size_kb: Number((e as OriginalFile).size_kb) || 0,
        }))
    : null;

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderToBuffer(
      <ReportPDF
        report={reportData}
        property={propertyAddress}
        agent={agent}
        reportId={reportId}
        generatedAt={new Date()}
        originalFiles={originalFiles}
        reportName={reportName}
        clientName={clientName}
      />,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF render failed.";
    return NextResponse.json(
      { error: `Could not render PDF for attachment: ${message}` },
      { status: 500 },
    );
  }

  const filename = pdfFilename(propertyAddress);
  const resend = new Resend(process.env.RESEND_API_KEY);
  // We send from a Veroax-controlled address (Resend won't deliver
  // from a domain you don't own). The reply-to is the agent's own
  // email so client responses go directly to them, not to support.
  const fromEmail = process.env.VEROAX_EMAIL_FROM || "Veroax <reports@veroax.com>";

  try {
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: recipient,
      // Prefer the agent's display email so client replies route to
      // their client-facing address rather than the signup mailbox.
      replyTo: displayEmail || user.email || undefined,
      subject,
      text: bodyPlain || stripHtml(bodyHtml),
      html: bodyHtml || `<pre>${escapeHtml(bodyPlain)}</pre>`,
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
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
    // 200 with a warning — undeliverable side effects aren't worth
    // failing the caller after the email already went out.
    return NextResponse.json({
      ok: true,
      via: "resend",
      warning: `Email sent, but draft log failed: ${insertErr.message}`,
    });
  }

  return NextResponse.json({ ok: true, draft_id: draftRow.id, via: "resend" });
}

function pdfFilename(propertyAddress: string): string {
  const safe = propertyAddress
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 80);
  return `${safe || "Veroax_Report"}_Disclosure_Analysis.pdf`;
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
