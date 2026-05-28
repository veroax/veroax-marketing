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
// HTML design constraints mirror lib/email/welcomeEmail.ts:
//   - Inline CSS only
//   - 600px max-width container
//   - Indigo gradient header
//   - Amber accent on the "VIP" wordmark
//   - Plain-text fallback

import { sendTransactional } from "@/lib/email/sender";
import { SUPPORT } from "@/lib/site";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendVipGrantEmail({
  recipientEmail,
  recipientFullName,
  adminEmail,
  adminFullName,
}: VipGrantEmailParams): Promise<{ ok: boolean; error?: string }> {
  const firstName =
    (recipientFullName ?? "").split(" ")[0]?.trim() || "there";
  const safeFirstName = escapeHtml(firstName);

  // Admin display name for the signature + subject line. Falls back
  // to the admin's email when their profile has no full_name set.
  const adminDisplay =
    (adminFullName ?? "").trim().length > 0
      ? (adminFullName as string).trim()
      : adminEmail;
  const safeAdminDisplay = escapeHtml(adminDisplay);
  const safeAdminEmail = escapeHtml(adminEmail);

  // Subject per founder spec (option 3 from the design review):
  // "{AdminName} just flipped on your Veroax VIP access".
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
  // generic support inbox. This is a personal email; the
  // recipient should be able to hit reply and get to the real
  // person who granted them VIP.
  const result = await sendTransactional({
    to: recipientEmail,
    replyTo: adminEmail,
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
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>You're a Veroax VIP</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8fafc;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#1e1b4b 0%,#0f0e2e 100%);padding:32px 40px;text-align:left;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td>
                      <p style="margin:0;color:#fbbf24;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Veroax &middot; VIP</p>
                      <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;line-height:32px;font-weight:700;">You're a Veroax VIP, ${safeFirstName}.</h1>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px 8px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  Quick personal note: I just turned on VIP access on your
                  Veroax account, and I wanted to make sure you knew what that
                  means.
                </p>

                <p style="margin:24px 0 12px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1e1b4b;">
                  VIP access on Veroax means
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                  ${bulletRow(
                    "Unlimited reports.",
                    "No credit gate, no 'you have N reports left' warnings.",
                  )}
                  ${bulletRow(
                    "No watermark.",
                    "Every PDF is client-ready, the same way a paying agent's reports are.",
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
                  Why you, why now: you're on a short list of people whose use
                  of Veroax is shaping what it becomes. Every report you run,
                  every observation you send back, every weird edge case you
                  find is the work that turns a tool into something
                  California's buyer's agents actually trust. I notice it,
                  and I want to make sure you have everything you need to put
                  the product through real-world work without thinking twice
                  about whether it costs you something.
                </p>

                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  So, thank you. Genuinely. Building something useful in this
                  space is harder than I expected, and the fact that you're
                  willing to use Veroax on real disclosures, with real clients,
                  on real stakes is what makes the work worth doing. Please
                  keep telling me what's broken, what's missing, what could be
                  sharper. Reply to this email if anything comes up, it lands
                  in my inbox directly.
                </p>

                <p style="margin:0 0 28px;font-size:15px;line-height:24px;color:#1e293b;">
                  Your VIP status is already active. Sign in below when you're
                  ready to run your next report.
                </p>

                <!-- Primary CTA -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 32px;">
                  <tr>
                    <td style="background-color:#fbbf24;border-radius:8px;">
                      <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:13px 28px;color:#0f0e2e;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.01em;">
                        Open your dashboard
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Signature -->
            <tr>
              <td style="padding:0 40px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top:1px solid #e2e8f0;">
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
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:0 40px 28px;text-align:center;">
                <p style="margin:0;font-size:11px;line-height:18px;color:#94a3b8;">
                  Veroax, Inc. &middot; ${SUPPORT.address.street}, ${SUPPORT.address.city}, ${SUPPORT.address.region} ${SUPPORT.address.postalCode}
                </p>
                <p style="margin:6px 0 0;font-size:11px;line-height:18px;color:#94a3b8;">
                  You're receiving this because an admin granted VIP access on
                  your account at
                  <a href="${SITE_URL}" style="color:#94a3b8;text-decoration:underline;">veroax.com</a>.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
    "  - No watermark. Every PDF is client-ready, the same way a paying",
    "    agent's reports are.",
    "  - All 14 report sections. Full feature surface, no second-class",
    "    anything.",
    "  - Same pipeline as paying agents. Listing-data reconciliation,",
    "    verifier pass, regional cost reference, the full multi-pass",
    "    analysis.",
    "",
    "Why you, why now: you're on a short list of people whose use of",
    "Veroax is shaping what it becomes. Every report you run, every",
    "observation you send back, every weird edge case you find is the",
    "work that turns a tool into something California's buyer's agents",
    "actually trust. I notice it, and I want to make sure you have",
    "everything you need to put the product through real-world work",
    "without thinking twice about whether it costs you something.",
    "",
    "So, thank you. Genuinely. Building something useful in this space",
    "is harder than I expected, and the fact that you're willing to use",
    "Veroax on real disclosures, with real clients, on real stakes is",
    "what makes the work worth doing. Please keep telling me what's",
    "broken, what's missing, what could be sharper. Reply to this email",
    "if anything comes up, it lands in my inbox directly.",
    "",
    "Your VIP status is already active. Sign in when you're ready to",
    `run your next report: ${SITE_URL}/dashboard`,
    "",
    "Talk soon,",
    "",
    adminDisplay,
    adminEmail,
    "Veroax, Inc.",
  ].join("\n");
}
