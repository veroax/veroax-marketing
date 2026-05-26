"use client";

// Admin button that fires POST /api/admin/users/[userId]/dre-recheck.
// Triggers a fresh CA DRE lookup bypassing the 24h cache, then
// refreshes the page so the DRE card re-reads the new status.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  licenseId: string;
};

export function DreRecheckButton({ userId, licenseId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doRecheck() {
    setError(null);
    setInfo(null);
    if (
      !confirm(
        `Re-verify DRE license ${licenseId} with the California DRE? This bypasses the 24-hour cache.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${userId}/dre-recheck`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Recheck failed.",
        );
        return;
      }
      setInfo(`Result: ${data.status ?? "unknown"}`);
      startTransition(() => router.refresh());
      setTimeout(() => setInfo(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recheck failed.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={doRecheck}
        disabled={pending}
        className="bg-white border border-indigo-300 text-indigo-700 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Checking..." : "Recheck with DRE"}
      </button>
      {info ? (
        <span className="text-[11px] text-emerald-700">{info}</span>
      ) : null}
      {error ? (
        <span className="text-[11px] text-red-700">{error}</span>
      ) : null}
    </div>
  );
}
