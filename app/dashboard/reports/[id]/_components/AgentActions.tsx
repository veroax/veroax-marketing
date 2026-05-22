"use client";

import { useState } from "react";
import { AddDocumentsModal } from "./AddDocumentsModal";
import { EmailDraftModal } from "./EmailDraftModal";
import { ArchiveButton } from "./ArchiveButton";

// The action row that sits under the strengths/concerns/missing panels
// on the report page. Houses the modal state for "Add documents" and
// will host the email-draft modal in loop item 8.

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
