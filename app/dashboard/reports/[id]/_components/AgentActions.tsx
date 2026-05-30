"use client";

import { useState } from "react";
import { AddDocumentsModal } from "./AddDocumentsModal";
import { EmailDraftModal } from "./EmailDraftModal";
import { ArchiveButton } from "./ArchiveButton";

// The action row that sits under the strengths/concerns/missing panels
// on the report page. Houses the modal state for "Add documents" and
// the email-draft modal.
//
// Repositioned product (commits d9e8a34 / b2534f3 onward): the analysis
// is the AGENT'S prep tool, not something the agent forwards to the
// buyer. So the action priority is now:
//   1. View the analysis (PRIMARY amber) -> opens the analysis in a
//      clean reader layout (mobile-friendly, no dashboard chrome),
//      useful for pulling up on a phone in front of the property.
//      Routes through /r/{code} which is kept available as a quiet
//      private link.
//   2. Draft email (secondary) -> composes a brief summary email
//      (overall rating + top concerns at a high level + CTA to talk)
//      that the agent can edit and send to invite the conversation
//      with their client. The full analysis stays in the agent's
//      control; the email is the invitation, not the deliverable.
//   3. Add documents (re-analysis flow).
//   4. Download PDF -> offline reference, printing, archive.
//   5. Archive (existing).
//
// REMOVED in the repositioning:
//   - "Copy share link" button (was advertising the /r/{code} URL
//     as a shareable buyer asset; route still works but is no longer
//     surfaced as a sharing affordance).

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
  // View-link state for the "View the analysis" button. Opens the
  // /r/{code} URL in a new tab so the agent reads their work in the
  // clean reader layout (mobile-friendly, no dashboard chrome). The
  // /r/{code} route is kept available as a quiet private link; we
  // just stopped marketing it as a shareable buyer asset.
  const [shareState, setShareState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; url: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  async function ensureShareUrl(): Promise<string> {
    if (shareState.phase === "ready") {
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
    setShareState({ phase: "loading" });
    try {
      const url = await ensureShareUrl();
      setShareState({ phase: "ready", url });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setShareState({
        phase: "error",
        message: err instanceof Error ? err.message : "Could not open the analysis.",
      });
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {/* Primary CTA: View the analysis. Opens /r/{code} in a new
            tab so the agent can read the analysis in a clean reader
            layout (mobile-friendly, no dashboard chrome). Despite
            the underlying URL pattern, this is no longer marketed
            as a share link. */}
        <button
          type="button"
          onClick={handleView}
          disabled={shareState.phase === "loading"}
          className="inline-flex items-center gap-2 bg-amber-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-lg hover:bg-amber-300 transition-colors shadow-sm text-sm disabled:opacity-60"
          title="Open the analysis in a clean reader layout, useful for pulling up on your phone in front of the property"
        >
          <span className="text-base leading-none">↗</span>
          {shareState.phase === "loading"
            ? "Opening..."
            : "View the analysis"}
        </button>
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50"
          title="Draft a brief summary email for your client that invites them into the conversation. You stay in control of the details."
        >
          <span className="text-base leading-none">✉</span>
          Draft email summary
        </button>
        <button
          type="button"
          onClick={() => setShowAddDocs(true)}
          className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50"
        >
          <span className="text-base leading-none">+</span>
          Add documents
        </button>
        {/* PDF download stays as a secondary action for offline
            reference / printing / agent records. */}
        <a
          href={`/api/reports/${reportId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50"
          title="Download the analysis as a branded PDF for offline review, printing, or your records"
        >
          <span className="text-base leading-none">↓</span>
          Download PDF
        </a>
        <ArchiveButton reportId={reportId} archived={archived} />
      </div>

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
