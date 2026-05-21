"use client";

import { useState } from "react";
import { AddDocumentsModal } from "./AddDocumentsModal";

// The action row that sits under the strengths/concerns/missing panels
// on the report page. Houses the modal state for "Add documents" and
// will host the email-draft modal in loop item 8.

type Props = {
  reportId: string;
  userId: string;
  // Days since the original analysis — passed through to the
  // AddDocumentsModal so it can show the free-window notice.
  ageDays: number;
};

export function AgentActions({ reportId, userId, ageDays }: Props) {
  const [showAddDocs, setShowAddDocs] = useState(false);

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
        {/* Draft email to client — wired in loop item 8. */}
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          title="Coming in the next iteration"
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
      </div>

      <AddDocumentsModal
        reportId={reportId}
        userId={userId}
        isOpen={showAddDocs}
        onClose={() => setShowAddDocs(false)}
        ageDays={ageDays}
      />
    </>
  );
}
