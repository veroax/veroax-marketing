"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-row action chips for the reports list (and archive list).
// Renders inline text-buttons rather than a dropdown so the actions
// are immediately visible without a click, there are only two of
// them and they're both useful. Both are reversible: Archive moves
// the report to the Archive view (one click to restore), and
// Delete moves the row into the deleted bucket for 30 days during
// which an admin can restore it. After 30 days the daily purge
// cron permanently removes the row + storage. Modal copy explains
// the difference so the agent picks the right one.

type Variant = "main" | "archive";

type Props = {
  reportId: string;
  // Used in the delete-confirmation modal so the agent can see which
  // report they're about to nuke. Falls back gracefully when null.
  reportLabel: string;
  // "main" = unarchived list → primary toggle is Archive
  // "archive" = archived list → primary toggle is Restore
  variant: Variant;
};

export function RowActions({ reportId, reportLabel, variant }: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    null | "archive" | "delete"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  async function handleArchive() {
    const isArchiving = variant === "main";
    if (isArchiving) {
      const ok = window.confirm(
        "Archive this report? It'll disappear from your main list but stay accessible from the Archive view in the sidebar.",
      );
      if (!ok) return;
    }
    setPendingAction("archive");
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: isArchiving }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setPendingAction(null);
    }
  }

  async function handleConfirmedDelete() {
    setPendingAction("delete");
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/delete`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      // Row is gone, close the modal and refresh the list.
      setShowDeleteModal(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setPendingAction(null);
    }
  }

  const archiveLabel = variant === "main" ? "Archive" : "Restore";
  const archiveBusy = pendingAction === "archive";
  const deleteBusy = pendingAction === "delete";

  return (
    <>
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={handleArchive}
          disabled={archiveBusy || deleteBusy}
          className="text-slate-500 hover:text-indigo-700 underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {archiveBusy
            ? variant === "main"
              ? "Archiving…"
              : "Restoring…"
            : archiveLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowDeleteModal(true);
          }}
          disabled={archiveBusy || deleteBusy}
          className="text-slate-500 hover:text-red-700 underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Delete
        </button>
        {error && (
          <span className="text-[11px] text-red-700 ml-1">{error}</span>
        )}
      </div>

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !deleteBusy && setShowDeleteModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Delete this report?
            </h3>
            <p className="text-sm text-slate-700 mt-2">
              Removes{" "}
              <span className="font-semibold text-slate-900 break-words">
                {reportLabel}
              </span>
              {" "}from your dashboard, the public share link, and the
              PDF download. The report goes into a deleted bucket for
              30 days; during that window, an admin can restore it on
              request. After 30 days the row and its uploaded PDFs
              are permanently removed. Use Archive instead if you
              only want to hide it from your main list, no
              restoration request needed.
            </p>
            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mt-3">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteBusy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedDelete}
                disabled={deleteBusy}
                className="bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteBusy ? "Deleting..." : "Delete report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
