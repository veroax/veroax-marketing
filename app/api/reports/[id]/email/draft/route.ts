import { NextResponse } from "next/server";
import { composeAgentStrengthsAndConcerns } from "@/lib/reports/summary";
import { composeExecutiveNarrative } from "@/lib/reports/narrative";
import { deriveCostSummary } from "@/lib/reports/cost-summary";
import type { ReportData } from "@/lib/anthropic/schema";
import { requireUser } from "@/lib/auth/require";

// POST /api/reports/[id]/email/draft
//
// Returns a pre-filled subject + body for a client-facing email
// summarizing the report. The body is BRIEF, under 200 words, with
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
// The PDF is NOT inlined into body_html, the modal advertises it as
// an attachment, and either the mailto: handler (item 8) or the Resend
// send call attaches the actual PDF bytes.

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

  // Prefer the agent's display email on the seeded email signature so
  // what the client sees in the email matches what's printed on the
  // PDF cover.
  const signatureEmail =
    (profile as { display_email?: string | null } | null)?.display_email
      ?.trim() || user.email || null;

  // When the agent has saved a custom email signature on /settings,
  // it REPLACES the auto-generated formatSignoff output verbatim.
  // PDF cover always uses the structured Name/Brokerage/DRE fields
  //, only the email signature is overridable.
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

  // Email body just needs the text; the triggered_rule badge is
  // dashboard-only. Map to strings here so the body templates don't
  // change shape.
  const picked = composeAgentStrengthsAndConcerns(reportData);
  const strengths = picked.strengths.map((s) => s.text);
  const concerns = picked.concerns.map((c) => c.text);

  // Same narrative the on-page "Talking points for your client" panel
  // and the PDF cover's Executive Summary render. Single source of
  // truth, what the agent reads on the dashboard, what the buyer
  // reads in the email, and what's printed on the PDF cover are
  // VERBATIM identical, so an agent forwarding a paragraph from the
  // email matches the PDF exactly.
  const talkingPoints = composeExecutiveNarrative(reportData);

  // Overall rating + cost-exposure band so the email's hero card can
  // mirror the dashboard's hero metadata strip. Optional, when the
  // analysis didn't populate them, those bits just don't render.
  const overallRating = reportData.overall_rating?.label ?? null;
  const grandTotal = deriveCostSummary(reportData).grand_total ?? null;
  const costRange =
    grandTotal && grandTotal.high > 0
      ? `${formatUSD(grandTotal.low)}–${formatUSD(grandTotal.high)}`
      : null;

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

  // Plain-text version of the rich layout. Talking points lead so even
  // recipients on a text-only mail client (or screen readers) get the
  // most important context first; the strengths / concerns lists
  // follow, then the close.
  const bodyPlain = [
    greeting,
    "",
    `I just finished reviewing the disclosure package on ${address}. Here's what stood out, talking points first, then the highlights.`,
    "",
    ...(clientName || overallRating || costRange
      ? [
          ...(clientName ? [`Prepared for: ${clientName}`] : []),
          `Property: ${address}`,
          ...(overallRating ? [`Overall rating: ${overallRating}`] : []),
          ...(costRange ? [`Estimated cost exposure: ${costRange}`] : []),
          "",
        ]
      : []),
    "TALKING POINTS",
    ...talkingPoints.flatMap((p) => [p, ""]),
    "TOP STRENGTHS",
    ...strengths.map((s, i) => `  ${i + 1}. ${s}`),
    "",
    "TOP CONCERNS",
    ...concerns.map((c, i) => `  ${i + 1}. ${c}`),
    "",
    "I've attached the full report, call me when you've had a chance to read through it and we can talk next steps.",
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
    clientName,
    overallRating,
    costRange,
    talkingPoints,
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
  clientName: string | null;
  overallRating: string | null;
  costRange: string | null;
  talkingPoints: string[];
  strengths: string[];
  concerns: string[];
  schedulingUrl: string | null;
  signoffHtml: string;
}): string {
  const {
    greeting,
    address,
    clientName,
    overallRating,
    costRange,
    talkingPoints,
    strengths,
    concerns,
    schedulingUrl,
    signoffHtml,
  } = params;

  // Color palette mirrors the on-page AgentSummary panels (Tailwind
  // indigo-950 / amber-300 / emerald / red / slate). Inline styles only
  //, most email clients strip <style> blocks or sandbox them. Border
  // radius + background colors render well in Gmail, Apple Mail, and
  // Outlook 365 / web; OWA on older desktop Outlook is less reliable
  // with rounded corners but degrades to a clean rectangle which is
  // still readable.
  const li = (items: string[], color: string) =>
    items
      .map(
        (s) =>
          `<li style="margin:0 0 6px;color:${color};line-height:1.5;">${escapeHtml(s)}</li>`,
      )
      .join("");

  // Hero banner, mirrors the dashboard's indigo header card.
  // "Prepared For" label hidden when clientName is null, same as the
  // dashboard's behavior.
  const preparedFor = clientName
    ? `<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#fcd34d;text-transform:uppercase;margin:0 0 4px;">Prepared For · ${escapeHtml(clientName)}</div>`
    : "";

  // Metadata strip under the hero, rating + cost when available, in
  // a compact horizontal row. Both fields graceful-degrade to nothing.
  const metaParts: string[] = [];
  if (overallRating) {
    metaParts.push(
      `<span style="color:#475569;"><span style="font-weight:600;color:#334155;">Overall rating</span> ${escapeHtml(overallRating)}</span>`,
    );
  }
  if (costRange) {
    metaParts.push(
      `<span style="color:#475569;"><span style="font-weight:600;color:#334155;">Cost exposure</span> ${escapeHtml(costRange)}</span>`,
    );
  }
  const metaStrip =
    metaParts.length > 0
      ? `<div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:10px 20px;font-size:12px;margin:-12px 0 18px;">${metaParts.join(' &nbsp;·&nbsp; ')}</div>`
      : "";

  const heroBorderRadius =
    metaParts.length > 0 ? "12px 12px 0 0" : "12px";
  const heroMarginBottom = metaParts.length > 0 ? "0" : "18px";

  // Talking points, narrative paragraphs in a neutral card.
  const talkingPointsHtml = talkingPoints
    .map(
      (p) =>
        `<p style="margin:0 0 10px;color:#334155;line-height:1.6;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const schedulingHtml = schedulingUrl
    ? `<p style="margin:22px 0 4px;color:#334155;">Schedule a call: <a href="${escapeAttr(schedulingUrl)}" style="color:#4338ca;">${escapeHtml(schedulingUrl)}</a></p>`
    : "";

  return `
<div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;line-height:1.55;max-width:600px;">
  <p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>
  <p style="margin:0 0 18px;">I just finished reviewing the disclosure package on <strong>${escapeHtml(address)}</strong>. Below are the talking points I'd lead with, plus the top strengths and concerns. The full report is attached.</p>

  <!-- Hero banner -->
  <div style="background-color:#1e1b4b;color:#ffffff;border-radius:${heroBorderRadius};padding:18px 22px;margin:0 0 ${heroMarginBottom};">
    ${preparedFor}
    <div style="font-size:18px;font-weight:700;line-height:1.3;">${escapeHtml(address)}</div>
  </div>
  ${metaStrip}

  <!-- Talking points -->
  <div style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin:0 0 14px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#334155;text-transform:uppercase;margin:0 0 12px;">Talking points</div>
    ${talkingPointsHtml}
  </div>

  <!-- Top Strengths -->
  <div style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px 20px;margin:0 0 14px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#065f46;text-transform:uppercase;margin:0 0 10px;">Top Strengths</div>
    <ol style="margin:0;padding:0 0 0 20px;">${li(strengths, "#022c22")}</ol>
  </div>

  <!-- Top Concerns -->
  <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin:0 0 18px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#991b1b;text-transform:uppercase;margin:0 0 10px;">Top Concerns</div>
    <ol style="margin:0;padding:0 0 0 20px;">${li(concerns, "#450a0a")}</ol>
  </div>

  <p style="margin:0 0 0;color:#334155;">I&rsquo;ve attached the full report &mdash; call me when you&rsquo;ve had a chance to read through it and we can talk next steps.</p>
  ${schedulingHtml}
  <p style="margin:24px 0 0;color:#0f172a;">${signoffHtml}</p>
</div>`.trim();
}

// Stricter escape for use inside attribute values (href="..."). Keeps
// the same shape as escapeHtml but always emits the entity form,
// even where escapeHtml might leave a character unmolested.
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// USD currency formatter for the email's cost-exposure metadata strip.
// Whole-dollar precision is more readable in a casual client-facing
// email than the cents-precise version the dashboard uses.
function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
