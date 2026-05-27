"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Archive ↔ Restore toggle button for the report detail page action
// row. Posts to /api/reports/[id]/archive with the desired state.
// On archive: redirects back to /dashboard (the report is no longer
// in that view, so leaving them on the now-archived detail page
// would be confusing). On restore: stays on the page so the agent
// can immediately use it.

type Props = {
  reportId: string;
  archived: boolean;
};

export function ArchiveButton({ reportId, archived }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const intent = archived ? "restore" : "archive";
    if (!archived) {
      // Archiving, light confirmation so a stray click doesn't
      // disappear a report from the main list.
      const ok = window.confirm(
        "Archive this report? It'll disappear from your main Reports list and live in the Archive view. You can restore it later.",
      );
      if (!ok) return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      if (intent === "archive") {
        router.push("/dashboard");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          archived
            ? "inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-emerald-500 disabled:opacity-60"
            : "inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-60"
        }
      >
        <span className="text-base leading-none">{archived ? "↩" : "🗄"}</span>
        {pending
          ? archived
            ? "Restoring…"
            : "Archiving…"
          : archived
            ? "Restore from archive"
            : "Archive this report"}
      </button>
      {error && (
        <span className="text-xs text-red-700 ml-2 self-center">{error}</span>
      )}
    </>
  );
}
