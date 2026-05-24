// Alerting: send an email when something notable breaks.
//
// Design choices:
//
//   - Email only, no SMS in v1. Twilio is a separate integration;
//     for now, the founder can configure their email client to
//     forward "[Veroax alert]" subjects to SMS via their carrier's
//     email-to-text gateway (see the bottom of this file).
//
//   - Transition-based, not threshold-based. We emit an alert when
//     a service flips from ok→fail, again when it flips back to
//     ok (recovery email), and a reminder every 4 hours if it
//     stays broken. This avoids the "Anthropic was down for 6
//     hours and you got 24 identical emails" failure mode that
//     basic monitoring systems make.
//
//   - Persisted in alert_notifications. Each fire/recovery is one
//     row so the /admin/alerts page is the audit trail and the
//     dedup lookup at the same time.
//
//   - Recipients come from ADMIN_ALERT_EMAILS env var (comma-
//     separated). Default to support@veroax.com if unset so the
//     founder still gets paged on day one without having to
//     remember a new env var.

import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "firing" | "recovered";

export type AlertInput = {
  /** Stable key for dedup. Reuse across runs of the same alert source. */
  alert_key: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
  subject: string;
  /** Plain-text body. We wrap into a minimal HTML envelope on send. */
  body: string;
  metadata?: Record<string, unknown>;
  /**
   * Minimum minutes between identical-key fires when status='firing'.
   * Default 240 (4 hours). Recovery emails always send regardless.
   */
  cooldownMinutes?: number;
};

export type AlertResult = {
  sent: boolean;
  reason:
    | "sent"
    | "no_recipient"
    | "no_resend_key"
    | "cooldown"
    | "send_failed";
  detail?: string;
};

const DEFAULT_COOLDOWN_MINUTES = 240;

