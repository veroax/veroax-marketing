/**
 * Shared transactional email layout for every public-facing email
 * Veroax sends to its users. Matches the chrome from welcomeEmail.ts:
 *
 *   - Inline CSS only (no <style> blocks, email clients strip them)
 *   - 600px max-width centered container
 *   - Indigo gradient header with amber Veroax wordmark
 *   - Body slot (caller supplies HTML)
 *   - Optional amber CTA button
 *   - Support card with phone + email + hours
 *   - Footer with mailing address + reason-you're-receiving line
 *
 * Every user-facing email goes through this helper so the look, feel,
 * and support contact information are identical. The welcome email is
 * the visual reference; everything else here should match it.
 *
 * Plain-text fallback is the caller's responsibility (build a parallel
 * plain-text string for the `text` param of sendTransactional).
 */

import { SUPPORT } from "@/lib/site";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

export type EmailLayoutOptions = {
  // Small uppercase eyebrow text in the gradient header (above the
  // headline). Default is "Veroax". Examples: "Veroax", "Veroax · VIP",
  // "Veroax · Invitation".
  eyebrow?: string;
  // Main headline in the header. Should include the recipient's
  // first name when the email is personal, e.g., "Welcome, Michael.".
  headline: string;
  // HTML for the body slot. Caller is responsible for escaping any
  // user-supplied text in this string. Use a `<p style="margin:0 0
  // 16px;font-size:15px;line-height:24px;color:#1e293b;">...</p>`
  // pattern for body paragraphs to match the welcome email.
  bodyHtml: string;
  // Optional primary call-to-action button. Renders as an amber pill
  // below the body. Pass both fields or omit both.
  ctaText?: string;
  ctaUrl?: string;
  // The "you're receiving this because..." line at the very bottom.
  // Defaults to a generic "you have a Veroax account" message.
  reasonReceiving?: string;
  // The HTML <title> shown in some email-client previews. Defaults
  // to the headline.
  documentTitle?: string;
};

/**
 * Build a polished, branded transactional email body that matches
 * the welcome email's design language. Use for every user-facing
 * Veroax email.
 */
export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const eyebrow = opts.eyebrow ?? "Veroax";
  const reason =
    opts.reasonReceiving ??
    "You're receiving this because you have a Veroax account.";
  const title = opts.documentTitle ?? opts.headline;
  const cta =
    opts.ctaText && opts.ctaUrl
      ? `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 32px;">
                  <tr>
                    <td style="background-color:#fbbf24;border-radius:8px;">
                      <a href="${opts.ctaUrl}" style="display:inline-block;padding:13px 28px;color:#0f0e2e;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.01em;">
                        ${escapeHtml(opts.ctaText)}
                      </a>
                    </td>
                  </tr>
                </table>`
      : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${escapeHtml(title)}</title>
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
                      <p style="margin:0;color:#fbbf24;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
                      <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;line-height:32px;font-weight:700;">${escapeHtml(opts.headline)}</h1>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px 8px;">
                ${opts.bodyHtml}
                ${cta}
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
                            <a href="tel:${SUPPORT.phoneTel}" style="color:#1e1b4b;font-size:15px;font-weight:600;text-decoration:none;">
                              ${SUPPORT.phone}
                            </a>
                          </td>
                          <td style="padding:0 0 6px;">
                            <a href="mailto:${SUPPORT.email}" style="color:#4f46e5;font-size:14px;text-decoration:underline;">
                              ${SUPPORT.email}
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:8px 0 0;font-size:12px;color:#64748b;">
                        Phone monitored ${SUPPORT.hours}. Email replies within
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
                  ${escapeHtml(reason)}
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

/**
 * Plain-text equivalent of the support footer. Append to every
 * email's plain-text body for consistency with the HTML support card.
 */
export function plainTextSupportFooter(): string {
  return [
    "----",
    "",
    "Need help, any reason:",
    `  Phone: ${SUPPORT.phone} (monitored ${SUPPORT.hours})`,
    `  Email: ${SUPPORT.email} (replies within one business day)`,
    "",
    "Veroax, Inc.",
    SUPPORT.address.street,
    `${SUPPORT.address.city}, ${SUPPORT.address.region} ${SUPPORT.address.postalCode}`,
  ].join("\n");
}

/**
 * Extract a usable first name from a full-name string. Falls back
 * to "there" so the greeting never reads as "Welcome, .".
 */
export function firstNameFrom(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "there";
  const first = trimmed.split(/\s+/)[0];
  return first || "there";
}

/**
 * HTML-escape user-supplied text. Required for any caller-provided
 * string the layout interpolates into HTML attributes or text nodes.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
