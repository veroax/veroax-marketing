"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-row action chips for the reports list (and archive list). Renders
// inline text-buttons rather than a dropdown so the actions are
// immediately visible without a click, there are only two of them and
// they're both useful. Archive is reversible (lives one click away in
// the Archive view), so it uses a simple inline confirm. Delete is
// destructive and unrecoverable, so it opens a modal that requires the
// agent to type DELETE before the button enables, same pattern other
// destructive flows in the app use.

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
  const [deleteTypedConfirm, setDeleteTypedConfirm] = useState("");

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
            setDeleteTypedConfirm("");
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
              Permanently deletes{" "}
              <span className="font-semibold text-slate-900 break-words">
                {reportLabel}
              </span>
              , including every uploaded PDF and the generated analysis. This
              cannot be undone. Use Archive instead if you only want to hide
              it from your main list.
            </p>
            <label className="block mt-4">
              <span className="text-xs font-semibold text-slate-700 block mb-1">
                Type <span className="font-mono text-red-700">DELETE</span> to
                confirm
              </span>
              <input
                type="text"
                value={deleteTypedConfirm}
                onChange={(e) => setDeleteTypedConfirm(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
                autoFocus
              />
            </label>
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
                disabled={deleteBusy || deleteTypedConfirm.trim() !== "DELETE"}
                className="bg-red-600 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteBusy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
