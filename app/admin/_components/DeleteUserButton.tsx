"use client";

// DeleteUserButton: hard-delete a user. Anti-fat-finger gate: the
// admin must type the target's email exactly before the destructive
// button enables. Modal explains what gets removed (Stripe sub,
// storage, profile + cascade) and what stays (Stripe customer for
// financial history, audit_log rows with user_id nulled out).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  userEmail: string;
};

export function DeleteUserButton({ userId, userEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const matches = typed.trim().toLowerCase() === userEmail.trim().toLowerCase();

  async function submit() {
    setError(null);
    const res = await fetch(`/api/admin/delete-user/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_email: typed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Delete failed.");
      return;
    }
    setOpen(false);
    // Redirect back to the users list since this profile is gone.
    startTransition(() => {
      router.push("/admin/users");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setTyped("");
          setOpen(true);
        }}
        className="bg-white border border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-red-50"
        title="Permanently delete this user and all their data"
      >
        Delete permanently
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div className="bg-white rounded-2xl border border-red-200 max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-red-700 text-white px-1.5 py-0.5 rounded">
                Destructive
              </span>
              <h3 className="text-lg font-bold text-slate-900">
                Permanently delete this user?
              </h3>
            </div>
            <p className="text-sm text-slate-700 mt-2 leading-relaxed">
              This action <strong>cannot be undone</strong>. It will:
            </p>
            <ul className="text-sm text-slate-700 list-disc list-inside space-y-1 mt-2">
              <li>Cancel every active Stripe subscription</li>
              <li>Delete every uploaded disclosure PDF in storage</li>
              <li>
                Delete their profile, reports, subscriptions, email drafts,
                and credit ledger (foreign keys cascade)
              </li>
              <li>Delete the underlying auth account so they cannot log in</li>
            </ul>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              The Stripe <em>customer</em> record stays (financial history
              for refunds + accounting). Audit-log rows that referenced this
              user stay too, with the user_id set to null.
            </p>

            <label className="block mt-5">
              <span className="text-xs font-semibold text-slate-700 block mb-1">
                Type{" "}
                <span className="font-mono text-red-700 break-all">
                  {userEmail}
                </span>{" "}
                to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={userEmail}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
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
                disabled={!matches || pending}
                onClick={submit}
                className="bg-red-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Deleting..." : "Delete this user forever"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
