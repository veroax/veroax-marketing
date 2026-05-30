// VIP grant email, fires when an admin promotes a user via the
// /api/admin/toggle-vip endpoint with is_vip=true. Signed by the
// granting admin (full name + email), with Reply-To set to that
// admin's email so the recipient can reply to a real person, not
// into the generic support inbox.
//
// Failure-tolerant by design: a send failure logs but does not
// fail the VIP grant API call (the admin already saw the modal
// succeed and clicked away). Re-running the grant flow would
// re-send the email, which is fine, the receiver won't be
// surprised.
//
// Chrome (header, support card, footer) comes from lib/email/layout.ts
// so this matches the welcome email's look.

import { sendTransactional } from "@/lib/email/sender";
import {
  renderEmailLayout,
  plainTextSupportFooter,
  firstNameFrom,
  escapeHtml,
} from "./layout";

export type VipGrantEmailParams = {
  // The recipient who was just granted VIP.
  recipientEmail: string;
  recipientFullName: string | null;
  // The admin who granted VIP. fullName falls back to email when
  // the admin's profile has no name set, so the signature is
  // never blank.
  adminEmail: string;
  adminFullName: string | null;
};

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

// Founder gets a blind carbon copy on every VIP grant email so
// there's always a paper trail of what went out, signed by which
// admin, to which user. The recipient doesn't see this address
// (bcc, not cc), so the email still reads as a one-to-one personal
// note. Hardcoded rather than env-var-driven because (a) it's a
// specific operational decision the founder made, not a deployment
// parameter, and (b) it's the same address whether we're in dev,
// staging, or prod.
const VIP_GRANT_BCC = "michael@veroax.com";

export async function sendVipGrantEmail({
  recipientEmail,
  recipientFullName,
  adminEmail,
  adminFullName,
}: VipGrantEmailParams): Promise<{ ok: boolean; error?: string }> {
  const firstName = firstNameFrom(recipientFullName);
  const safeFirstName = escapeHtml(firstName);

  // Admin display name for the signature + subject line. Falls back
  // to the admin's email when their profile has no full_name set.
  const adminDisplay =
    (adminFullName ?? "").trim().length > 0
      ? (adminFullName as string).trim()
      : adminEmail;
  const safeAdminDisplay = escapeHtml(adminDisplay);
  const safeAdminEmail = escapeHtml(adminEmail);

  // Subject per founder spec: "{AdminName} just flipped on your Veroax VIP access".
  const subject = `${adminDisplay} just flipped on your Veroax VIP access`;

  const html = buildHtml({
    safeFirstName,
    safeAdminDisplay,
    safeAdminEmail,
  });
  const text = buildPlainText({
    firstName,
    adminDisplay,
    adminEmail,
  });

  // Reply-To override: replies go to the granting admin, not the
  // generic support inbox. Recipient hits reply, talks to the real
  // person who granted them VIP.
  //
  // BCC the founder so there's always a paper trail. Drop the BCC
  // when the granting admin IS the BCC mailbox, otherwise the
  // founder would get two copies of every email they triggered.
  const bccRecipients =
    adminEmail.toLowerCase() === VIP_GRANT_BCC.toLowerCase()
      ? undefined
      : VIP_GRANT_BCC;
  const result = await sendTransactional({
    to: recipientEmail,
    replyTo: adminEmail,
    bcc: bccRecipients,
    subject,
    text,
    html,
  });
  if (result.skipped) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Send failed" };
  }
  return { ok: true };
}

