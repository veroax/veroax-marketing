"use client";

// AdminDeleteReportButton, soft-deletes a report from the admin
// detail view. Modal confirmation up front because soft-delete
// pulls the report off every public surface immediately (admin
// list, agent dashboard, public share link, PDF download). The
// row stays recoverable from /admin/reports/deleted for 30 days
// before the purge cron permanently removes it.
//
// Optional reason textarea inside the modal so the admin can leave
// a note for the audit trail (visible on the deleted-reports list).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AdminDeleteReportButton({
  reportId,
  reportLabel,
}: {
  reportId: string;
  reportLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || `HTTP ${res.status}`,
        );
      }
      setOpen(false);
      startTransition(() => {
        // Send the admin back to the deleted-bucket view so they
        // can see the row they just deleted (and undo if needed).
        router.push("/admin/reports/deleted");
        router.refresh();
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setReason("");
          setErr(null);
        }}
        className="text-sm text-red-700 hover:text-red-900 px-4 py-2 rounded-lg border border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
        title="Soft-delete this report. Recoverable for 30 days from /admin/reports/deleted."
      >
        Delete report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !busy && setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900">
              Delete this report?
            </h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Removes the report from the agent&apos;s dashboard, the
              admin list, the public share link, and the PDF download
              right away. The row goes into a deleted bucket for 30
              days and can be restored from{" "}
              <span className="font-mono">/admin/reports/deleted</span>.
              After 30 days a cron permanently removes the row and its
              storage files.
            </p>
            <p className="text-xs text-slate-500 mt-3 font-mono break-all">
              {reportLabel}
            </p>

            <label className="block mt-4">
              <span className="text-xs font-semibold text-slate-700 block mb-1">
                Reason (optional, audit log only)
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Failed test run / agent requested removal / duplicate of report ABC / etc."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </label>

            {err && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mt-3">
                {err}
              </p>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy || pending}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || pending}
                className="bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-red-800 disabled:opacity-60"
              >
                {busy || pending ? "Deleting..." : "Delete report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
