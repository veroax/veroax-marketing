"use client";

// Two related password-management actions for the site admin on
// /admin/users/[id]:
//   1. Send password-reset email (gentle, no admin sees the password)
//   2. Force-set a new password (power tool for stuck users)

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  userEmail: string;
};

export function AdminPasswordActions({ userId, userEmail }: Props) {
  const [open, setOpen] = useState<"send" | "set" | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function doSendReset() {
    setError(null);
    setInfo(null);
    const res = await fetch(
      `/api/admin/users/${userId}/send-password-reset`,
      { method: "POST" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Failed to send reset.",
      );
      return;
    }
    setInfo("Reset email sent.");
    setOpen(null);
    startTransition(() => router.refresh());
  }

  async function doSetPassword() {
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const res = await fetch(`/api/admin/users/${userId}/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Failed to set password.",
      );
      return;
    }
    setInfo(
      "Password set. Tell the user out of band; we don't email what you typed.",
    );
    setNewPassword("");
    setOpen(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setInfo(null);
          setOpen("send");
        }}
        className="bg-white border border-indigo-300 text-indigo-700 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-indigo-50"
        title="Email this user a Supabase password-reset link"
      >
        Send password reset
      </button>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setInfo(null);
          setNewPassword("");
          setOpen("set");
        }}
        className="bg-white border border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-red-50"
        title="Override the password directly (no email round-trip)"
      >
        Force-set password
      </button>
      {info ? (
        <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5">
          {info}
        </p>
      ) : null}

      {open === "send" ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">
              Send password reset to {userEmail}?
            </h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Triggers a Supabase recovery email. The user gets a link
              that lets them choose a new password. No password ever
              passes through your hands.
            </p>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
              Requires healthy email delivery (Supabase SMTP via Resend).
              If the user reports no email, use Force-set password instead.
            </p>
            {error ? (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="text-sm text-slate-500 px-4 py-2 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doSendReset}
                disabled={pending}
                className="bg-indigo-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-60"
              >
                {pending ? "Sending..." : "Send reset email"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {open === "set" ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div className="bg-white rounded-2xl border border-red-200 max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-red-700 text-white px-1.5 py-0.5 rounded">
                Power tool
              </span>
              <h3 className="text-lg font-bold text-slate-900">
                Force-set password
              </h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              Sets <strong>{userEmail}</strong>&apos;s password to whatever
              you type. The user can sign in with it immediately and change
              it themselves later from their settings.
            </p>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
              We do NOT email the user what you typed. Tell them out of
              band (phone, text, signal, whatever).
            </p>
            <label className="block mt-4">
              <span className="text-xs font-semibold text-slate-700 block mb-1">
                New password (at least 8 characters)
              </span>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Type the new password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Shown in cleartext so you can confirm what you&apos;re about
                to commit. Use a temporary password the user will change
                on first login.
              </p>
            </label>
            {error ? (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="text-sm text-slate-500 px-4 py-2 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doSetPassword}
                disabled={pending || newPassword.length < 8}
                className="bg-red-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Setting..." : "Set this password now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
