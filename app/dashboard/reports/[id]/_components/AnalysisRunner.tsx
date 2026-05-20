"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// Auto-runs disclosure analysis when the report detail page loads with
// status "analyzing". Polls /api/reports/[id]/analyze and refreshes the
// page when the server signals completion.

type Props = {
  reportId: string;
};

export function AnalysisRunner({ reportId }: Props) {
  const router = useRouter();
  const triggered = useRef(false);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Tick the elapsed timer so the UI shows progress.
  useEffect(() => {
    if (status !== "running") return;
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    let cancelled = false;

    async function runAnalysis() {
      setStatus("running");
      try {
        const res = await fetch(`/api/reports/${reportId}/analyze`, {
          method: "POST",
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          // 409 means a concurrent request already moved the status past
          // 'analyzing' — treat as success and just refresh.
          if (res.status === 409) {
            router.refresh();
            return;
          }
          throw new Error(data.error || `Analysis failed (HTTP ${res.status}).`);
        }
        router.refresh();
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Analysis failed.");
      }
    }

    runAnalysis();
    return () => {
      cancelled = true;
    };
  }, [reportId, router]);

  if (status === "error") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm">
        <h2 className="font-bold text-red-900 mb-1">Analysis didn&apos;t complete</h2>
        <p className="text-red-800 mb-3">{error}</p>
        <button
          type="button"
          onClick={() => {
            triggered.current = false;
            setStatus("idle");
            setError(null);
            setElapsedSec(0);
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
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 mb-3">
        <svg
          className="w-6 h-6 text-indigo-700 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" />
        </svg>
      </div>
      <h2 className="text-lg font-bold text-slate-900 mb-1">Analyzing your disclosure</h2>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        Reading the documents and running the 14-section analysis. Typically
        60–90 seconds.
      </p>
      <p className="text-xs text-gray-400 mt-3 font-mono">
        Elapsed: {elapsedSec}s
      </p>
    </div>
  );
}
