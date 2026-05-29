"use client";

import { useState } from "react";
import type { Finding } from "@/lib/anthropic/schema";
import { slugifyFindingTitle } from "@/lib/reports/summary";
import { FindingFlagButton } from "./FindingFlagButton";

// Critical-findings list on the dashboard report detail page, with
// click-to-source. Each finding's "Source: X" line is a button that
// opens a side panel showing the source PDF at the cited page.
//
// The buyer's public /r/{code} view doesn't get this, the source
// PDFs are private. The agent gets it on the auth-protected
// dashboard so they can audit any finding back to its source in one
// click without downloading and grepping through long PDFs.

type Props = {
  reportId: string;
  findings: Finding[];
};

// Same Props shape gets threaded down to FindingDetail so the flag
// button can POST to /api/reports/<id>/findings/flag with the
// finding's title and severity captured at flag time.

type SourcePanelState =
  | { phase: "closed" }
  | {
      phase: "loading";
      filename: string;
      page: number | null;
    }
  | {
      phase: "open";
      filename: string;
      page: number | null;
      url: string;
    }
  | { phase: "error"; message: string };

// Parse a source citation like "CalPro Home Inspection, page 10" or
// "AVID p. 4" or "TDS Section C, page 3" into a (filename-ish, page).
// We don't know the actual storage filename, that's up to the
// signed-URL endpoint to resolve. We DO try to extract the page
// number for the PDF viewer.
function parseSourceCitation(source: string): {
  display: string;
  // Best-effort filename for the storage lookup. The endpoint does
  // fuzzy matching so we don't need to be perfect.
  filenameHint: string;
  page: number | null;
} {
  const pageMatch =
    source.match(/page\s+(\d+)/i) ?? source.match(/p\.?\s*(\d+)/i);
  const page = pageMatch ? parseInt(pageMatch[1], 10) : null;
  // Strip the page reference + section refs to get a doc name.
  const stripped = source
    .replace(/,?\s*(section|sec\.?)\s+[\w.]+/gi, "")
    .replace(/,?\s*page\s+\d+/gi, "")
    .replace(/,?\s*p\.?\s*\d+/gi, "")
    .trim();
  // The filename in storage is usually like "5._CalPro_Home_Inspection.pdf".
  // We can't construct that exactly, but we can pass a hint and let
  // the server route do prefix/contains matching across the folder.
  // For now, use the stripped doc name as the hint.
  return {
    display: source,
    filenameHint: stripped,
    page,
  };
}

export function CriticalFindingsView({ reportId, findings }: Props) {
  const [panel, setPanel] = useState<SourcePanelState>({ phase: "closed" });

  async function openSource(source: string) {
    const parsed = parseSourceCitation(source);
    setPanel({
      phase: "loading",
      filename: parsed.filenameHint,
      page: parsed.page,
    });
    try {
      const params = new URLSearchParams({ file: parsed.filenameHint });
      const res = await fetch(
        `/api/reports/${reportId}/source-url?${params.toString()}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (HTTP ${res.status}).`);
      }
      const finalUrl = parsed.page
        ? `${data.url}#page=${parsed.page}`
        : data.url;
      setPanel({
        phase: "open",
        filename: data.filename ?? parsed.filenameHint,
        page: parsed.page,
        url: finalUrl,
      });
    } catch (err) {
      setPanel({
        phase: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not load the source PDF.",
      });
    }
  }

  if (findings.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
      <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
        Critical & high-priority findings (detail)
      </h3>
      <div className="space-y-3">
        {findings.map((f, i) => (
          <FindingDetail
            key={i}
            reportId={reportId}
            finding={f}
            index={i + 1}
            onOpenSource={openSource}
          />
        ))}
      </div>

      {panel.phase !== "closed" && (
        <SourceSidePanel state={panel} onClose={() => setPanel({ phase: "closed" })} />
      )}
    </section>
  );
}

