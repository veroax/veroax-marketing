"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// Triggers /api/reports/[id]/analyze on mount, then polls /status every
// 4 seconds to surface real progress: how many files have uploaded to
// Anthropic, whether Claude is running, and any failure reason. When
// status changes to qa_pending (or anything other than analyzing), the
// page refreshes so the server-rendered report appears.

type StatusEvent = {
  event_type: string;
  metadata: {
    total_files?: number;
    uploaded_index?: number;
    uploaded_count?: number;
    filename?: string;
    input_tokens?: number;
    output_tokens?: number;
    [k: string]: unknown;
  };
  created_at: string;
};

type StatusResponse = {
  status: string;
  failure_reason: string | null;
  events: StatusEvent[];
};

type Props = {
  reportId: string;
};

const POLL_INTERVAL_MS = 4000;

export function AnalysisRunner({ reportId }: Props) {
  const router = useRouter();
  const triggered = useRef(false);
  const [phase, setPhase] = useState<"running" | "error">("running");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [progress, setProgress] = useState<{
    label: string;
    detail?: string;
  }>({ label: "Starting analysis…" });

  // Tick the elapsed timer.
  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Kick off the analysis exactly once on mount.
  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    let cancelled = false;

    async function runAnalysis() {
      try {
        const res = await fetch(`/api/reports/${reportId}/analyze`, {
          method: "POST",
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409) {
            router.refresh();
            return;
          }
          throw new Error(data.error || `Analysis failed (HTTP ${res.status}).`);
        }
        router.refresh();
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setError(err instanceof Error ? err.message : "Analysis failed.");
      }
    }

    runAnalysis();
    return () => {
      cancelled = true;
    };
  }, [reportId, router]);

  // Poll /status for stage updates while running.
  useEffect(() => {
    if (phase !== "running") return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/reports/${reportId}/status`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;

        // If the report moved past "analyzing" externally, refresh to
        // render the result.
        if (data.status !== "analyzing") {
          router.refresh();
          return;
        }

        setProgress(stageFromEvents(data.events));
      } catch {
        // Swallow polling errors — they're transient.
      }
    }

    poll(); // immediate
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reportId, phase, router]);

  if (phase === "error") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm">
        <h2 className="font-bold text-red-900 mb-1">Analysis didn&apos;t complete</h2>
        <p className="text-red-800 mb-3">{error}</p>
        <button
          type="button"
          onClick={() => {
            triggered.current = false;
            setPhase("running");
            setError(null);
            setElapsedSec(0);
            setProgress({ label: "Restarting…" });
            router.refresh();
          }}
          className="text-xs font-semibold text-red-900 underline underline-offset-2"
        >
          Retry analysis
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8">
      <div className="flex items-start gap-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 shrink-0">
          <svg
            className="w-6 h-6 text-indigo-700 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            {progress.label}
          </h2>
          {progress.detail && (
            <p className="text-sm text-gray-600 mb-2">{progress.detail}</p>
          )}
          <p className="text-xs text-gray-400 font-mono">
            Elapsed: {formatElapsed(elapsedSec)}
            {" · "}
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Working
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function stageFromEvents(events: StatusEvent[]): { label: string; detail?: string } {
  // Walk events newest-last; we sorted ascending in the API.
  let total = 0;
  let uploaded = 0;
  let claudeStarted = false;
  let claudeCompleted = false;

  for (const e of events) {
    switch (e.event_type) {
      case "analysis.upload_started":
        total = (e.metadata.total_files as number) || total;
        break;
      case "analysis.file_uploaded":
        uploaded = (e.metadata.uploaded_index as number) || uploaded + 1;
        total = (e.metadata.total_files as number) || total;
        break;
      case "analysis.claude_started":
        claudeStarted = true;
        break;
      case "analysis.claude_completed":
        claudeCompleted = true;
        break;
    }
  }

  if (claudeCompleted) {
    return {
      label: "Saving your report",
      detail: "Final formatting and storage.",
    };
  }
  if (claudeStarted) {
    return {
      label: "Running the 14-section analysis",
      detail: `Claude is reading ${uploaded || total || "your"} documents. This is the longest step — typically 60–90 seconds.`,
    };
  }
  if (total > 0 && uploaded > 0) {
    return {
      label: `Uploading documents to Claude`,
      detail: `${uploaded} of ${total} uploaded. We send each PDF to Anthropic's Files API.`,
    };
  }
  if (total > 0) {
    return {
      label: `Preparing to upload ${total} documents`,
    };
  }
  return { label: "Starting analysis…" };
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
