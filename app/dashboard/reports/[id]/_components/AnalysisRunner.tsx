"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// Triggers /api/reports/[id]/analyze on mount, then polls /status every
// 4 seconds to surface real progress through the multi-pass pipeline:
// extraction → focused passes (parallel) → synthesis → save. When the
// report's status leaves "analyzing", we play a completion chime,
// show a brief "Complete!" overlay, then refresh the page so the
// rendered 14-section report appears.

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
  // ISO timestamp of when this analysis started, from the DB. Lets the
  // elapsed-time display + stuck detection survive page navigations —
  // without it, every visit resets the timer to 0 and a 30-minute-stuck
  // run looks like it just started.
  analysisStartedAt?: string | null;
};

const POLL_INTERVAL_MS = 4000;
const COMPLETION_DISPLAY_MS = 2000; // dwell time on "Complete!" before page refresh

// Stuck detection: if elapsed exceeds this AND no new audit_log events
// have arrived in the secondary window, surface a recovery UI instead
// of letting the user stare at a dead spinner indefinitely. Tuned for
// the realistic multi-pass upper bound (analyze route is maxDuration=800s
// = 13.3 min) plus a margin for polling/network jitter.
const STUCK_ELAPSED_THRESHOLD_SEC = 15 * 60; // 15 minutes total elapsed
const STUCK_NO_EVENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes since last event

