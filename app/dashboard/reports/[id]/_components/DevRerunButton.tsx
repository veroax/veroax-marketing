"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ============================================================================
// DEV-ONLY — REMOVE BEFORE PRODUCTION LAUNCH
// ============================================================================
//
// Convenience button for the founder to re-run a completed analysis from
// the report detail page without resorting to SQL or the restart-then-
// retry two-step. Lives ONLY on the report detail page header, ONLY
// rendered when the viewing user has profiles.is_admin = true. Even with
// that gate, this is a dev-cycle convenience that does not belong on a
// production product surface — agents shouldn't be able to "rerun" a
// completed analysis on a whim because re-runs are billable events.
//
// REMOVAL CHECKLIST when going live:
//   1. Delete this file: app/dashboard/reports/[id]/_components/DevRerunButton.tsx
//   2. Remove the import + the conditional render in
//      app/dashboard/reports/[id]/page.tsx (search "DevRerunButton")
//   3. Delete the supporting admin endpoint:
//      app/api/admin/force-rerun/[id]/route.ts
//   4. Remove the corresponding open box from the roadmap PDF
//      (lib/pdf-render/RoadmapPDF.tsx — section: Pre-launch cleanup)
//
// Behavior: confirms with the user, calls /api/admin/force-rerun
// (admin-override reset that bypasses /restart's qa_pending guardrail),
// then immediately calls /analyze (kicks off a fresh run via the
// existing AnalysisRunner pipeline), then refreshes the page so the
// runner mounts. The force-rerun endpoint is admin-only so this
// chain only works for the same accounts that can see the button.

type Props = {
  reportId: string;
};

export function DevRerunButton({ reportId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const ok = window.confirm(
      "DEV: rerun this analysis from scratch? This resets the status, " +
        "discards the current findings, and kicks off a fresh multi-pass " +
        "run. Use only when iterating on the analyzer.",
    );
    if (!ok) return;
    setPending(true);
    setError(null);
    try {
      // Step 1: admin-force reset to a clean "failed" state. Unlike
      // /restart, force-rerun has no status guardrail — it accepts
      // qa_pending / delivered / etc. and discards them on purpose.
      // The endpoint requires admin on the server side so the UI gate
      // and the server gate match.
      const resetRes = await fetch(`/api/admin/force-rerun/${reportId}`, {
        method: "POST",
      });
      if (!resetRes.ok) {
        const data = await resetRes.json().catch(() => ({}));
        throw new Error(
          data?.error ?? `Force-rerun failed (HTTP ${resetRes.status}).`,
        );
      }

      // Step 2: kick off a fresh analyze. The analyze route accepts
      // status="failed" and starts a new background run via after().
      const analyzeRes = await fetch(`/api/reports/${reportId}/analyze`, {
        method: "POST",
      });
      if (!analyzeRes.ok && analyzeRes.status !== 202) {
        const data = await analyzeRes.json().catch(() => ({}));
        throw new Error(data?.error ?? `Analyze failed (HTTP ${analyzeRes.status}).`);
      }

      // Step 3: refresh the page so the AnalysisRunner mounts and starts
      // polling /status.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rerun failed.");
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[9px] font-bold uppercase tracking-widest bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded"
        title="Dev-only button — visible because your account has is_admin=true"
      >
        DEV
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="bg-amber-500 hover:bg-amber-400 text-white font-semibold text-xs px-3 py-1.5 rounded-lg shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        title="Reset + re-run this analysis from scratch (admin only)"
      >
        {pending ? "Rerunning…" : "↻ Rerun analysis"}
      </button>
      {error ? (
        <span className="text-xs text-red-700">{error}</span>
      ) : null}
    </div>
  );
}
