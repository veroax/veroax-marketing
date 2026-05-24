"use client";

// SuspendUserButton: toggles a user's suspended state. When NOT
// suspended, opens a modal that asks for an optional reason then
// POSTs to /api/admin/suspend-user. When suspended, opens a smaller
// confirm that POSTs to /api/admin/unsuspend-user. Both end with a
// router.refresh() so the parent page re-renders with the new state.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  userLabel: string;
  isSuspended: boolean;
  suspendedReason: string | null;
};

export function SuspendUserButton({
  userId,
  userLabel,
  isSuspended,
  suspendedReason,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function submitSuspend() {
    setError(null);
    const res = await fetch(`/api/admin/suspend-user/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Suspend failed.",
      );
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  }

  async function submitUnsuspend() {
    setError(null);
    const res = await fetch(`/api/admin/unsuspend-user/${userId}`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Unsuspend failed.",
      );
      return;
    }
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setReason("");
          setOpen(true);
        }}
        className={
          isSuspended
            ? "bg-white border border-emerald-300 text-emerald-800 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-emerald-50"
            : "bg-white border border-amber-400 text-amber-800 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-amber-50"
        }
        title={
          isSuspended
            ? "Restore login + clear suspension state"
            : "Block login + cancel any Stripe subscription"
        }
      >
        {isSuspended ? "Unsuspend" : "Suspend"}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl">
            {isSuspended ? (
              <>
                <h3 className="text-lg font-bold text-slate-900">
                  Restore {userLabel}?
                </h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  This will clear the auth ban so they can log in
                  again, and clear their suspended state. Their data
                  was preserved across the suspension, so they will
                  see their report history when they sign back in.
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Note: any Stripe subscription that was cancelled at
                  suspend time stays cancelled. The user can
                  self-resubscribe from the pricing page when they
                  return.
                </p>
                {suspendedReason ? (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
                    Original suspension reason: {suspendedReason}
                  </p>
                ) : null}
                {error ? (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
                    {error}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm text-slate-500 px-4 py-2 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitUnsuspend}
                    disabled={pending}
                    className="bg-emerald-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {pending ? "Restoring..." : "Restore access"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-900">
                  Suspend {userLabel}?
                </h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  This will:
                </p>
                <ul className="text-sm text-slate-700 list-disc list-inside space-y-1 mt-1">
                  <li>Block them from logging in (auth ban)</li>
                  <li>Cancel any active Stripe subscription so they stop being billed</li>
                  <li>Preserve all their data so the action is reversible</li>
                </ul>
                <label className="block mt-4">
                  <span className="text-xs font-semibold text-slate-700 block mb-1">
                    Reason (optional, stored on the audit row)
                  </span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="e.g., user requested account hold; chargeback investigation; abuse report"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </label>
                {error ? (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
                    {error}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm text-slate-500 px-4 py-2 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitSuspend}
                    disabled={pending}
                    className="bg-amber-600 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-amber-500 disabled:opacity-60"
                  >
                    {pending ? "Suspending..." : "Suspend user"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
