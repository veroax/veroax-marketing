// Polished branded welcome email sent to every new Veroax signup.
//
// Triggered from signupAction immediately after Supabase confirms the
// auth.users row was created (whether the user has verified their
// email or not, we send the welcome). Best-effort: failures are
// logged but never bubble up to the signup response. Supabase's
// own verification email handles the click-to-confirm flow; this
// email is the human-feeling brand introduction.
//
// Chrome (header, support card, footer) comes from lib/email/layout.ts
// so every user-facing email matches this one's look and feel.

import { sendTransactional } from "@/lib/email/sender";
import { SUPPORT } from "@/lib/site";
import {
  renderEmailLayout,
  plainTextSupportFooter,
  firstNameFrom,
  escapeHtml,
} from "./layout";

export type WelcomeEmailParams = {
  email: string;
  fullName: string;
};

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

export async function sendWelcomeEmail({
  email,
  fullName,
}: WelcomeEmailParams): Promise<{ ok: boolean; error?: string }> {
  const firstName = firstNameFrom(fullName);
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
  // Body slot: intro paragraph + three numbered next steps. All link
  // text says "Dashboard", "your profile", "Pricing" instead of raw
  // URL paths. Real-estate agents shouldn't have to read
  // "/dashboard/upload" to know where to click.
  const bodyHtml = `
                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  Thanks for joining Veroax. You now have an account that
                  turns a California residential disclosure package, every
                  TDS, SPQ, NHD, inspection report, and HOA doc, into a
                  polished analysis you can use to walk your buyer through
                  the package and prepare your offer.
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
                              <strong>Finish your profile.</strong> Add your
                              DRE license, brokerage, headshot, and phone in
                              <a href="${SITE_URL}/dashboard/settings" style="color:#4f46e5;text-decoration:underline;">your profile</a>.
                              This is what appears on every analysis you run.
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
                              <strong>Run your first analysis.</strong>
                              Open the
                              <a href="${SITE_URL}/dashboard" style="color:#4f46e5;text-decoration:underline;">Dashboard</a>,
                              upload your disclosure package, and we'll
                              generate the 14-section analysis you can review
                              section by section. Your first run is free so
                              you can see exactly how it works before you
                              commit.
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
                              to use Veroax on real disclosure packages with
                              your clients. See
                              <a href="${SITE_URL}/pricing" style="color:#4f46e5;text-decoration:underline;">pricing</a>.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>`;

  return renderEmailLayout({
    eyebrow: "Veroax",
    headline: `Welcome, ${safeFirstName}.`,
    documentTitle: "Welcome to Veroax",
    bodyHtml,
    ctaText: "Open your dashboard",
    ctaUrl: `${SITE_URL}/dashboard`,
    reasonReceiving:
      "You're receiving this because you signed up at",
  });
}

function buildPlainText(firstName: string): string {
  return [
    `Welcome, ${firstName}.`,
    "",
    "Thanks for joining Veroax. You now have an account that turns a California",
    "residential disclosure package (every TDS, SPQ, NHD, inspection report, and",
    "HOA doc) into a polished analysis you can use to walk your buyer through",
    "the package and prepare your offer.",
    "",
    "Three things to do next:",
    "",
    `  1. Finish your profile (DRE license, brokerage, headshot, phone): ${SITE_URL}/dashboard/settings`,
    `  2. Run your first analysis from the Dashboard: ${SITE_URL}/dashboard`,
    `  3. Choose a plan when you're ready: ${SITE_URL}/pricing`,
    "",
    `Open your dashboard: ${SITE_URL}/dashboard`,
    "",
    plainTextSupportFooter(),
  ].join("\n");
}

// Re-export SUPPORT so consumers that imported it from this module
// (legacy) continue to compile. The layout file is the new source of
// truth for support-card rendering.
export { SUPPORT };
