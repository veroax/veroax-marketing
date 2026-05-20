"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Retry button for a failed report. Re-POSTs to /api/reports/[id]/analyze
// (which accepts status="failed" as a valid starting point) and refreshes
// the page when the server has updated the status.

export function RetryButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/analyze`, {
        method: "POST",
      });
      if (!res.ok && res.status !== 409) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Retry failed (HTTP ${res.status}).`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Retry failed.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="bg-red-900 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-red-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? "Retrying…" : "Retry analysis"}
      </button>
      {err && <p className="text-xs text-red-700">{err}</p>}
    </div>
  );
}
