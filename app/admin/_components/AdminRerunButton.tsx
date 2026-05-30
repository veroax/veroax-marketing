"use client";

// AdminRerunButton, fires /api/admin/reports/[id]/rerun and waits
// for the server's 202 before refreshing the page. Confirmation
// prompt up front because re-run replaces the current report_data
// with a fresh multi-pass analysis run (which costs money + time
// and surprises the agent who owns the report).
//
// Re-run is blocked when status='analyzing' because the API would
// just bounce it (concurrency lock). The button shows that state
// inline instead of letting the admin click and get an opaque
// 202 with the "already running" note.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AdminRerunButton({
  reportId,
  currentStatus,
}: {
  reportId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inFlight = currentStatus === "analyzing";

  async function rerun() {
    if (inFlight) return;
    if (
      !confirm(
        `Re-run analysis on this report?\n\nThe current report data will be replaced with a fresh multi-pass run (verification pass, market-context, cost-reference, listing reconciliation, all fire again). The agent will NOT be emailed. The run takes 6 to 12 minutes.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    // The rerun route is SYNCHRONOUS as of commit 947ccf5: it doesn't
    // return until performAnalysis completes. That fetch can block
    // for the full 6-12 minute run, during which the button would
    // stay in "Queuing re-run..." with no signal to the admin that
    // the work has actually started.
    //
    // Fix: race the fetch against a 3-second grace timer. If the
    // route hasn't responded in 3s, the server has definitely
    // updated reports.status to 'analyzing' (the route does that
    // synchronously BEFORE calling performAnalysis) and we can
    // safely refresh the page, which will then render the
    // "Analyzing now..." state via currentStatus + the
    // AdminAnalysisProgress panel that lives below.
    //
    // The fetch continues in the background; if it eventually
    // returns (success or proxy-timeout error), we don't care
    // because the page is already showing live progress via
    // audit-log polling. Errors from the fetch are silenced here,
    // any genuine failure flips reports.status to 'failed' which
    // the refreshed page will surface inline.
    const fetchPromise = fetch(`/api/admin/reports/${reportId}/rerun`, {
      method: "POST",
    }).catch(() => null);
    try {
      // Race: whichever resolves first wins. 3s is enough for the
      // route's lock-taking + status='analyzing' update to land
      // even on a cold-started Vercel function.
      await Promise.race([
        fetchPromise,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Re-run failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={rerun}
        disabled={busy || pending || inFlight}
        className="bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {inFlight
          ? "Analyzing now..."
          : busy || pending
            ? "Queuing re-run..."
            : "Re-run analysis"}
      </button>
      {err ? <p className="text-xs text-red-700">{err}</p> : null}
    </div>
  );
}