function resolveRecipients(): string[] {
  const raw =
    process.env.ADMIN_ALERT_EMAILS ||
    process.env.SUPPORT_NOTIFICATION_EMAIL ||
    "support@veroax.com";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function severityLabel(s: AlertSeverity): string {
  return s === "critical" ? "CRITICAL" : s === "warning" ? "WARNING" : "INFO";
}

function severityColor(s: AlertSeverity): string {
  return s === "critical" ? "#DC2626" : s === "warning" ? "#F59E0B" : "#475569";
}

function renderEmailHtml(opts: {
  severity: AlertSeverity;
  status: AlertStatus;
  subject: string;
  body: string;
  metadata: Record<string, unknown>;
}): string {
  const sev = severityLabel(opts.severity);
  const color = severityColor(opts.severity);
  const statusPill =
    opts.status === "recovered"
      ? '<span style="background:#10B981;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;letter-spacing:1px;">RECOVERED</span>'
      : `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;letter-spacing:1px;">${sev}</span>`;
  const metaJson = JSON.stringify(opts.metadata, null, 2);
  const metaBlock =
    metaJson === "{}"
      ? ""
      : `<pre style="background:#F1F5F9;border:1px solid #CBD5E1;border-radius:6px;padding:12px;font-size:12px;color:#334155;overflow:auto;">${escapeHtml(metaJson)}</pre>`;
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#1E293B;background:#F8FAFC;padding:24px;">
    <table style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px;">
      <tr><td>
        ${statusPill}
        <h1 style="margin:12px 0 6px;font-size:20px;color:#0F172A;">${escapeHtml(opts.subject)}</h1>
        <p style="white-space:pre-wrap;line-height:1.5;font-size:14px;margin:12px 0;">${escapeHtml(opts.body)}</p>
        ${metaBlock}
        <p style="font-size:11px;color:#64748B;margin-top:18px;">Sent automatically by the Veroax alerting system. Configure recipients via the ADMIN_ALERT_EMAILS environment variable on Vercel. See <a href="https://www.veroax.com/admin/alerts" style="color:#4338CA;">/admin/alerts</a> for the full history.</p>
      </td></tr>
    </table>
  </body></html>`;
}

async function lastAlertOfKey(alert_key: string): Promise<{
  status: AlertStatus;
  sent_at: string;
} | null> {
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("alert_notifications")
      .select("status, sent_at")
      .eq("alert_key", alert_key)
      .order("sent_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as
      | { status: AlertStatus; sent_at: string }
      | undefined;
    return row ?? null;
  } catch (err) {
    console.error("[alerting] lastAlertOfKey lookup failed:", err);
    return null;
  }
}

async function recordAlert(opts: {
  alert_key: string;
  severity: AlertSeverity;
  status: AlertStatus;
  subject: string;
  body: string;
  sent_to: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    await admin.from("alert_notifications").insert({
      alert_key: opts.alert_key,
      severity: opts.severity,
      status: opts.status,
      subject: opts.subject,
      body: opts.body,
      sent_to: opts.sent_to,
      metadata: opts.metadata,
    });
  } catch (err) {
    console.error("[alerting] persist failed:", err);
  }
}

/**
 * Send an alert email, with dedup. Returns whether the email was
 * actually sent. Safe to call from anywhere; never throws.
 */
export async function notifyAlert(input: AlertInput): Promise<AlertResult> {
  const severity: AlertSeverity = input.severity ?? "warning";
  const status: AlertStatus = input.status ?? "firing";
  const metadata = input.metadata ?? {};
  const cooldownMinutes = input.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES;

  const recipients = resolveRecipients();
  if (recipients.length === 0) {
    return { sent: false, reason: "no_recipient" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[alerting] RESEND_API_KEY missing, can't send");
    return { sent: false, reason: "no_resend_key" };
  }

  // Cooldown only applies to firing alerts. Recovery emails always
  // send so the founder knows the incident is over.
  if (status === "firing") {
    const last = await lastAlertOfKey(input.alert_key);
    if (last && last.status === "firing") {
      const ageMs = Date.now() - new Date(last.sent_at).getTime();
      if (ageMs < cooldownMinutes * 60 * 1000) {
        return {
          sent: false,
          reason: "cooldown",
          detail: `Last fire ${Math.round(ageMs / 60000)} min ago; cooldown is ${cooldownMinutes} min.`,
        };
      }
    }
  }

  const fromAddress =
    process.env.SUPPORT_FROM_EMAIL || "Veroax alerts <alerts@veroax.com>";
  const subjectPrefix =
    status === "recovered"
      ? "[Veroax recovered]"
      : severity === "critical"
        ? "[Veroax CRITICAL]"
        : "[Veroax alert]";
  const fullSubject = `${subjectPrefix} ${input.subject}`;

  try {
    const resend = new Resend(apiKey);
    const sendResult = await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject: fullSubject,
      html: renderEmailHtml({
        severity,
        status,
        subject: input.subject,
        body: input.body,
        metadata,
      }),
    });
    if (sendResult.error) {
      console.error("[alerting] resend send failed:", sendResult.error);
      return {
        sent: false,
        reason: "send_failed",
        detail: sendResult.error.message,
      };
    }
  } catch (err) {
    console.error("[alerting] send threw:", err);
    return {
      sent: false,
      reason: "send_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  await recordAlert({
    alert_key: input.alert_key,
    severity,
    status,
    subject: fullSubject,
    body: input.body,
    sent_to: recipients.join(", "),
    metadata,
  });

  return { sent: true, reason: "sent" };
}

/**
 * Convenience wrapper for "service flipped state" alerts driven by
 * the synthetic heartbeat. Compares prev_ok to current_ok and:
 *   prev=ok, now=fail   → fires the "firing" alert
 *   prev=fail, now=ok   → fires the "recovered" alert
 *   prev=fail, now=fail → fires periodic reminder (cooldown gate)
 *   prev=ok, now=ok     → no-op
 *   no prev, now=fail   → fires "firing" (treat as new failure)
 */
export async function notifyServiceTransition(opts: {
  alert_key: string;
  service_label: string;
  prev_ok: boolean | null;
  current_ok: boolean;
  latency_ms: number | null;
  error_message: string | null;
  metadata?: Record<string, unknown>;
  reminderCooldownMinutes?: number;
}): Promise<AlertResult> {
  const cooldown = opts.reminderCooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES;

  // Recovery case.
  if (opts.prev_ok === false && opts.current_ok) {
    return notifyAlert({
      alert_key: opts.alert_key,
      severity: "info",
      status: "recovered",
      subject: `${opts.service_label} is back up`,
      body: `The ${opts.service_label} heartbeat just succeeded after a previous failure. Latency: ${
        opts.latency_ms !== null ? `${opts.latency_ms}ms` : "n/a"
      }.`,
      metadata: opts.metadata ?? {},
    });
  }

  // Newly firing OR sustained-firing-with-cooldown-expired case.
  if (!opts.current_ok) {
    return notifyAlert({
      alert_key: opts.alert_key,
      severity: "critical",
      status: "firing",
      subject: `${opts.service_label} heartbeat failing`,
      body: `The ${opts.service_label} synthetic heartbeat just failed.\n\nError: ${
        opts.error_message ?? "(no error message)"
      }\nLatency: ${opts.latency_ms !== null ? `${opts.latency_ms}ms` : "n/a"}\n\nFix this in Vercel env vars / the provider's dashboard. The next hourly ping will re-test automatically.`,
      metadata: opts.metadata ?? {},
      cooldownMinutes: cooldown,
    });
  }

  // ok→ok stays silent.
  return { sent: false, reason: "cooldown", detail: "still healthy" };
}

// ============================================================
// Note on SMS / pager-style notifications
// ============================================================
//
// We don't ship Twilio in v1. The simplest path to text-message
// alerts is your carrier's email-to-text gateway:
//
//   Verizon:  <number>@vtext.com
//   AT&T:     <number>@txt.att.net
//   T-Mobile: <number>@tmomail.net
//   Sprint:   <number>@messaging.sprintpcs.com
//
// Add that address to ADMIN_ALERT_EMAILS alongside your real
// inbox. Carrier gateways are best-effort (no delivery receipts,
// occasional drops) so do not rely on them for critical pages.
//
// If you want real SMS, plug in Twilio: 10 lines in this file
// behind an environment variable. Tell me when you're ready.