function buildHtml({
  safeFirstName,
  safeAdminDisplay,
  safeAdminEmail,
}: {
  safeFirstName: string;
  safeAdminDisplay: string;
  safeAdminEmail: string;
}): string {
  const bodyHtml = `
                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  Quick personal note: I just turned on VIP access on your
                  Veroax account, and I wanted to make sure you knew what
                  that means.
                </p>

                <p style="margin:24px 0 12px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1e1b4b;">
                  VIP access on Veroax means
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                  ${bulletRow(
                    "Unlimited reports.",
                    "No credit gate, no \"you have N reports left\" warnings.",
                  )}
                  ${bulletRow(
                    "No watermark.",
                    "Every analysis is fully usable, the same as a paying agent's.",
                  )}
                  ${bulletRow(
                    "All 14 report sections.",
                    "Full feature surface, no second-class anything.",
                  )}
                  ${bulletRow(
                    "Same pipeline as paying agents.",
                    "Listing-data reconciliation, verifier pass, regional cost reference, the full multi-pass analysis.",
                  )}
                </table>

                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  Why you, why now: you're on a short list of people whose
                  use of Veroax is shaping what it becomes. Every report
                  you run, every observation you send back, every weird
                  edge case you find is the work that turns a tool into
                  something California's buyer's agents actually trust. I
                  notice it, and I want to make sure you have everything
                  you need to put the product through real-world work
                  without thinking twice about whether it costs you
                  something.
                </p>

                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  So, thank you. Genuinely. Building something useful in
                  this space is harder than I expected, and the fact that
                  you're willing to use Veroax on real disclosures is what
                  makes the work worth doing. Please keep telling me
                  what's broken, what's missing, what could be sharper.
                  Reply to this email if anything comes up, it lands in
                  my inbox directly.
                </p>

                <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#1e293b;">
                  Your VIP status is already active. Sign in below when
                  you're ready to run your next analysis.
                </p>

                <!-- Signature -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top:1px solid #e2e8f0;margin:8px 0 0;">
                  <tr>
                    <td style="padding:24px 0 0;">
                      <p style="margin:0;font-size:14px;line-height:21px;color:#1e293b;">
                        Talk soon,
                      </p>
                      <p style="margin:12px 0 0;font-size:15px;line-height:22px;color:#0f0e2e;font-weight:700;">
                        ${safeAdminDisplay}
                      </p>
                      <p style="margin:2px 0 0;font-size:13px;line-height:20px;color:#475569;">
                        <a href="mailto:${safeAdminEmail}" style="color:#4f46e5;text-decoration:underline;">
                          ${safeAdminEmail}
                        </a>
                      </p>
                      <p style="margin:2px 0 0;font-size:13px;line-height:20px;color:#475569;">
                        Veroax, Inc.
                      </p>
                    </td>
                  </tr>
                </table>`;

  return renderEmailLayout({
    eyebrow: "Veroax · VIP",
    headline: `You're a Veroax VIP, ${safeFirstName}.`,
    documentTitle: "You're a Veroax VIP",
    bodyHtml,
    ctaText: "Open your dashboard",
    ctaUrl: `${SITE_URL}/dashboard`,
    reasonReceiving:
      "You're receiving this because an admin granted VIP access on your account at",
  });
}

function bulletRow(label: string, body: string): string {
  return `
                  <tr>
                    <td style="padding:0 0 12px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td valign="top" width="20" style="padding-right:12px;">
                            <div style="width:8px;height:8px;border-radius:4px;background-color:#fbbf24;margin-top:7px;"></div>
                          </td>
                          <td valign="top">
                            <p style="margin:0;font-size:14px;line-height:21px;color:#1e293b;">
                              <strong>${escapeHtml(label)}</strong> ${escapeHtml(body)}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>`;
}

function buildPlainText({
  firstName,
  adminDisplay,
  adminEmail,
}: {
  firstName: string;
  adminDisplay: string;
  adminEmail: string;
}): string {
  return [
    `You're a Veroax VIP, ${firstName}.`,
    "",
    "Quick personal note: I just turned on VIP access on your Veroax",
    "account, and I wanted to make sure you knew what that means.",
    "",
    "VIP ACCESS ON VEROAX MEANS:",
    "",
    "  - Unlimited reports. No credit gate, no 'you have N reports left'",
    "    warnings.",
    "  - No watermark. Every analysis is fully usable.",
    "  - All 14 report sections. Full feature surface.",
    "  - Same pipeline as paying agents.",
    "",
    "Why you, why now: you're on a short list of people whose use of",
    "Veroax is shaping what it becomes.",
    "",
    "Your VIP status is already active. Sign in when you're ready to",
    `run your next report: ${SITE_URL}/dashboard`,
    "",
    "Talk soon,",
    "",
    adminDisplay,
    adminEmail,
    "Veroax, Inc.",
    "",
    plainTextSupportFooter(),
  ].join("\n");
}
