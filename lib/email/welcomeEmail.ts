// Polished branded welcome email sent to every new Veroax signup.
//
// Triggered from signupAction immediately after Supabase confirms the
// auth.users row was created (whether the user has verified their
// email or not, we send the welcome). Best-effort: failures are
// logged but never bubble up to the signup response. Supabase's
// own verification email handles the click-to-confirm flow; this
// email is the human-feeling brand introduction.
//
// HTML design constraints:
//   - Inline CSS only (no external stylesheets, no <style> blocks
//     that some clients strip)
//   - 600px max-width container, centered
//   - Indigo gradient header (matches the app's dashboard chrome)
//   - Standard text body, generous line-height
//   - Amber CTA button (matches the homepage)
//   - Plain-text fallback for clients that don't render HTML

import { sendTransactional } from "@/lib/email/sender";
import { SUPPORT } from "@/lib/site";

export type WelcomeEmailParams = {
  email: string;
  fullName: string;
};

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

// Local aliases for SUPPORT.* so the existing template-string usages
// below stay short. Edit lib/site.ts to change these values across
// the whole codebase.
const SUPPORT_PHONE = SUPPORT.phone;
const SUPPORT_PHONE_TEL = SUPPORT.phoneTel;
const SUPPORT_EMAIL = SUPPORT.email;
const SUPPORT_HOURS = SUPPORT.hours;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendWelcomeEmail({
  email,
  fullName,
}: WelcomeEmailParams): Promise<{ ok: boolean; error?: string }> {
  const firstName = (fullName.split(" ")[0] ?? "").trim() || "there";
  const safeName = escapeHtml(firstName);

  const html = buildHtml(safeName);
  const text = buildPlainText(firstName);

  const result = await sendTransactional({
    to: email,
    subject: "Welcome to Veroax",
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

function buildHtml(safeFirstName: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Welcome to Veroax</title>
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
                      <p style="margin:0;color:#fbbf24;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">Veroax</p>
                      <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;line-height:32px;font-weight:700;">Welcome, ${safeFirstName}.</h1>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px 8px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  Thanks for joining Veroax. You now have an account that turns a
                  California residential disclosure package, every TDS, SPQ, NHD,
                  inspection report, and HOA doc, into a polished, branded buyer
                  report in minutes.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#1e293b;">
                  Three things to do next:
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 28px;">
                  <tr>
                    <td style="padding:0 0 14px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td valign="top" width="32" style="padding-right:12px;">
                            <div style="width:24px;height:24px;border-radius:12px;background-color:#1e1b4b;color:#fbbf24;font-weight:700;font-size:12px;text-align:center;line-height:24px;">1</div>
                          </td>
                          <td valign="top">
                            <p style="margin:0;font-size:14px;line-height:21px;color:#1e293b;">
                              <strong>Finish your profile.</strong> Add your DRE
                              license, brokerage, headshot, and phone in
                              <a href="${SITE_URL}/dashboard/settings" style="color:#4f46e5;text-decoration:underline;">/dashboard/settings</a>.
                              This is what appears on every branded PDF you
                              generate.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 14px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td valign="top" width="32" style="padding-right:12px;">
                            <div style="width:24px;height:24px;border-radius:12px;background-color:#1e1b4b;color:#fbbf24;font-weight:700;font-size:12px;text-align:center;line-height:24px;">2</div>
                          </td>
                          <td valign="top">
                            <p style="margin:0;font-size:14px;line-height:21px;color:#1e293b;">
                              <strong>Run your first analysis.</strong> Upload a
                              disclosure package at
                              <a href="${SITE_URL}/dashboard/upload" style="color:#4f46e5;text-decoration:underline;">/dashboard/upload</a>.
                              We'll generate the 14-section report you can
                              review on your dashboard, send to your buyer
                              via a private share link, or download as a
                              branded PDF, your choice. Your first run is
                              free (watermarked) so you can see exactly what
                              your buyer would receive before you commit.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td valign="top" width="32" style="padding-right:12px;">
                            <div style="width:24px;height:24px;border-radius:12px;background-color:#1e1b4b;color:#fbbf24;font-weight:700;font-size:12px;text-align:center;line-height:24px;">3</div>
                          </td>
                          <td valign="top">
                            <p style="margin:0;font-size:14px;line-height:21px;color:#1e293b;">
                              <strong>Choose a plan</strong> when you're ready
                              to deliver a clean (non-watermarked) report to a
                              client. Pricing at
                              <a href="${SITE_URL}/pricing" style="color:#4f46e5;text-decoration:underline;">${SITE_URL.replace('https://', '')}/pricing</a>.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

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

            <!-- Support card -->
            <tr>
              <td style="padding:0 40px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f1f5f9;border-radius:12px;">
                  <tr>
                    <td style="padding:20px 24px;">
                      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#475569;">
                        Need help, any reason
                      </p>
                      <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#334155;">
                        We're a small team and we read every message. Don't
                        hesitate to reach out.
                      </p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="padding:0 16px 6px 0;">
                            <a href="tel:${SUPPORT_PHONE_TEL}" style="color:#1e1b4b;font-size:15px;font-weight:600;text-decoration:none;">
                              ${SUPPORT_PHONE}
                            </a>
                          </td>
                          <td style="padding:0 0 6px;">
                            <a href="mailto:${SUPPORT_EMAIL}" style="color:#4f46e5;font-size:14px;text-decoration:underline;">
                              ${SUPPORT_EMAIL}
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:8px 0 0;font-size:12px;color:#64748b;">
                        Phone monitored ${SUPPORT_HOURS}. Email replies within
                        one business day.
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
                  You're receiving this because you signed up at
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

function buildPlainText(firstName: string): string {
  return [
    `Welcome, ${firstName}.`,
    "",
    "Thanks for joining Veroax. You now have an account that turns a California",
    "residential disclosure package (every TDS, SPQ, NHD, inspection report, and",
    "HOA doc) into a polished, branded buyer report in minutes.",
    "",
    "Three things to do next:",
    "",
    `  1. Finish your profile (DRE license, brokerage, headshot, phone): ${SITE_URL}/dashboard/settings`,
    `  2. Run your first analysis: ${SITE_URL}/dashboard/upload`,
    `  3. Choose a plan when you are ready to deliver a clean report: ${SITE_URL}/pricing`,
    "",
    `Open your dashboard: ${SITE_URL}/dashboard`,
    "",
    "----",
    "",
    "Need help, any reason:",
    `  Phone: ${SUPPORT_PHONE} (monitored ${SUPPORT_HOURS})`,
    `  Email: ${SUPPORT_EMAIL} (replies within one business day)`,
    "",
    "Veroax, Inc.",
    SUPPORT.address.street,
    `${SUPPORT.address.city}, ${SUPPORT.address.region} ${SUPPORT.address.postalCode}`,
  ].join("\n");
}