export function AnalysisRunner({ reportId, analysisStartedAt }: Props) {
  const router = useRouter();
  const triggered = useRef(false);
  const [phase, setPhase] = useState<"running" | "completing" | "error">("running");
  const [error, setError] = useState<string | null>(null);
  // Seed elapsed from the server-side analysis_started_at so navigating
  // back to this page mid-run resumes the real elapsed time instead of
  // restarting at 0. Falls back to 0 when the field is null (the route
  // hasn't actually been kicked off yet — runAnalysis below will start it).
  const initialElapsedSec = (() => {
    if (!analysisStartedAt) return 0;
    const startedMs = new Date(analysisStartedAt).getTime();
    if (!Number.isFinite(startedMs)) return 0;
    return Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  })();
  const [elapsedSec, setElapsedSec] = useState(initialElapsedSec);
  const [progress, setProgress] = useState<{
    label: string;
    detail?: string;
  }>({ label: "Starting analysis…" });
  // lastEventAt also seeds from analysis_started_at so the stuck-detection
  // window measures "no events since the run actually began" instead of
  // "no events since this page rendered."
  const [lastEventAt, setLastEventAt] = useState<number>(() => {
    if (!analysisStartedAt) return Date.now();
    const t = new Date(analysisStartedAt).getTime();
    return Number.isFinite(t) ? t : Date.now();
  });
  const [restarting, setRestarting] = useState(false);

  // Tick the elapsed timer while still running.
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

        // 202 = the server detected an in-flight analysis and didn't
        // start a duplicate. Fall through to polling; the original run
        // will complete and our /status poll will pick it up.
        if (res.status === 202) {
          return;
        }
        // 409 = report status already past "analyzing" — treat as done.
        if (res.status === 409) {
          handleCompletion();
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Analysis failed (HTTP ${res.status}).`);
        }
        handleCompletion();
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setError(err instanceof Error ? err.message : "Analysis failed.");
      }
    }

    function handleCompletion() {
      playCompletionChime();
      setPhase("completing");
      setTimeout(() => {
        router.refresh();
      }, COMPLETION_DISPLAY_MS);
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

        // If the report moved past "analyzing" externally, fall through
        // to the completion handler.
        if (data.status !== "analyzing") {
          playCompletionChime();
          setPhase("completing");
          setTimeout(() => router.refresh(), COMPLETION_DISPLAY_MS);
          return;
        }

        // Track the timestamp of the latest event for stuck detection.
        // If no events have arrived in the past N minutes, we'll show
        // a recovery UI rather than spin forever.
        if (data.events.length > 0) {
          const newest = data.events[data.events.length - 1];
          const t = new Date(newest.created_at).getTime();
          if (Number.isFinite(t)) {
            setLastEventAt((prev) => (t > prev ? t : prev));
          }
        }

        setProgress(stageFromEvents(data.events));
      } catch {
        // Swallow polling errors — they're transient.
      }
    }

    poll();
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

  // Stuck-state UI: if we've waited long enough AND haven't seen any new
  // server-side progress in a while, the Vercel function likely died and
  // the user should restart. Don't return this from a useEffect — render
  // it inline so we always evaluate freshly.
  const isStuck =
    phase === "running" &&
    elapsedSec >= STUCK_ELAPSED_THRESHOLD_SEC &&
    Date.now() - lastEventAt >= STUCK_NO_EVENT_THRESHOLD_MS;

  if (isStuck) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-amber-900 mb-1">
            This is taking longer than expected
          </h2>
          <p className="text-sm text-amber-800 leading-relaxed">
            The analysis has been running for {formatElapsed(elapsedSec)} with
            no new server progress in the past few minutes. The most likely
            cause is that the previous Vercel function died (timeout or deploy)
            without recording a failure. Restart to start a fresh multi-pass
            analysis — the documents are still in storage, no re-upload needed.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            setRestarting(true);
            try {
              await fetch(`/api/reports/${reportId}/restart`, {
                method: "POST",
              });
              router.refresh();
            } catch {
              setRestarting(false);
            }
          }}
          disabled={restarting}
          className="bg-amber-900 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-60"
        >
          {restarting ? "Restarting…" : "Restart analysis"}
        </button>
      </div>
    );
  }

  if (phase === "completing") {
    return (
      <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-8 text-center transition-all">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500 shadow-lg mb-3">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-emerald-900">Analysis complete</h2>
        <p className="text-sm text-emerald-700 mt-1">
          Loading your report…
        </p>
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
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              opacity="0.25"
            />
            <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 mb-1">{progress.label}</h2>
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
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            Multi-pass analysis takes about <strong>3–6 minutes</strong> for a typical
            CA disclosure package. We extract text from every document, then run
            focused Claude calls in parallel (seller disclosures, inspections,
            HOA, hazards) before synthesizing the final 14-section report.
          </p>
        </div>
      </div>
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-3 text-xs text-slate-600 bg-slate-50/60 -mx-2 px-4 py-3 rounded-lg">
        <svg
          className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <p className="leading-relaxed">
          <strong className="text-slate-900">You can close this tab.</strong>{" "}
          The analysis keeps running on our servers. We&apos;ll email you the
          moment it&apos;s ready with a link straight to the report.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

type PassStatus = {
  group: string;
  group_label: string;
  sub_index: number;
  sub_total: number;
  completed: boolean;
};

function stageFromEvents(events: StatusEvent[]): { label: string; detail?: string } {
  let total = 0;
  let extracted = 0;
  let claudeStarted = false;
  let claudeCompleted = false;
  let synthesisStarted = false;
  let synthesisCompleted = false;
  const passesByKey = new Map<string, PassStatus>();

  for (const e of events) {
    const md = e.metadata as Record<string, unknown>;
    switch (e.event_type) {
      case "analysis.upload_started":
        total = (md.total_files as number) || total;
        break;
      case "analysis.file_uploaded":
        extracted = (md.uploaded_index as number) || extracted + 1;
        total = (md.total_files as number) || total;
        break;
      case "analysis.claude_started":
        claudeStarted = true;
        break;
      case "analysis.pass_started": {
        const key = `${md.group}-${md.sub_index}`;
        passesByKey.set(key, {
          group: String(md.group ?? ""),
          group_label: String(md.group_label ?? md.group ?? ""),
          sub_index: Number(md.sub_index ?? 1),
          sub_total: Number(md.sub_total ?? 1),
          completed: false,
        });
        break;
      }
      case "analysis.pass_completed": {
        const key = `${md.group}-${md.sub_index}`;
        const existing = passesByKey.get(key);
        if (existing) existing.completed = true;
        break;
      }
      case "analysis.synthesis_started":
        synthesisStarted = true;
        break;
      case "analysis.synthesis_completed":
        synthesisCompleted = true;
        break;
      case "analysis.claude_completed":
        claudeCompleted = true;
        break;
    }
  }

  if (claudeCompleted) {
    return {
      label: "Saving your report",
      detail: "Final formatting and storage. Almost there.",
    };
  }
  if (synthesisCompleted) {
    return { label: "Wrapping up", detail: "Combining findings and saving." };
  }
  if (synthesisStarted) {
    return {
      label: "Synthesizing the final 14-section report",
      detail:
        "Combining findings from each document group into the unified report. About 30–60 seconds remaining.",
    };
  }

  if (passesByKey.size > 0) {
    const passes = Array.from(passesByKey.values());
    const totalPasses = passes.length;
    const completedPasses = passes.filter((p) => p.completed).length;
    const inFlight = passes.filter((p) => !p.completed);
    const inFlightLabels = inFlight
      .map((p) =>
        p.sub_total > 1
          ? `${p.group_label} (part ${p.sub_index} of ${p.sub_total})`
          : p.group_label,
      )
      .join(", ");
    return {
      label: `Analyzing your disclosure (${completedPasses} of ${totalPasses} passes complete)`,
      detail:
        inFlight.length > 0
          ? `Currently running: ${inFlightLabels}. Each pass takes 60–120 seconds.`
          : "All focused passes done; preparing synthesis.",
    };
  }

  if (claudeStarted) {
    return {
      label: "Preparing focused analysis passes",
      detail: "Grouping documents by type and dispatching parallel analysis calls.",
    };
  }

  if (total > 0 && extracted > 0) {
    return {
      label: "Extracting text from documents",
      detail: `${extracted} of ${total} extracted. Pulling text content from each PDF.`,
    };
  }
  if (total > 0) {
    return { label: `Preparing to extract ${total} documents` };
  }
  return { label: "Starting analysis…" };
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// Two-tone ascending chime (major triad arpeggio) using Web Audio.
// No external file needed. Wrapped in try/catch so a blocked AudioContext
// (some browsers/extensions) doesn't break the page.
function playCompletionChime(): void {
  try {
    const Ctx =
      typeof window === "undefined"
        ? null
        : (window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // C5, E5, G5 — pleasant rising arpeggio
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const startTime = now + i * 0.12;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.6);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // Audio not supported or blocked.
  }
}
