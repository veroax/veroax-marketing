"use client";

import { useState } from "react";
import { AddDocumentsModal } from "./AddDocumentsModal";
import { EmailDraftModal } from "./EmailDraftModal";
import { ArchiveButton } from "./ArchiveButton";

// The action row that sits under the strengths/concerns/missing panels
// on the report page. Houses the modal state for "Add documents" and
// the email-draft modal.
//
// As of the "PDF is no longer the headline" reframe (commits 09ead63 +
// follow-ups), the action priority order is:
//   1. View report (PRIMARY amber)   -> opens the live share-link
//      URL in a new tab so the agent sees what the buyer would see.
//      Lazy-generates the share code on first click.
//   2. Copy share link (secondary)   -> same URL, copied to clipboard
//      for pasting into a CRM or another email channel.
//   3. Draft email to client         -> composes the buyer-facing
//      email (still attaches the PDF, still includes the share link).
//   4. Add documents to this report  -> re-analysis flow.
//   5. Download PDF (secondary, demoted from primary) -> the static
//      download for offline / printing / archive use.
//   6. Archive (existing).

type Props = {
  reportId: string;
  userId: string;
  // Days since the original analysis, passed through to the
  // AddDocumentsModal so it can show the free-window notice.
  ageDays: number;
  // Current archive state, drives the Archive ↔ Restore button label.
  archived: boolean;
};

export function AgentActions({
  reportId,
  userId,
  ageDays,
  archived,
}: Props) {
  const [showAddDocs, setShowAddDocs] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  // Shared share-link state used by BOTH the primary "View report"
  // button (opens the URL in a new tab) and the secondary "Copy
  // share link" button (writes the URL to the clipboard). Both
  // hit the same /api/reports/[id]/share-link endpoint; we cache
  // the result on the first success so a follow-up click does not
  // round-trip again.
  const [shareState, setShareState] = useState<
    | { phase: "idle" }
    | { phase: "loading"; intent: "view" | "copy" }
    | { phase: "ready"; url: string }
    | { phase: "copied"; url: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  async function ensureShareUrl(): Promise<string> {
    if (shareState.phase === "ready" || shareState.phase === "copied") {
      return shareState.url;
    }
    const res = await fetch(`/api/reports/${reportId}/share-link`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error ?? `Request failed (HTTP ${res.status}).`);
    }
    return String(data.url);
  }

  async function handleView() {
    setShareState({ phase: "loading", intent: "view" });
    try {
      const url = await ensureShareUrl();
      setShareState({ phase: "ready", url });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setShareState({
        phase: "error",
        message: err instanceof Error ? err.message : "Share link failed.",
      });
    }
  }

  async function handleCopy() {
    setShareState({ phase: "loading", intent: "copy" });
    try {
      const url = await ensureShareUrl();
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // clipboard write can fail in non-secure contexts; still
        // surface the ready state so the agent can right-click +
        // copy from the URL itself if needed.
      }
      setShareState({ phase: "copied", url });
      setTimeout(() => setShareState({ phase: "ready", url }), 6000);
    } catch (err) {
      setShareState({
        phase: "error",
        message: err instanceof Error ? err.message : "Share link failed.",
      });
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {/* Primary CTA: View report. Opens the share-link URL in
            a new tab so the agent sees exactly what the buyer
            would see. This is now the default action, replacing
            the old PDF-download-amber-primary that set the wrong
            expectation about which format is the deliverable. */}
        <button
          type="button"
          onClick={handleView}
          disabled={
            shareState.phase === "loading" &&
            shareState.intent === "view"
          }
          className="inline-flex items-center gap-2 bg-amber-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-lg hover:bg-amber-300 transition-colors shadow-sm text-sm disabled:opacity-60"
          title="Open the live web report in a new tab, the same view your buyer sees from the share link"
        >
          <span className="text-base leading-none">↗</span>
          {shareState.phase === "loading" && shareState.intent === "view"
            ? "Opening..."
            : "View report"}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={
            shareState.phase === "loading" &&
            shareState.intent === "copy"
          }
          className={
            shareState.phase === "copied"
              ? "inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm shadow-sm"
              : "inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-60"
          }
          title="Copy the public link to your clipboard so you can paste it into a CRM or another email channel"
        >
          <span className="text-base leading-none">⧉</span>
          {shareState.phase === "loading" && shareState.intent === "copy"
            ? "Generating link..."
            : shareState.phase === "copied"
              ? "Link copied!"
              : "Copy share link"}
        </button>
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50"
        >
          <span className="text-base leading-none">✉</span>
          Draft email to client
        </button>
        <button
          type="button"
          onClick={() => setShowAddDocs(true)}
          className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50"
        >
          <span className="text-base leading-none">+</span>
          Add documents to this report
        </button>
        {/* PDF download demoted from primary amber to secondary
            white-outline. Still available for offline / printing /
            archive use; no longer the headline action. */}
        <a
          href={`/api/reports/${reportId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50"
          title="Download the report as a branded PDF for email attachments, printing, or offline review"
        >
          <span className="text-base leading-none">↓</span>
          Download PDF
        </a>
        <ArchiveButton reportId={reportId} archived={archived} />
      </div>

      {shareState.phase === "copied" && (
        <p className="text-xs text-slate-600 mt-2 break-all">
          Public link:{" "}
          <a
            href={shareState.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-700 underline underline-offset-2"
          >
            {shareState.url}
          </a>
        </p>
      )}
      {shareState.phase === "error" && (
        <p className="text-xs text-red-700 mt-2">{shareState.message}</p>
      )}

      <AddDocumentsModal
        reportId={reportId}
        userId={userId}
        isOpen={showAddDocs}
        onClose={() => setShowAddDocs(false)}
        ageDays={ageDays}
      />
      <EmailDraftModal
        reportId={reportId}
        isOpen={showEmail}
        onClose={() => setShowEmail(false)}
      />
    </>
  );
}
