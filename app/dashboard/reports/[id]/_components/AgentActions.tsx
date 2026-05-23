"use client";

import { useState } from "react";
import { AddDocumentsModal } from "./AddDocumentsModal";
import { EmailDraftModal } from "./EmailDraftModal";
import { ArchiveButton } from "./ArchiveButton";

// The action row that sits under the strengths/concerns/missing panels
// on the report page. Houses the modal state for "Add documents" and
// the email-draft modal, plus a "Copy share link" button that fetches
// (and lazily generates) the report's public /r/{code} URL.

type Props = {
  reportId: string;
  userId: string;
  // Days since the original analysis — passed through to the
  // AddDocumentsModal so it can show the free-window notice.
  ageDays: number;
  // Current archive state — drives the Archive ↔ Restore button label.
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
  const [shareState, setShareState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "copied"; url: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  async function handleShare() {
    setShareState({ phase: "loading" });
    try {
      const res = await fetch(`/api/reports/${reportId}/share-link`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (HTTP ${res.status}).`);
      }
      const url = String(data.url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // clipboard write can fail in non-secure contexts; still
        // show the URL so the agent can copy manually.
      }
      setShareState({ phase: "copied", url });
      // Auto-reset to idle after a few seconds so the button doesn't
      // stay green forever after a single use.
      setTimeout(() => setShareState({ phase: "idle" }), 6000);
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
        <a
          href={`/api/reports/${reportId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-amber-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-lg hover:bg-amber-300 transition-colors shadow-sm text-sm"
        >
          <span className="text-base leading-none">↓</span>
          Download full PDF report
        </a>
        <button
          type="button"
          onClick={handleShare}
          disabled={shareState.phase === "loading"}
          className={
            shareState.phase === "copied"
              ? "inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm shadow-sm"
              : "inline-flex items-center gap-2 bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-indigo-600 disabled:opacity-60"
          }
          title="Copy a public link to this report — share with your buyer or anyone who needs to see it"
        >
          <span className="text-base leading-none">↗</span>
          {shareState.phase === "loading"
            ? "Generating link…"
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
