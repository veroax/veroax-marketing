"use server";

import { Resend } from "resend";

// Server action that delivers a feedback message to support@veroax.com
// via the existing Resend integration. Same shape as the contact-form
// API route — we just write it as a server action so the page can use
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
    return { error: "Message is too short to be useful — add a bit more." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      error:
        "Email sending isn't configured on this deployment. Email support@veroax.com directly.",
    };
  }

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from: "Veroax Feedback <feedback@veroax.com>",
      to: "support@veroax.com",
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
    if (error) {
      return { error: `Could not send feedback: ${error.message}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed.";
    return { error: message };
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
