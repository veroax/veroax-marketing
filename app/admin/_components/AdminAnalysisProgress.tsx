"use client";

// AdminAnalysisProgress, live polling block for /admin/reports/[id]
// when status='analyzing'. Mirrors the agent's AnalysisRunner UX
// (polls /api/reports/[id]/status every 4 seconds, surfaces the
// current pass + elapsed time + a "Working" pulse) but is stripped
// of agent-facing affordances: no "we'll email you when it's done"
// message (admin re-runs skip notification email by design), no
// completion chime, and no inline Retry button (admin retries via
// the same AdminRerunButton above).
//
// Renders BELOW the admin actions box without disturbing it. When
// the report transitions out of "analyzing" (to qa_pending /
// qa_approved / delivered / failed) the component triggers a
// router.refresh() and the page server-renders the new state.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type StatusEvent = {
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type StatusResponse = {
  status: string;
  failure_reason: string | null;
  events: StatusEvent[];
};

type Props = {
  reportId: string;
  // ISO timestamp the analysis was started at. Seeds the elapsed
  // timer so navigating to the page mid-run doesn't show "0:00".
  analysisStartedAt: string | null;
};

const POLL_INTERVAL_MS = 4000;

export function AdminAnalysisProgress({ reportId, analysisStartedAt }: Props) {
  const router = useRouter();
  const cancelledRef = useRef(false);
  const initialElapsed = (() => {
    if (!analysisStartedAt) return 0;
    const t = new Date(analysisStartedAt).getTime();
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 1000));
  })();
  const [elapsedSec, setElapsedSec] = useState(initialElapsed);
  const [progress, setProgress] = useState<{ label: string; detail?: string }>(
    { label: "Re-run queued, waiting for the analyzer to spin up..." },
  );
  const [transitioned, setTransitioned] = useState<null | "ok" | "failed">(
    null,
  );
  const [failureReason, setFailureReason] = useState<string | null>(null);

  // Elapsed-time tick.
  useEffect(() => {
    if (transitioned) return;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [transitioned]);

  // Status polling.
  useEffect(() => {
    cancelledRef.current = false;
    async function poll() {
      try {
        const res = await fetch(`/api/reports/${reportId}/status`, {
          cache: "no-store",
        });
        if (!res.ok || cancelledRef.current) return;
        const data = (await res.json()) as StatusResponse;
        if (cancelledRef.current) return;

        if (data.status === "failed") {
          setTransitioned("failed");
          setFailureReason(data.failure_reason);
          // Refresh after a short pause so the parent page re-renders
          // the failure panel.
          setTimeout(() => router.refresh(), 1500);
          return;
        }
        if (data.status !== "analyzing") {
          setTransitioned("ok");
          setTimeout(() => router.refresh(), 1500);
          return;
        }

        setProgress(stageFromEvents(data.events));
      } catch {
        // Swallow transient errors, next tick will retry.
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [reportId, router]);

  if (transitioned === "failed") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-red-900 mb-1">
          Re-run failed
        </h2>
        <p className="text-sm text-red-800 mb-2">
          {failureReason ?? "The analysis did not complete."}
        </p>
        <p className="text-xs text-red-700">
          Refreshing the page now; use the Re-run button above to try again.
        </p>
      </div>
    );
  }

  if (transitioned === "ok") {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-emerald-900 mb-1">
          Re-run complete
        </h2>
        <p className="text-sm text-emerald-800">
          Loading the updated report data...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-indigo-200 rounded-2xl p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
          <svg
            className="w-5 h-5 text-indigo-700 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              opacity="0.25"
            />
            <path
              d="M22 12a10 10 0 00-10-10"
              stroke="currentColor"
              strokeWidth="3"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-slate-900 mb-1">
            {progress.label}
          </h2>
          {progress.detail ? (
            <p className="text-sm text-slate-600 mb-2">{progress.detail}</p>
          ) : null}
          <p className="text-xs text-slate-400 font-mono">
            Elapsed: {formatElapsed(elapsedSec)}
            {" · "}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Working
            </span>
          </p>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            Multi-pass analysis runs the focused passes + verifier on
            every group, then market-context + listing reconciliation
            + cost-reference web searches. Typical wall clock is 6 to
            12 minutes on a full California disclosure package; the
            page auto-refreshes when it lands.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Stripped-down stage selector. We don't try to recreate the agent's
// full per-pass checklist; the admin just needs to see "something is
// happening, here's what." This picks the latest meaningful event
// and converts it to a label.
function stageFromEvents(events: StatusEvent[]): {
  label: string;
  detail?: string;
} {
  let label = "Re-run in flight, waiting for the analyzer to report progress...";
  let detail: string | undefined;
  let lastPassLabel: string | null = null;
  let lastPassCompleted = false;

  for (const e of events) {
    const md = e.metadata as Record<string, unknown>;
    switch (e.event_type) {
      case "analysis.upload_started":
        label = "Loading documents from storage";
        detail = md.total_files
          ? `${md.total_files} files to read`
          : undefined;
        break;
      case "analysis.file_uploaded":
        if (md.total_files) {
          label = "Extracting text and pages";
          const i = (md.uploaded_index as number) ?? 0;
          const t = (md.total_files as number) ?? 0;
          detail = `File ${i} of ${t}`;
        }
        break;
      case "analysis.claude_started":
        label = "Multi-pass analysis running";
        detail =
          "Focused passes + verifier across seller disclosures, inspections, HOA, hazards.";
        break;
      case "analysis.pass_started": {
        const groupLabel = String(md.group_label ?? md.group ?? "group");
        const i = Number(md.sub_index ?? 1);
        const total = Number(md.sub_total ?? 1);
        lastPassLabel =
          total > 1
            ? `${groupLabel} (batch ${i} of ${total})`
            : String(groupLabel);
        lastPassCompleted = false;
        break;
      }
      case "analysis.pass_completed":
        lastPassCompleted = true;
        break;
      case "analysis.synthesis_started":
        label = "Synthesizing the 14-section report";
        detail = undefined;
        break;
      case "analysis.synthesis_completed":
        label = "Finalizing";
        detail = undefined;
        break;
    }
  }
  if (lastPassLabel && !label.startsWith("Synthesiz") && !label.startsWith("Finaliz")) {
    label = lastPassCompleted
      ? `Finished ${lastPassLabel}`
      : `Analyzing ${lastPassLabel}`;
  }
  return { label, detail };
}
