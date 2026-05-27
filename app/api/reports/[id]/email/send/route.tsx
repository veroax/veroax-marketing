import { NextResponse } from "next/server";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  ReportPDF,
  type OriginalFile,
} from "@/lib/pdf-render/ReportPDF";
import {
  resolveReportBranding,
  type BrokerageBranding,
  type TeamBranding,
} from "@/lib/pdf-render/branding";
import type { ReportData } from "@/lib/anthropic/schema";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

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
    .select("id, status, report_data, property_address, report_name, client_name, original_files, watermarked, credit_source, brokerage_id, team_id")
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
  // /api/reports/[id]/pdf, we don't want to fetch from ourselves
  // (cookie/auth handoff would be fragile).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, brokerage, dre_license, brokerage_dre, phone, display_email, brokerage_logo_url, headshot_url, brand_accent_hex, tagline, website_url, office_address, dre_verification_status, dre_verified_at")
    .eq("id", user.id)
    .maybeSingle();

  // Pick up the report's brokerage/team attribution to override
  // agent-level branding on the PDF cover. Mirrors the PDF route.
  const reportBrokerageId =
    (report as { brokerage_id?: string | null }).brokerage_id ?? null;
  const reportTeamId =
    (report as { team_id?: string | null }).team_id ?? null;

  // Same hard requirement as /pdf, name/DRE/brokerage must appear
  // on the cover, so we won't send a report missing any of them.
  const missing: string[] = [];
  if (!profile?.full_name?.trim()) missing.push("full name");
  if (!profile?.dre_license?.trim()) missing.push("DRE license");
  if (!profile?.brokerage?.trim()) missing.push("brokerage");
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Complete your agent profile before sending reports, missing ${missing.join(", ")}. Visit /dashboard/settings to add them.`,
      },
      { status: 412 },
    );
  }

  // Fetch the brokerage + team rows for branding override. Service-role
  // because RLS on these tables is own-row-only for the user-facing
  // path; the agent owns the report, so the elevated lookup is safe.
  let brokerageBranding: BrokerageBranding | null = null;
  let teamBranding: TeamBranding | null = null;
  if (reportBrokerageId || reportTeamId) {
    const adminClient = createServiceRoleClient();
    if (reportBrokerageId) {
      const { data: brokerageRow } = await adminClient
        .from("brokerages")
        .select("name, dre_license, logo_url, brand_accent_hex")
        .eq("id", reportBrokerageId)
        .maybeSingle();
      brokerageBranding = brokerageRow as BrokerageBranding | null;
    }
    if (reportTeamId) {
      const { data: teamRow } = await adminClient
        .from("teams")
        .select("name, logo_url, brand_accent_hex")
        .eq("id", reportTeamId)
        .maybeSingle();
      teamBranding = teamRow as TeamBranding | null;
    }
  }

  const agent = resolveReportBranding({
    profile: profile as Parameters<typeof resolveReportBranding>[0]["profile"],
    brokerage: brokerageBranding,
    team: teamBranding,
    authEmail: user.email ?? null,
  });

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

  // Watermark MUST mirror the /api/reports/[id]/pdf render path.
  // If a trial-credit report is emailed without a watermark, the
  // recipient gets a free unwatermarked PDF, which is a billing leak.
  // Read watermarked from the report row and pass it through. Same
  // mirroring applies to credit_source so the email PDF stays
  // visually identical to the downloaded one (PAYG reports stripped
  // of agent logo / headshot; subscription reports fully branded).
  const watermarked = Boolean(
    (report as { watermarked?: boolean | null }).watermarked,
  );
  const creditSource =
    ((report as { credit_source?: string | null }).credit_source ?? null) as
      | "subscription"
      | "oneoff"
      | "trial"
      | "vip"
      | null;

  // Mirror the auth /pdf and public /r/[code]/pdf routes: if the
  // agent's DRE license isn't currently verified, render the
  // verification-pending stripe on every page. Otherwise an
  // emailed PDF would skip the gate the download path enforces.
  const dreVerificationStatus =
    (profile as { dre_verification_status?: string | null } | null)
      ?.dre_verification_status ?? null;
  const dreVerifiedAt =
    (profile as { dre_verified_at?: string | null } | null)
      ?.dre_verified_at ?? null;
  const verificationPending =
    dreVerificationStatus !== "verified" || !dreVerifiedAt;

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
        watermarked={watermarked}
        verificationPending={verificationPending}
        creditSource={creditSource}
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
      replyTo: agent.email || user.email || undefined,
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
