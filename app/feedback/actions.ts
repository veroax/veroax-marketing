"use server";

import { sendTransactional } from "@/lib/email/sender";
import { SUPPORT } from "@/lib/site";

// Server action that delivers a feedback message to support@veroax.com
// via the existing Resend integration. Same shape as the contact-form
// API route, we just write it as a server action so the page can use
// useActionState() and render acknowledgments inline.

export type FeedbackActionState = {
  ok?: boolean;
  error?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitFeedbackAction(
  _prev: FeedbackActionState | undefined,
  formData: FormData,
): Promise<FeedbackActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const reportId = String(formData.get("report_id") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!email || !EMAIL_REGEX.test(email)) {
    return { error: "Please enter a valid email." };
  }
  if (!message) return { error: "Please write a message." };
  if (message.length < 10) {
    return { error: "Message is too short to be useful. Add a bit more." };
  }

  // replyTo override: support staff want to reply directly to the
  // user who submitted feedback. The From: stays as noreply@.
  const result = await sendTransactional({
    to: SUPPORT.email,
    replyTo: email,
    subject: `Feedback from ${name}${reportId ? ` (report ${reportId.slice(0, 8)})` : ""}`,
    text:
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      (reportId ? `Report ID: ${reportId}\n` : "") +
      `\n---\n\n${message}`,
    html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;line-height:1.55;max-width:560px;">
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> <a href="mailto:${encodeURIComponent(email)}">${escapeHtml(email)}</a></p>
          ${reportId ? `<p><strong>Report ID:</strong> <code>${escapeHtml(reportId)}</code></p>` : ""}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
          <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
        </div>
      `,
  });

  if (result.skipped) {
    return {
      error: `Email sending isn't configured on this deployment. Email ${SUPPORT.email} directly.`,
    };
  }
  if (!result.ok) {
    return { error: `Could not send feedback: ${result.error ?? "unknown error"}` };
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
