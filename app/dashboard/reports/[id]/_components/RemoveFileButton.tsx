"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Small text-button "Remove" for each row in the Uploaded Documents
// inventory on the report detail page. Click opens a confirmation
// modal that spells out the consequence (re-analysis) before any
// destructive action runs.

type Props = {
  reportId: string;
  filename: string;
  ageDays: number;
  // True when this is the only file left, disables the button
  // since the route also rejects in that case.
  isLastRemaining: boolean;
};

const FREE_WINDOW_DAYS = 30;

export function RemoveFileButton({
  reportId,
  filename,
  ageDays,
  isLastRemaining,
}: Props) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const insideFreeWindow = ageDays <= FREE_WINDOW_DAYS;

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/remove-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      // Re-analysis is now running. Refresh the report page so it
      // picks up status=analyzing and the AnalysisRunner takes over.
      setShowConfirm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Removal failed.");
      setPending(false);
    }
  }

  if (isLastRemaining) {
    return (
      <span
        title="Can't remove the last remaining file. Start a new report instead."
        className="text-xs text-slate-300 cursor-not-allowed"
      >
        Remove
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="text-xs text-slate-500 hover:text-red-700 underline underline-offset-2"
      >
        Remove
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !pending && setShowConfirm(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Remove this file and re-analyze?
            </h3>
            <p className="text-sm text-slate-700 mt-2">
              Removing{" "}
              <span className="font-mono text-slate-900 break-words">
                {filename}
              </span>{" "}
              deletes it from this report&apos;s storage and triggers a fresh
              analysis of the remaining files. The current report is preserved
              as a downloadable version so you can compare.
            </p>
            {insideFreeWindow ? (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg mt-3">
                ✓ Within the {FREE_WINDOW_DAYS}-day free update window, no
                additional charge.
              </p>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mt-3">
                This report is {Math.round(ageDays)} days old. Outside the
                {" "}{FREE_WINDOW_DAYS}-day free update window the re-analysis
                will consume a report credit.
              </p>
            )}
            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mt-3">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={pending}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                className="bg-red-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-red-500 disabled:opacity-60"
              >
                {pending ? "Removing…" : "Remove and re-analyze"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
