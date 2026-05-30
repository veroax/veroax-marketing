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
    // /analyze is synchronous (commit 947ccf5), so awaiting the full
    // fetch would keep the user staring at the failure card for the
    // entire 6-13 minute analysis. Race the fetch against a 3s timer
    // so we refresh the page as soon as /analyze has updated
    // reports.status to 'analyzing' (which happens within the first
    // ~500ms of the route handler). After the refresh the page
    // renders the in-flight AnalysisRunner with its step checklist
    // instead of the static failure card. The fetch continues in
    // the background; a real failure flips reports.status back to
    // 'failed' which the refreshed page picks up via /status polling.
    const fetchPromise = fetch(`/api/reports/${reportId}/analyze`, {
      method: "POST",
    }).catch(() => null);
    try {
      await Promise.race([
        fetchPromise,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
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
