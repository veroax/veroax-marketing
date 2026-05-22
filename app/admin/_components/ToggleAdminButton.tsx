"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Promotes/demotes a user's admin role. Calls /api/admin/toggle-admin
// which double-checks the caller is themselves admin before writing.
// The button is intentionally heavy (red for promote, slate for demote)
// because granting admin gives the target user access to every report
// in the system.

type Props = {
  userId: string;
  currentIsAdmin: boolean;
  userLabel: string; // for the confirm dialog ("Make Jane Doe an admin?")
};

export function ToggleAdminButton({
  userId,
  currentIsAdmin,
  userLabel,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const target = !currentIsAdmin;
    const verb = target ? "Promote" : "Demote";
    const detail = target
      ? `Make ${userLabel} an admin? They'll be able to see every account's reports, run analysis on any report, and toggle other admins.`
      : `Remove admin privileges from ${userLabel}? They'll only see their own reports going forward.`;
    if (!window.confirm(`${verb}: ${detail}`)) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/toggle-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, is_admin: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          currentIsAdmin
            ? "bg-slate-200 text-slate-800 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-slate-300 disabled:opacity-60"
            : "bg-red-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-60"
        }
      >
        {pending
          ? currentIsAdmin
            ? "Demoting…"
            : "Promoting…"
          : currentIsAdmin
            ? "Demote from admin"
            : "Promote to admin"}
      </button>
      {error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
