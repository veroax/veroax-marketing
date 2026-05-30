import { NextResponse } from "next/server";
import type { ReportData } from "@/lib/anthropic/schema";
import { requireUser } from "@/lib/auth/require";

// POST /api/reports/[id]/email/draft
//
// Repositioned product behavior: the agent's analysis is the agent's
// PREP TOOL, not something to forward to the buyer. This endpoint
// produces a BRIEF email summary the agent uses to invite the
// conversation with their client, NOT a delivery vehicle for the
// analysis itself. The full report stays with the agent; the email
// is the invitation.
//
// Returns:
//   {
//     recipient_suggestion: string | null,
//     subject: string,
//     body_plain: string,
//     body_html: string,
//   }
//
// What's in the email:
//   - A friendly greeting (uses the client's first name when available)
//   - One sentence acknowledging the analysis is complete
//   - One sentence with the overall rating + finding-count signal
//   - A clear CTA inviting the client to reply / schedule a call
//   - Optional scheduling URL line from the agent's profile
//   - Signature from profile (full name, brokerage, DRE, phone, email)
//
// What's intentionally NOT in the email:
//   - Specific findings (titles, descriptions, source quotes)
//   - Cost exposure numbers
//   - Talking points narrative
//   - "PDF attached" language; the send route no longer attaches
//     the PDF either
//   - "Prepared for {client}" label

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { data: report, error } = await supabase
    .from("reports")
    .select("id, status, report_data, property_address, report_name, client_name")
    .eq("id", reportId)
    .maybeSingle();
  if (error || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (!report.report_data) {
    return NextResponse.json(
      { error: "Report has no analysis yet, wait for analysis to complete." },
      { status: 409 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, brokerage, dre_license, phone, display_email, email_signature, scheduling_url")
    .eq("id", user.id)
    .maybeSingle();

  const signatureEmail =
    (profile as { display_email?: string | null } | null)?.display_email
      ?.trim() || user.email || null;

  const customSignature = (
    profile as { email_signature?: string | null } | null
  )?.email_signature?.trim();

  const schedulingUrl = (
    profile as { scheduling_url?: string | null } | null
  )?.scheduling_url?.trim();

  const reportData = report.report_data as ReportData;
  const address =
    reportData.property_snapshot?.address?.trim() ||
    report.property_address ||
    "the property";

  const clientName =
    typeof (report as { client_name?: string | null }).client_name === "string"
      ? ((report as { client_name?: string }).client_name as string).trim()
      : null;

  // Aggregate counts only, never the finding list itself. The email
  // tells the client "there's stuff to talk about" without spoiling
  // the conversation the agent wants to have in person.
  const criticalCount = reportData.critical_findings?.length ?? 0;
  const moderateCount = reportData.moderate_findings?.length ?? 0;
  const overallRating = reportData.overall_rating?.label ?? null;

  // -------- Subject -----------------------------------------------
  const subject = `Disclosure review for ${address}`;

  // -------- Greeting ---------------------------------------------
  const greeting = clientName ? `Hi ${firstName(clientName)},` : "Hi,";

  // -------- Signal sentence ---------------------------------------
  // Builds a single non-spoiler line that signals how much there is
  // to talk about. Examples:
  //   "There are 2 critical items and 4 moderate items I'd like to
  //    walk you through."
  //   "The package came back clean overall, with a few moderate
  //    items worth discussing."
  const findingsSignal = composeFindingsSignal({
    criticalCount,
    moderateCount,
    overallRating,
  });

  // -------- Signoff ----------------------------------------------
  const signoff = customSignature ?? formatSignoff(profile, signatureEmail);
  const schedulingLine = schedulingUrl
    ? `Schedule a call: ${schedulingUrl}`
    : null;

  // -------- Plain-text body --------------------------------------
  const bodyPlain = [
    greeting,
    "",
    `I just finished reviewing the disclosure package on ${address}.`,
    "",
    findingsSignal,
    "",
    "Reply to this email or give me a call when you have a few minutes and we'll walk through the specifics together. There are some details that are better discussed live than read in an email.",
    "",
    ...(schedulingLine ? [schedulingLine, ""] : []),
    signoff,
  ].join("\n");

  // -------- HTML body --------------------------------------------
  const signoffHtml = customSignature
    ? escapeHtml(customSignature).replace(/\n/g, "<br>")
    : formatSignoffHtml(profile, signatureEmail);

  const bodyHtml = renderHtmlBody({
    greeting,
    address,
    findingsSignal,
    schedulingUrl: schedulingUrl ?? null,
    signoffHtml,
  });

  return NextResponse.json({
    recipient_suggestion: clientName ? `${clientName} <>` : null,
    subject,
    body_plain: bodyPlain,
    body_html: bodyHtml,
  });
}

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------

function firstName(fullName: string): string {
  return fullName.split(/[\s&,]/).filter(Boolean)[0] ?? fullName;
}

/**
 * Build one non-spoiler sentence that signals scope without revealing
 * the actual findings. Tailored to the counts so a clean package
 * reads differently from a heavy one.
 */
function composeFindingsSignal(args: {
  criticalCount: number;
  moderateCount: number;
  overallRating: string | null;
}): string {
  const { criticalCount, moderateCount, overallRating } = args;
  // Critical + moderate together: "X critical and Y moderate items"
  if (criticalCount > 0 && moderateCount > 0) {
    const crit = criticalCount === 1 ? "1 critical item" : `${criticalCount} critical items`;
    const mod = moderateCount === 1 ? "1 moderate item" : `${moderateCount} moderate items`;
    return `There are ${crit} and ${mod} I'd like to walk you through, plus the routine items we'll cover as we go.`;
  }
  // Critical only
  if (criticalCount > 0) {
    const crit = criticalCount === 1 ? "one critical item" : `${criticalCount} critical items`;
    return `There ${criticalCount === 1 ? "is" : "are"} ${crit} that I want to flag for you before we move forward.`;
  }
  // Moderate only
  if (moderateCount > 0) {
    const mod = moderateCount === 1 ? "one moderate item" : `${moderateCount} moderate items`;
    return `The package came back clean on the critical items. There ${moderateCount === 1 ? "is" : "are"} ${mod} worth discussing, plus the standard things we always review on a California disclosure.`;
  }
  // Clean package
  if (overallRating && /excellent|good|acceptable/i.test(overallRating)) {
    return "The package came back clean overall. There are still a few details and standard items I'd like to walk through with you before we make the offer.";
  }
  return "The analysis is ready and there are a few items I'd like to walk through with you before we make the offer.";
}

type ProfileBits = {
  full_name?: string | null;
  brokerage?: string | null;
  dre_license?: string | null;
  phone?: string | null;
} | null;

function formatSignoff(profile: ProfileBits, email: string | null): string {
  const lines: string[] = [];
  if (profile?.full_name) lines.push(profile.full_name);
  if (profile?.brokerage) lines.push(profile.brokerage);
  if (profile?.dre_license) lines.push(`DRE #${profile.dre_license}`);
  if (profile?.phone) lines.push(profile.phone);
  if (email) lines.push(email);
  return lines.length > 0 ? lines.join("\n") : "Your agent";
}

function formatSignoffHtml(profile: ProfileBits, email: string | null): string {
  const lines: string[] = [];
  if (profile?.full_name) {
    lines.push(`<strong>${escapeHtml(profile.full_name)}</strong>`);
  }
  if (profile?.brokerage) lines.push(escapeHtml(profile.brokerage));
  if (profile?.dre_license) lines.push(`DRE #${escapeHtml(profile.dre_license)}`);
  if (profile?.phone) lines.push(escapeHtml(profile.phone));
  if (email) {
    lines.push(`<a href="mailto:${encodeURIComponent(email)}">${escapeHtml(email)}</a>`);
  }
  return lines.length > 0 ? lines.join("<br>") : "Your agent";
}

function renderHtmlBody(params: {
  greeting: string;
  address: string;
  findingsSignal: string;
  schedulingUrl: string | null;
  signoffHtml: string;
}): string {
  const { greeting, address, findingsSignal, schedulingUrl, signoffHtml } =
    params;

  const schedulingHtml = schedulingUrl
    ? `<p style="margin:18px 0 0;color:#334155;">Schedule a call: <a href="${escapeAttr(schedulingUrl)}" style="color:#4338ca;">${escapeHtml(schedulingUrl)}</a></p>`
    : "";

  return `
<div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;font-size:15px;">
  <p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>
  <p style="margin:0 0 14px;">I just finished reviewing the disclosure package on <strong>${escapeHtml(address)}</strong>.</p>
  <p style="margin:0 0 14px;">${escapeHtml(findingsSignal)}</p>
  <p style="margin:0 0 14px;">Reply to this email or give me a call when you have a few minutes and we'll walk through the specifics together. There are some details that are better discussed live than read in an email.</p>
  ${schedulingHtml}
  <p style="margin:24px 0 0;color:#0f172a;">${signoffHtml}</p>
</div>`.trim();
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
