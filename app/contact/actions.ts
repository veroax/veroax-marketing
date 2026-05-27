"use server";

// Server action behind /contact's form. Same shape as the feedback
// action, but the email subject/body fold in the visitor-selected
// topic + phone number + best-time-to-call so sales can pick up
// where the agent left off without a back-and-forth round trip.

import { sendTransactional } from "@/lib/email/sender";
import { SUPPORT } from "@/lib/site";
export type ContactActionState = {
  ok?: boolean;
  error?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TOPIC_LABELS: Record<string, string> = {
  brokerage: "Brokerage tier inquiry",
  team: "Team tier inquiry",
  investor: "Investor inquiry",
  sales: "Sales question",
};

export async function submitContactAction(
  _prev: ContactActionState | undefined,
  formData: FormData,
): Promise<ContactActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const bestTime = String(formData.get("best_time") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const topic = (String(formData.get("topic") ?? "sales") || "sales")
    .toLowerCase();
  // Honeypot: bots will fill the website field; humans will not see it.
  const honeypot = String(formData.get("website") ?? "").trim();

  if (honeypot.length > 0) {
    // Pretend success so the bot doesn't retry.
    return { ok: true };
  }

  if (!name) return { error: "Name is required." };
  if (!email || !EMAIL_REGEX.test(email)) {
    return { error: "Please enter a valid email." };
  }
  if (!message) return { error: "Please write a message." };
  if (message.length < 10) {
    return { error: "Message is too short. Tell us a bit more so we can help." };
  }
  if (message.length > 5000) {
    return { error: "Message is too long. Trim it to under 5,000 characters." };
  }

  const topicLabel = TOPIC_LABELS[topic] ?? "Sales question";

  // replyTo override: support staff want to hit Reply and answer the
  // user directly, not bounce inside support@. The From: stays as the
  // canonical noreply@ sender.
  const result = await sendTransactional({
    to: SUPPORT.email,
    replyTo: email,
    subject: `${topicLabel} from ${name}`,
    text:
      `Topic: ${topicLabel}\n` +
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      (phone ? `Phone: ${phone}\n` : "") +
      (company ? `Company / brokerage: ${company}\n` : "") +
      (bestTime ? `Best time to call: ${bestTime}\n` : "") +
      `\n---\n\n${message}`,
    html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;line-height:1.55;max-width:560px;">
          <p style="background:#fef3c7;color:#92400e;padding:6px 10px;border-radius:6px;display:inline-block;margin-top:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">
            ${escapeHtml(topicLabel)}
          </p>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> <a href="mailto:${encodeURIComponent(email)}">${escapeHtml(email)}</a></p>
          ${phone ? `<p><strong>Phone:</strong> <a href="tel:${encodeURIComponent(phone)}">${escapeHtml(phone)}</a></p>` : ""}
          ${company ? `<p><strong>Company / brokerage:</strong> ${escapeHtml(company)}</p>` : ""}
          ${bestTime ? `<p><strong>Best time to call:</strong> ${escapeHtml(bestTime)}</p>` : ""}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
          <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
        </div>
      `,
  });

  if (result.skipped) {
    return {
      error: `Email sending is not configured on this deployment. Email ${SUPPORT.email} directly, or call ${SUPPORT.phone}.`,
    };
  }
  if (!result.ok) {
    return { error: `Could not send: ${result.error ?? "unknown error"}` };
  }

  return { ok: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
