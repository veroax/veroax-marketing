"use client";

import { useEffect, useState } from "react";

// Triggered by "Draft email summary" on the report page.
//
// Repositioned product: the agent's analysis is the agent's PREP TOOL.
// This email is a BRIEF SUMMARY inviting the client to a conversation,
// not a delivery vehicle for the full analysis. No PDF is attached;
// the full analysis stays with the agent.
//
// Flow:
//   1. On open, POST /api/reports/[id]/email/draft → seed
//      subject + body_plain + body_html (a short greeting + signal +
//      CTA to talk).
//   2. Agent fills in the recipient, optionally edits subject/body.
//   3. Two send options:
//      - "Open in my email app", constructs a mailto: URL with the
//        plain body and opens it.
//      - "Send via Veroax", POSTs to /api/reports/[id]/email/send
//        with via='resend', which sends through Resend with Reply-To
//        set to the agent's address.
//
// Recipient is required; subject is required; body must be non-empty.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DraftResponse = {
  recipient_suggestion: string | null;
  subject: string;
  body_plain: string;
  body_html: string;
};

type Props = {
  reportId: string;
  isOpen: boolean;
  onClose: () => void;
};

export function EmailDraftModal({ reportId, isOpen, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyPlain, setBodyPlain] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState<"mailto" | "resend" | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load draft once the modal opens. We refetch each time so updates
  // to the underlying report (e.g. a re-analysis just completed)
  // surface in the seeded text.
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    fetch(`/api/reports/${reportId}/email/draft`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        return (await res.json()) as DraftResponse;
      })
      .then((draft) => {
        // Strip the angle brackets from the suggestion so the agent
        // just sees the name; they type the actual email address.
        setRecipient("");
        setSubject(draft.subject);
        setBodyPlain(draft.body_plain);
        setBodyHtml(draft.body_html);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load draft.");
      })
      .finally(() => setLoading(false));
  }, [isOpen, reportId]);

  if (!isOpen) return null;

  function validate(): string | null {
    if (!recipient.trim() || !EMAIL_REGEX.test(recipient.trim())) {
      return "Enter a valid recipient email.";
    }
    if (!subject.trim()) return "Subject can't be empty.";
    if (!bodyPlain.trim()) return "Body can't be empty.";
    return null;
  }

  async function handleSendViaVeroax() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSending("resend");
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_email: recipient.trim(),
          subject: subject.trim(),
          body_plain: bodyPlain,
          body_html: bodyHtml,
          via: "resend",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setSuccess(
        data.warning
          ? `Sent. (Note: ${data.warning})`
          : "Sent. Your client will reply when they're ready to talk.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(null);
    }
  }

  async function handleOpenInMail() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSending("mailto");
    setError(null);
    try {
      // Log first; the mailto handoff is fire-and-forget after.
      const res = await fetch(`/api/reports/${reportId}/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_email: recipient.trim(),
          subject: subject.trim(),
          body_plain: bodyPlain,
          body_html: bodyHtml,
          via: "mailto",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      // No attachment reminder: the email is intentionally just a
      // brief summary inviting the conversation; the full analysis
      // stays with the agent.
      const url =
        `mailto:${encodeURIComponent(recipient.trim())}` +
        `?subject=${encodeURIComponent(subject.trim())}` +
        `&body=${encodeURIComponent(bodyPlain)}`;
      window.location.href = url;
      setSuccess("Opening your mail app…");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open mail app.");
    } finally {
      setSending(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 overflow-y-auto py-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="text-lg font-bold text-slate-900">Draft an email summary</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 leading-none text-2xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          We&apos;ve pre-filled a brief summary with a CTA inviting the
          conversation. No findings detail or attachments, the analysis
          stays with you. Edit anything before sending.
        </p>

        {loading ? (
          <p className="text-sm text-slate-500">Loading draft…</p>
        ) : (
          <div className="space-y-3">
            <Field label="To">
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="client@example.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                required
              />
            </Field>
            <Field label="Subject">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </Field>
            <Field label="Body">
              <textarea
                value={bodyPlain}
                onChange={(e) => {
                  setBodyPlain(e.target.value);
                  // When the agent edits, we lose the carefully-styled
                  // HTML body. Fall back to a plain-text wrapper for the
                  // resend path so they still see something readable.
                  setBodyHtml("");
                }}
                rows={12}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </Field>

          </div>
        )}

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mt-3">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded mt-3">
            {success}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={sending !== null}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleOpenInMail}
            disabled={loading || sending !== null}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {sending === "mailto" ? "Opening…" : "Open in my email app"}
          </button>
          <button
            type="button"
            onClick={handleSendViaVeroax}
            disabled={loading || sending !== null}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-amber-400 text-indigo-950 hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending === "resend" ? "Sending…" : "Send via Veroax"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