function FindingDetail({
  reportId,
  finding,
  index,
  onOpenSource,
}: {
  reportId: string;
  finding: Finding;
  index: number;
  onOpenSource: (source: string) => void;
}) {
  const whatItIs =
    finding.what_it_is?.trim() || finding.description?.trim() || null;
  const whyItMatters =
    finding.why_it_matters?.trim() || finding.risk_if_ignored?.trim() || null;
  const nextStep =
    finding.next_step?.trim() || finding.recommended_action?.trim() || null;

  // Slug-stable anchor target so the Top Strengths / Top Concerns
  // link icons up top can jump straight to this card. The slug is
  // derived from finding.title via the shared helper in
  // lib/reports/summary so the source (the strengths/concerns
  // picker) and the target (this card) can never drift apart.
  // scroll-mt gives the anchored card breathing room from the top
  // of the viewport instead of butting up against it.
  const anchorId = `finding-${slugifyFindingTitle(finding.title)}`;
  return (
    <div
      id={anchorId}
      className="rounded-xl border border-red-200/60 bg-red-50/40 p-4 scroll-mt-4 target:ring-2 target:ring-red-300"
    >
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <p className="font-bold text-red-900 text-sm flex-1 min-w-0">
          {index}. {finding.title}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {finding.quote_match_failed ? (
            // Surfaced when the post-analyzer quote validator could
            // not match the finding's source_quote against the
            // concatenated extracted text of the uploaded documents.
            // The finding stays visible (Critical) but the agent is
            // explicitly told to verify before relying on it. See
            // lib/reports/quote-validator.ts for the match rules.
            <span
              className="text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded"
              title="The source quote for this finding could not be verified against the uploaded documents. Open the source PDF and confirm before relying on this finding."
            >
              Needs review
            </span>
          ) : null}
          <span className="text-[10px] font-bold uppercase tracking-wider bg-red-700 text-white px-2 py-0.5 rounded">
            {finding.severity}
          </span>
          {/* Per-finding flag affordance: clicking opens a modal
              that POSTs to /api/reports/<id>/findings/flag. Founder
              triages flags via /admin/finding-flags as feedback into
              the analyzer prompt. */}
          <FindingFlagButton
            reportId={reportId}
            findingTitle={finding.title}
            findingSeverity={finding.severity}
          />
        </div>
      </div>
      {finding.source_quote && (
        <blockquote className="text-xs italic text-slate-700 border-l-2 border-slate-300 pl-3 mb-2">
          &ldquo;{finding.source_quote}&rdquo;
        </blockquote>
      )}
      <button
        type="button"
        onClick={() => onOpenSource(finding.source)}
        className="text-xs italic text-indigo-700 hover:text-indigo-900 underline underline-offset-2 mb-2"
        title="Open the source PDF in a side panel at the cited page"
      >
        Source: {finding.source} →
      </button>
      {whatItIs && (
        <p className="text-sm text-slate-700 leading-relaxed mb-1">
          <span className="font-semibold">What it is: </span>
          {whatItIs}
        </p>
      )}
      {whyItMatters && (
        <p className="text-sm text-slate-700 leading-relaxed mb-1">
          <span className="font-semibold">Why it matters: </span>
          {whyItMatters}
        </p>
      )}
      {nextStep && (
        <p className="text-sm text-slate-700 leading-relaxed mb-1">
          <span className="font-semibold">Next step: </span>
          {nextStep}
        </p>
      )}
      <p className="text-[11px] text-emerald-700 mt-1">
        Confidence:{" "}
        {finding.confidence.charAt(0).toUpperCase() +
          finding.confidence.slice(1)}
      </p>
    </div>
  );
}

function SourceSidePanel({
  state,
  onClose,
}: {
  state: Exclude<SourcePanelState, { phase: "closed" }>;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Source document"
    >
      {/* Backdrop. Tap to close on mobile. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close source panel"
        className="flex-1 bg-black/50 cursor-default"
      />
      {/* Side panel. Full-width on mobile, ~720px on desktop. */}
      <div className="w-full sm:w-[720px] max-w-full bg-white shadow-xl flex flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
              Source document
            </p>
            <p className="text-sm text-slate-900 font-semibold truncate">
              {"filename" in state ? state.filename : "Loading…"}
              {"page" in state && state.page != null ? (
                <span className="ml-2 text-xs text-slate-500 font-normal">
                  · page {state.page}
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 text-2xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="flex-1 bg-slate-100 overflow-hidden">
          {state.phase === "loading" && (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              Loading source PDF…
            </div>
          )}
          {state.phase === "error" && (
            <div className="h-full flex items-center justify-center px-6 text-center">
              <div>
                <p className="text-sm font-semibold text-red-700">
                  Couldn&apos;t open this source
                </p>
                <p className="text-xs text-slate-600 mt-2">{state.message}</p>
              </div>
            </div>
          )}
          {state.phase === "open" && (
            <iframe
              src={state.url}
              title="Source PDF"
              className="w-full h-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
