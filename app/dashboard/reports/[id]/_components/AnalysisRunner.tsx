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
  // elapsed-time display + stuck detection survive page navigations ,
  // without it, every visit resets the timer to 0 and a 30-minute-stuck
  // run looks like it just started.
  analysisStartedAt?: string | null;
  // Property address from the report row, rendered prominently at the
  // top of the in-flight panel so the agent can confirm which property
  // they're watching when they have multiple analyses in-flight or
  // when they navigate back from another tab.
  propertyAddress?: string | null;
  // True when this is a re-run (analysis_run_count > 1), false for
  // first-time analyses. Drives the header eyebrow text and gives
  // the agent visible feedback that the click-Retry flow actually
  // restarted the analyzer instead of just sitting on the failure
  // card.
  isRerun?: boolean;
};

// The fixed step order the analyzer runs in. Used to render a
// Cowork-style progress checklist showing where we are vs what's
// left. Each entry maps to one or more audit_log event types that
// signal completion of that step.
type StepKey =
  | "upload"
  | "ocr"
  | "cost_reference"
  | "focused_passes"
  | "post_focused_fetch"
  | "synthesis";
const STEP_ORDER: { key: StepKey; label: string }[] = [
  { key: "upload", label: "Uploading and indexing documents" },
  { key: "ocr", label: "OCR transcription of scanned PDFs" },
  { key: "cost_reference", label: "Building regional cost reference" },
  { key: "focused_passes", label: "Reviewing disclosures, inspections, HOA, hazards" },
  { key: "post_focused_fetch", label: "Live market context and listing reconciliation" },
  { key: "synthesis", label: "Finalizing report" },
];

const POLL_INTERVAL_MS = 4000;
const COMPLETION_DISPLAY_MS = 2000; // dwell time on "Complete!" before page refresh

// Stuck detection: if elapsed exceeds this AND no new audit_log events
// have arrived in the secondary window, surface a recovery UI instead
// of letting the user stare at a dead spinner indefinitely. Tuned for
// the realistic multi-pass upper bound (analyze route is maxDuration=800s
// = 13.3 min) plus a margin for polling/network jitter.
const STUCK_ELAPSED_THRESHOLD_SEC = 15 * 60; // 15 minutes total elapsed
const STUCK_NO_EVENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes since last event

