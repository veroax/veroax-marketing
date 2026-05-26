// Admin notification email sent to support@veroax.com (or wherever
// SUPPORT_FROM_EMAIL points) every time someone signs up OR tries to
// sign up. The founder asked for visibility into who's hitting the
// signup form, including failures, so they can spot spam patterns,
// duplicate-email confusion (often a forgot-password situation), and
// just keep a finger on the pulse of growth.
//
// Sends on:
//   - Successful signup (status='ok')
//   - Supabase signUp error (status='error', e.g. duplicate email,
//     weak password rejected server-side, etc.)
//
// Does NOT send on:
//   - Client-side validation failures (empty email, password too short)
//     because those are noise; the user hasn't actually attempted a
//     real signup yet.

import { Resend } from "resend";

export type AdminSignupNotificationParams = {
  status: "ok" | "error";
  email: string;
  fullName: string;
  phone: string | null;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "support@veroax.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendAdminSignupNotification(
  params: AdminSignupNotificationParams,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const {
    status,
    email,
    fullName,
    phone,
    errorMessage,
    ipAddress,
    userAgent,
  } = params;

  const isOk = status === "ok";
  const subject = isOk
    ? `Veroax signup: ${email}`
    : `Veroax signup attempt FAILED: ${email}`;

  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const html = buildHtml({
    isOk,
    email,
    fullName,
    phone,
    errorMessage,
    ipAddress,
    userAgent,
    timestamp,
  });

  const text = buildPlainText({
    isOk,
    email,
    fullName,
    phone,
    errorMessage,
    ipAddress,
    userAgent,
    timestamp,
  });

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from:
        process.env.SUPPORT_FROM_EMAIL || "Veroax Alerts <alerts@veroax.com>",
      to: ADMIN_EMAIL,
      subject,
      text,
      html,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return { ok: false, error: message };
  }
}

type RenderArgs = {
  isOk: boolean;
  email: string;
  fullName: string;
  phone: string | null;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp: string;
};

function buildHtml(args: RenderArgs): string {
  const accentColor = args.isOk ? "#059669" : "#dc2626";
  const accentBg = args.isOk ? "#d1fae5" : "#fee2e2";
  const accentLabel = args.isOk ? "Signup completed" : "Signup attempt failed";

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#f8fafc;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <tr><td style="padding:24px 28px 12px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${accentColor};background:${accentBg};display:inline-block;padding:4px 10px;border-radius:6px;">${accentLabel}</p>
          <h1 style="margin:14px 0 0;font-size:20px;line-height:26px;color:#0f172a;">${escapeHtml(args.email)}</h1>
          <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${escapeHtml(args.timestamp)}</p>
        </td></tr>
        <tr><td style="padding:8px 28px 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            ${row("Name", args.fullName || "(not provided)")}
            ${row("Email", args.email)}
            ${row("Phone", args.phone || "(not provided)")}
            ${args.ipAddress ? row("IP", args.ipAddress) : ""}
            ${args.userAgent ? row("User agent", args.userAgent.slice(0, 200)) : ""}
            ${!args.isOk && args.errorMessage ? row("Error", args.errorMessage) : ""}
          </table>
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <p style="margin:0;font-size:12px;color:#64748b;line-height:18px;">
            Manage this user at
            <a href="https://www.veroax.com/admin/users" style="color:#4f46e5;text-decoration:underline;">/admin/users</a>
            once they appear in the list.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;width:110px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:13px;color:#1e293b;word-break:break-word;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

function buildPlainText(args: RenderArgs): string {
  const status = args.isOk ? "[SIGNUP OK]" : "[SIGNUP FAILED]";
  const lines = [
    `${status} ${args.email}`,
    args.timestamp,
    "",
    `Name:  ${args.fullName || "(not provided)"}`,
    `Email: ${args.email}`,
    `Phone: ${args.phone || "(not provided)"}`,
  ];
  if (args.ipAddress) lines.push(`IP:    ${args.ipAddress}`);
  if (args.userAgent) lines.push(`UA:    ${args.userAgent.slice(0, 200)}`);
  if (!args.isOk && args.errorMessage) {
    lines.push("");
    lines.push(`Error: ${args.errorMessage}`);
  }
  lines.push("");
  lines.push("Manage at https://www.veroax.com/admin/users");
  return lines.join("\n");
}
