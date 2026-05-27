"use client";

// Site-admin Archive + Restore buttons for /admin/users/[id]. Sits
// next to AdminPasswordActions in the user-detail action column.
// State-driven: shows Archive when active, Restore when archived.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  userEmail: string;
  isArchived: boolean;
  archivedScope: "brokerage" | "site" | null;
};

export function AdminArchiveActions({
  userId,
  userEmail,
  isArchived,
  archivedScope,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function doArchive() {
    setError(null);
    setInfo(null);
    const reason = prompt(
      `Archive ${userEmail}? Optional: paste a reason for the audit log. Leave empty + click OK to archive without a reason.`,
      "",
    );
    if (reason === null) return; // user hit Cancel
    const res = await fetch(`/api/admin/users/${userId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Archive failed.",
      );
      return;
    }
    setInfo(
      `Archived. ${data.share_codes_revoked ?? 0} share link${
        data.share_codes_revoked === 1 ? "" : "s"
      } revoked.`,
    );
    startTransition(() => router.refresh());
  }

  async function doRestore() {
    setError(null);
    setInfo(null);
    if (!confirm(`Restore ${userEmail}? They will regain login access.`)) {
      return;
    }
    const res = await fetch(`/api/admin/users/${userId}/restore`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Restore failed.",
      );
      return;
    }
    setInfo("Restored.");
    startTransition(() => router.refresh());
  }

  if (isArchived) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={doRestore}
          disabled={pending}
          className="bg-emerald-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-emerald-600 disabled:opacity-60"
          title="Restore login access for this user"
        >
          Restore from archive
        </button>
        <p className="text-[10px] text-slate-500">
          Archived scope:{" "}
          <span className="font-semibold capitalize">
            {archivedScope ?? "unknown"}
          </span>
        </p>
        {info ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            {info}
          </p>
        ) : null}
        {error ? (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={doArchive}
        disabled={pending}
        className="bg-white border border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-red-50 disabled:opacity-60"
        title="Archive this user. Login blocked. Reports + history preserved. Restorable."
      >
        Archive user
      </button>
      {info ? (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      ) : null}
    </div>
  );
}
