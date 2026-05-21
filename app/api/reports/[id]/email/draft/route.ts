import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { composeAgentStrengthsAndConcerns } from "@/lib/reports/summary";
import type { ReportData } from "@/lib/anthropic/schema";

// POST /api/reports/[id]/email/draft
//
// Returns a pre-filled subject + body for a client-facing email
// summarizing the report. The body is BRIEF — under 200 words — with
// just the top 3 strengths and top 3 concerns. The agent edits in the
// modal before sending (item 8).
//
// Returns:
//   {
//     recipient_suggestion: string | null,
//     subject: string,
//     body_plain: string,
//     body_html: string,
//   }
//
// The PDF is NOT inlined into body_html — the modal advertises it as
// an attachment, and either the mailto: handler (item 8) or the Resend
// send call attaches the actual PDF bytes.

export async function POST(
  _request: Request,
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
      { error: "Report has no analysis yet — wait for analysis to complete." },
      { status: 409 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, brokerage, dre_license, phone, display_email, email_signature, scheduling_url")
    .eq("id", user.id)
    .maybeSingle();

  // Prefer the agent's display email on the seeded email signature so
  // what the client sees in the email matches what's printed on the
  // PDF cover.
  const signatureEmail =
    (profile as { display_email?: string | null } | null)?.display_email
      ?.trim() || user.email || null;

  // When the agent has saved a custom email signature on /settings,
  // it REPLACES the auto-generated formatSignoff output verbatim.
  // PDF cover always uses the structured Name/Brokerage/DRE fields
  // — only the email signature is overridable.
  const customSignature = (
    profile as { email_signature?: string | null } | null
  )?.email_signature?.trim();

  // Scheduling URL drives an explicit "Schedule a call: {url}" line
  // right before the signature when set.
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

  const { strengths, concerns } = composeAgentStrengthsAndConcerns(reportData);

  // -------- Subject ----------------------------------------------
  const subject = `Disclosure analysis for ${address}`;

  // -------- Plain-text body --------------------------------------
  const greeting = clientName ? `Hi ${firstName(clientName)},` : "Hi,";
  // Custom signature wins; otherwise auto-format from profile fields.
  const signoff = customSignature ?? formatSignoff(profile, signatureEmail);

  // Scheduling line is rendered ABOVE the signature when the agent
  // has saved a scheduling URL. Filtered out of the join when absent
  // so we don't leave a stray blank line.
  const schedulingLine = schedulingUrl
    ? `Schedule a call: ${schedulingUrl}`
    : null;

  const bodyPlain = [
    greeting,
    "",
    `I just finished reviewing the disclosure package on ${address}. Here's a quick summary.`,
    "",
    "Top 3 strengths:",
    ...strengths.map((s, i) => `  ${i + 1}. ${s}`),
    "",
    "Top 3 concerns:",
    ...concerns.map((c, i) => `  ${i + 1}. ${c}`),
    "",
    "I've attached the full report — call me when you've had a chance to read through it and we can talk next steps.",
    "",
    ...(schedulingLine ? [schedulingLine, ""] : []),
    signoff,
  ].join("\n");

  // -------- HTML body --------------------------------------------
  // Custom signature: preserve line breaks by converting \n to <br>
  // and escape everything else to keep it inert as HTML.
  const signoffHtml = customSignature
    ? escapeHtml(customSignature).replace(/\n/g, "<br>")
    : formatSignoffHtml(profile, signatureEmail);

  const bodyHtml = renderHtmlBody({
    greeting,
    address,
    strengths,
    concerns,
    schedulingUrl: schedulingUrl ?? null,
    signoffHtml,
  });

  return NextResponse.json({
    recipient_suggestion: clientName
      ? `${clientName} <>`
      : null,
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
  strengths: string[];
  concerns: string[];
  schedulingUrl: string | null;
  signoffHtml: string;
}): string {
  const { greeting, address, strengths, concerns, schedulingUrl, signoffHtml } =
    params;
  const li = (items: string[]) =>
    items.map((s) => `<li style="margin:0 0 4px;">${escapeHtml(s)}</li>`).join("");

  // Rendered as a real anchor so mail clients hyperlink it. Sits
  // above the signature in its own paragraph block.
  const schedulingHtml = schedulingUrl
    ? `<p style="margin:18px 0 4px;">Schedule a call: <a href="${escapeAttr(schedulingUrl)}">${escapeHtml(schedulingUrl)}</a></p>`
    : "";

  return `
<div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;line-height:1.55;max-width:560px;">
  <p>${escapeHtml(greeting)}</p>
  <p>I just finished reviewing the disclosure package on <strong>${escapeHtml(address)}</strong>. Here&rsquo;s a quick summary.</p>
  <p style="margin:18px 0 4px;"><strong>Top 3 strengths</strong></p>
  <ol style="margin:0 0 14px 22px;padding:0;color:#065f46;">${li(strengths)}</ol>
  <p style="margin:18px 0 4px;"><strong>Top 3 concerns</strong></p>
  <ol style="margin:0 0 14px 22px;padding:0;color:#7f1d1d;">${li(concerns)}</ol>
  <p>I&rsquo;ve attached the full report &mdash; call me when you&rsquo;ve had a chance to read through it and we can talk next steps.</p>
  ${schedulingHtml}
  <p style="margin-top:22px;">${signoffHtml}</p>
</div>`.trim();
}

// Stricter escape for use inside attribute values (href="..."). Keeps
// the same shape as escapeHtml but always emits the entity form,
// even where escapeHtml might leave a character unmolested.
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