export function AnalysisRunner({
  reportId,
  analysisStartedAt,
  propertyAddress,
  isRerun,
}: Props) {
  const router = useRouter();
  const triggered = useRef(false);
  const [phase, setPhase] = useState<"running" | "completing" | "error">("running");
  const [error, setError] = useState<string | null>(null);
  // Seed elapsed from the server-side analysis_started_at so navigating
  // back to this page mid-run resumes the real elapsed time instead of
  // restarting at 0. Falls back to 0 when the field is null (the route
  // hasn't actually been kicked off yet, runAnalysis below will start it).
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
  const [stepStates, setStepStates] = useState<StepStates | null>(null);
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
        // will complete and our /status poll will pick it up. (Legacy
        // path from the previous after() flow; the synchronous analyzer
        // doesn't return 202 anymore but we keep the branch for any
        // older deployment that might still be running.)
        if (res.status === 202) {
          return;
        }
        // 409 = report status already past "analyzing", treat as done.
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
        // Distinguish proxy / network timeouts from real server-side
        // failures. The analyzer route is now SYNCHRONOUS (it awaits
        // performAnalysis instead of scheduling it via after()) so
        // the fetch holds the connection open for the full run. If
        // Cloudflare / Vercel's edge proxy drops the request before
        // the analyzer finishes (proxy timeout, browser tab
        // backgrounded too long, network blip), the fetch will
        // reject with a TypeError or AbortError EVEN THOUGH the
        // server function is still running. We must NOT show "error"
        // in that case, the /status polling loop in the other
        // effect will continue observing audit events and detect
        // real completion from the database state. Only explicit
        // server-returned errors (HTTP 4xx / 5xx with JSON body
        // thrown above) should flip phase to "error".
        const isNetworkLike =
          err instanceof TypeError ||
          (err instanceof Error && err.name === "AbortError");
        if (isNetworkLike) {
          // Stay in "running" phase. /status polling will detect
          // the eventual completion or failure from the audit log.
          return;
        }
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

        // Failure path: status flipped to "failed" while we were
        // polling. DO NOT play the chime, DO NOT show the green
        // completion panel, that's the false-success-flash bug.
        // Surface the failure reason inline and let the agent
        // retry from here.
        if (data.status === "failed") {
          setPhase("error");
          setError(
            data.failure_reason ||
              "Analysis did not complete. Retry to start a fresh run.",
          );
          return;
        }
        // Genuine success path: status moved to qa_pending /
        // qa_approved / delivered. Now we can celebrate.
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
        setStepStates(stepStatesFromEvents(data.events));
      } catch {
        // Swallow polling errors, they're transient.
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
  // the user should restart. Don't return this from a useEffect, render
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
            analysis, the documents are still in storage, no re-upload needed.
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
      {/* Property address header. Lets the agent confirm which
          property they're watching when they have multiple analyses
          in flight or come back from another tab. Eyebrow flips to
          "Re-running analysis" when isRerun=true so the agent gets
          visual confirmation that a retry actually restarted the
          worker (instead of just sitting on the failure card the
          way it did before commit f9faf62 + this commit). */}
      {propertyAddress?.trim() ? (
        <div className="mb-5 pb-4 border-b border-slate-100">
          <p className="text-[10px] font-bold tracking-widest uppercase text-amber-700">
            {isRerun ? "Re-running analysis" : "Analyzing"}
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-indigo-950 mt-1 leading-tight">
            {propertyAddress}
          </h1>
        </div>
      ) : null}

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

          {/* Step-by-step progress checklist. Each step shows as a
              filled green check when done, an indigo spinning ring
              when active, a slate empty circle when pending, or
              slate-light when skipped (e.g., OCR skipped when no
              scanned PDFs in the package). Lets the agent see at a
              glance where in the pipeline we are vs what's left,
              mirroring the Cowork skill's progress UX. */}
          {stepStates ? (
            <ol className="mt-4 space-y-1.5">
              {STEP_ORDER.map(({ key, label }) => {
                const state = stepStates[key];
                const passesLabel =
                  key === "focused_passes" && stepStates.passes_total > 0
                    ? ` (${stepStates.passes_completed}/${stepStates.passes_total})`
                    : "";
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <StepIcon state={state} />
                    <span
                      className={
                        state === "done"
                          ? "text-emerald-700 font-medium"
                          : state === "active"
                            ? "text-indigo-900 font-semibold"
                            : state === "skipped"
                              ? "text-slate-400 italic"
                              : "text-slate-500"
                      }
                    >
                      {label}
                      {passesLabel}
                      {state === "skipped" ? " (skipped)" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            Multi-pass analysis can take up to <strong>15 minutes</strong> on
            a large California disclosure package. We extract text from every
            document, then run focused Claude calls in parallel (seller
            disclosures, inspections, HOA, hazards) before synthesizing the
            final 14-section report. Larger packages with historical
            disclosures sit toward the longer end of that window.
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

// Per-step state derived from the same audit_log event stream that
// drives stageFromEvents. Renders the Cowork-style progress checklist
// so the agent sees not just "what's happening now" but "what's done,
// what's left." Each step is "done" / "active" / "pending" / "skipped"
// based on which audit events have landed.
type StepState = "done" | "active" | "pending" | "skipped";
type StepStates = Record<StepKey, StepState> & {
  // Extra detail for the focused-passes step: how many sub-batches
  // completed vs. total. Renders inline next to the step label.
  passes_completed: number;
  passes_total: number;
};

function stepStatesFromEvents(events: StatusEvent[]): StepStates {
  const states: StepStates = {
    upload: "pending",
    ocr: "pending",
    cost_reference: "pending",
    focused_passes: "pending",
    post_focused_fetch: "pending",
    synthesis: "pending",
    passes_completed: 0,
    passes_total: 0,
  };
  let uploadStarted = false;
  let uploadFileCount = 0;
  let claudeStarted = false;
  const passSubBatches = new Map<string, boolean>();
  let ocrStarted = false;
  let ocrCandidateCount: number | null = null;
  let ocrCompleted = 0;
  let costRefStarted = false;
  let costRefDone = false;
  let postFetchStarted = false;
  let postFetchDone = false;
  let synthStarted = false;
  let synthDone = false;
  let claudeCompleted = false;

  for (const e of events) {
    const md = e.metadata as Record<string, unknown>;
    switch (e.event_type) {
      case "analysis.upload_started":
        uploadStarted = true;
        uploadFileCount = (md.total_files as number) || uploadFileCount;
        break;
      case "analysis.file_uploaded":
        // Each file_uploaded narrows our progress within the upload
        // step; the step flips to done once OCR or claude_started
        // fires (any later step starting implies upload is complete).
        break;
      case "analysis.ocr_prepass_started":
        ocrStarted = true;
        ocrCandidateCount =
          typeof md.candidate_count === "number"
            ? (md.candidate_count as number)
            : null;
        break;
      case "analysis.ocr_prepass_completed":
        ocrCompleted += 1;
        break;
      case "analysis.cost_reference_started":
        costRefStarted = true;
        break;
      case "analysis.cost_reference_completed":
        costRefDone = true;
        break;
      case "analysis.claude_started":
        claudeStarted = true;
        break;
      case "analysis.pass_started": {
        const key = `${md.group}-${md.sub_index}`;
        if (!passSubBatches.has(key)) passSubBatches.set(key, false);
        break;
      }
      case "analysis.pass_completed": {
        const key = `${md.group}-${md.sub_index}`;
        passSubBatches.set(key, true);
        break;
      }
      case "analysis.post_focused_fetch_started":
        postFetchStarted = true;
        break;
      case "analysis.post_focused_fetch_completed":
        postFetchDone = true;
        break;
      case "analysis.synthesis_started":
        synthStarted = true;
        break;
      case "analysis.synthesis_completed":
        synthDone = true;
        break;
      case "analysis.claude_completed":
        claudeCompleted = true;
        break;
    }
  }

  // upload: done as soon as any later step has started OR claude_started fires
  if (uploadStarted) {
    states.upload =
      ocrStarted || costRefStarted || claudeStarted ? "done" : "active";
  }

  // ocr: skipped if no candidates; done when all candidates have
  // completed; active otherwise. Note: claude_started fires after
  // ocr completes (or skips), so claudeStarted implies ocr is done.
  if (claudeStarted) {
    if (ocrCandidateCount === 0) {
      states.ocr = "skipped";
    } else {
      states.ocr = "done";
    }
  } else if (ocrStarted) {
    if (ocrCandidateCount === 0) {
      states.ocr = "skipped";
    } else if (
      ocrCandidateCount != null &&
      ocrCompleted >= ocrCandidateCount
    ) {
      states.ocr = "done";
    } else {
      states.ocr = "active";
    }
  }

  // cost_reference
  if (costRefDone) states.cost_reference = "done";
  else if (costRefStarted) states.cost_reference = "active";

  // focused_passes
  const totalPasses = passSubBatches.size;
  const donePasses = Array.from(passSubBatches.values()).filter(Boolean).length;
  states.passes_total = totalPasses;
  states.passes_completed = donePasses;
  if (postFetchStarted || synthStarted || synthDone) {
    states.focused_passes = "done";
  } else if (totalPasses > 0) {
    states.focused_passes = donePasses >= totalPasses && totalPasses > 0
      ? "done"
      : "active";
  }

  // post_focused_fetch
  if (postFetchDone || synthStarted || synthDone) states.post_focused_fetch = "done";
  else if (postFetchStarted) states.post_focused_fetch = "active";

  // synthesis
  if (synthDone || claudeCompleted) states.synthesis = "done";
  else if (synthStarted) states.synthesis = "active";

  return states;
}

function stageFromEvents(events: StatusEvent[]): { label: string; detail?: string } {
  let total = 0;
  let extracted = 0;
  let claudeStarted = false;
  let claudeCompleted = false;
  let synthesisStarted = false;
  let synthesisCompleted = false;
  const passesByKey = new Map<string, PassStatus>();
  // Long-running web-search phases that sit BEFORE focused passes
  // (cost reference) or AFTER focused passes (market context +
  // listing reconciliation). Without these flags the polling block
  // sat on "All focused passes done; preparing synthesis" for the
  // entire 2-to-4-minute post-focused window.
  let costRefInFlight = false;
  let postFocusedInFlight = false;
  let verifierCount = 0;

  for (const e of events) {
    const md = e.metadata as Record<string, unknown>;
    switch (e.event_type) {
      case "analysis.cost_reference_started":
        costRefInFlight = true;
        break;
      case "analysis.cost_reference_completed":
        costRefInFlight = false;
        break;
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
      case "analysis.verifier_completed":
        verifierCount += 1;
        break;
      case "analysis.post_focused_fetch_started":
        postFocusedInFlight = true;
        break;
      case "analysis.post_focused_fetch_completed":
        postFocusedInFlight = false;
        break;
      case "analysis.synthesis_started":
        synthesisStarted = true;
        postFocusedInFlight = false;
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
        "Combining findings from each document group into the unified report. About 30 to 60 seconds remaining.",
    };
  }

  if (postFocusedInFlight) {
    return {
      label: "Researching market context and listing history",
      detail:
        "Two parallel web searches: comps and mortgage rates for your unit's segment, and the listing's relist history across MLS, Zillow, and the package MLS print-out. Typically 2 to 4 minutes.",
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
    const verifierLine =
      verifierCount > 0
        ? ` ${verifierCount} verifier pass${verifierCount === 1 ? "" : "es"} done.`
        : "";
    return {
      label: `Analyzing your disclosure (${completedPasses} of ${totalPasses} passes complete)`,
      detail:
        inFlight.length > 0
          ? `Currently running: ${inFlightLabels}. Each pass takes 60 to 120 seconds.${verifierLine}`
          : `All focused passes done; preparing synthesis.${verifierLine}`,
    };
  }

  if (claudeStarted) {
    return {
      label: "Preparing focused analysis passes",
      detail: "Grouping documents by type and dispatching parallel analysis calls.",
    };
  }

  if (costRefInFlight) {
    return {
      label: "Building regional cost reference",
      detail:
        "Web-searching current 2026 California regional pricing baselines for the property's market. Typically 30 to 90 seconds.",
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
  return { label: "Starting analysis..." };
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span
        aria-label="completed step"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white shrink-0"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        aria-label="step in progress"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 border border-indigo-300 shrink-0"
      >
        <svg
          className="w-3 h-3 text-indigo-700 animate-spin"
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
      </span>
    );
  }
  if (state === "skipped") {
    return (
      <span
        aria-label="step skipped"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-300 shrink-0 text-xs"
      >
        &ndash;
      </span>
    );
  }
  // pending
  return (
    <span
      aria-label="step pending"
      className="inline-block w-5 h-5 rounded-full border-2 border-slate-300 shrink-0"
    />
  );
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
    // C5, E5, G5, pleasant rising arpeggio
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
