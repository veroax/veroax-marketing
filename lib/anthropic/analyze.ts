import type Anthropic from "@anthropic-ai/sdk";
import Anthropic_ from "@anthropic-ai/sdk";
import { getAnthropicClient, ANALYSIS_MODEL } from "./client";
import {
  REPORT_TOOL_SCHEMA,
  FOCUSED_TOOL_SCHEMA,
  type ReportData,
  type FocusedAnalysis,
  type Finding,
  type CostRange,
  type Severity,
} from "./schema";
import {
  classifyDocument,
  type DocumentType,
  type PassGroup,
} from "@/lib/pdf/classify";
import {
  selectMarketReference,
  formatMarketReferenceForPrompt,
} from "@/lib/cost-reference/california-markets";
import { fetchMarketContext } from "./market-context";
import { fetchLiveCostReference } from "./cost-reference-fetch";
import {
  reconcileListingData,
  mlsStatusNoteFromReconciliation,
  type ListingReconciliation,
} from "./listing-reconciliation";

// ============================================================================
// Multi-pass disclosure analysis
//
// Single-pass analysis can't handle a typical CA disclosure package
// (~400K-800K tokens of text) within Sonnet's 200K context window.
// This module breaks the work into focused passes per document group
//, each pass small enough to fit context, then synthesizes the
// outputs into the final 14-section ReportData.
//
// Pipeline:
//   1. analyzeFocusedPass(documents, group) for each document group
//      (seller_disclosures, inspections, hoa, hazards). Each pass
//      may itself sub-split (analyzeFocusedPass internally) if its
//      documents exceed the per-pass token budget.
//   2. synthesizeReport(passes) combines all FocusedAnalysis outputs
//      into the full ReportData via a final structured call.
//
// Token-budget guarantees: every document is analyzed. If a single
// document group's text exceeds PASS_TOKEN_BUDGET, that group is
// sub-split into multiple sub-passes whose findings are merged at the
// group level before synthesis.
//
// ----------------------------------------------------------------------------
// HYBRID DOCUMENT MODE: native PDF attachments for high-signal groups,
// text extraction for the rest
// ----------------------------------------------------------------------------
//
// Per-group transport mode (see GROUP_MODE constant below):
//
//   seller_disclosures: PDF , TDS check-boxes, SPQ side-by-side
//                              seller-vs-agent responses, AVID notes,
//                              and prelim title layout all carry
//                              meaning that linearized text loses.
//                              Claude sees the documents as a human
//                              would.
//   inspections:        PDF , Inspection-report severity icons,
//                              annotated photos, and side-by-side
//                              checklists. Same reasoning.
//   hoa:                TEXT, CC&Rs, Bylaws, budgets, reserve
//                              studies, meeting minutes. Long and
//                              dry; the text alone is sufficient
//                              and the per-page cost matters here
//                              because HOA packages routinely run
//                              500+ pages.
//   hazards:            TEXT, NHD forms and earthquake-fault zone
//                              maps; the text fields carry the
//                              information and the visuals don't
//                              add much.
//
// PDF mode trade-offs:
//   - Cost: ~1500 input tokens per page vs. ~300 for extracted text
//     (5× per affected group). For a typical CA package this means
//     seller_disclosures + inspections triple in cost, while hoa +
//     hazards stay flat. Net ~2-3× total Claude spend per analysis.
//   - Accuracy: significant. The Cowork disclosure-analyzer skill
//     uses native PDF attachments throughout and produces noticeably
//     better signal on TDS / SPQ / AVID interpretation. Veroax
//     hybrid matches Cowork on those high-signal groups while
//     staying economical on the long HOA packages where Cowork's
//     advantage doesn't translate.
//   - Per-call context: PDF mode sub-batches by PAGES (100/call,
//     ≈150K tokens) instead of by extracted-text tokens. Each
//     finalize-time chunk is already capped at 90 pages by
//     lib/pdf/split.ts, so a single Document never exceeds budget.
//
// REGIONAL PRICING REFERENCE:
//   The focused-pass system prompt is augmented with a region-
//   specific snapshot of California labor and common-repair
//   baselines (see lib/cost-reference/california-markets.ts). The
//   selectMarketReference(propertyAddressHint) helper picks the
//   best-match region for the report; the reference is injected
//   into each focused-pass call so cost estimates land in a
//   defensible range for the property's actual market. Defaults
//   to Bay Area / Silicon Valley when no hint resolves cleanly.
// ============================================================================

// Per-pass document-token budget for TEXT-mode groups (hoa, hazards).
// Stays well below Sonnet's 200K context, leaving room for system
// prompt, tool schema, and reasoning.
const PASS_TOKEN_BUDGET = 175_000;

// Per-pass document-page budget for PDF-mode groups (seller_disclosures,
// inspections). We sized this empirically after a 100-page run blew the
// 200K context window with 209K tokens in production:
//
//   - Per-page cost: 1500-2000+ tokens depending on content. Scanned
//     inspection reports with photos / annotations land near the high end;
//     digitally-exported text PDFs near the low end. Plan for 2000.
//   - Per-call overhead: ~50K tokens (system prompt with the always-
//     Critical rules + the 14-section tool schema + per-group instructions
//     + regional pricing reference + update-context note + tool-use
//     reasoning budget). The earlier 5K estimate was off by an order
//     of magnitude.
//   - Safety target: 180K to leave room for Anthropic's measurement
//     variance and for the output tokens to stream in cleanly.
//
//   60 pages x 2000 tokens = 120K + 50K overhead = 170K with 10K headroom.
//
// MAX_PAGES_PER_CHUNK in lib/pdf/split.ts stays at 90, that's the
// per-document Claude limit (model-level PDF rendering cap), which is
// separate from how many docs we PACK into a single call. The packer
// below (splitDocumentsByPages) caps total packed pages per call here.
//
// PDF_PASS_PAGE_BUDGET and GROUP_MODE are defined once in
// lib/pdf/limits.ts and shared with lib/server/performAnalysis.ts so
// the two callers cannot drift.
import { PDF_PASS_PAGE_BUDGET, GROUP_MODE } from "@/lib/pdf/limits";

const MAX_RETRY_WAIT_SECONDS = 150;
const MAX_ATTEMPTS = 3;

export type Document = {
  filename: string;
  // Extracted text. Populated for text-mode groups (hoa, hazards).
  // Empty string for PDF-mode groups where we send the file as a
  // native document attachment instead.
  text: string;
  pages: number;
  tokens: number;
  // ISO date this document was added to the report. Null/undefined for
  // documents in the original upload. When present and after the
  // original analysis date, the focused-pass system prompt notes the
  // document is newer, and synthesis tags any sourced finding with
  // from_doc_added_at.
  addedAt?: string | null;
  // Base64-encoded PDF bytes. Populated for PDF-mode groups
  // (seller_disclosures, inspections). The analyzer attaches these
  // as Anthropic document blocks instead of inlining the text. Null
  // for text-mode groups.
  pdfBase64?: string | null;
};

// Provided by /api/reports/[id]/update when re-analyzing after the
// agent appended new docs. Drives date-aware behavior in the prompt
// and in synthesis (the update_note field on ReportData).
export type UpdateContext = {
  // ISO date of the original analysis (when the agent first uploaded).
  originalAnalysisDate: string;
  // ISO date this update is being performed on.
  updateDate: string;
  // Filenames added in this update, used to tag finding sources.
  addedFilenames: string[];
};

export type AnalyzeInput = {
  groups: Record<PassGroup, Document[]>;
  propertyAddressHint?: string | null;
  // Agent-provided Zillow / MLS / Redfin / Realtor.com URL for the
  // subject property. Passed through to the market-context fetcher as
  // an authoritative starting point for web_search. When present,
  // market-context's web_search opens this URL FIRST so the comp
  // selection + DOM + list price come from the actual listing rather
  // than from whatever search-result strings Claude finds. Null when
  // the agent didn't enter a URL on the upload form.
  listingUrl?: string | null;
  // Extracted text from the MLS-printout PDF the agent optionally
  // attached on the upload form. When present, this is injected at the
  // TOP of the seller_disclosures focused pass as authoritative
  // listing data, the seller's MLS sheet is the canonical source for
  // list_price, days_on_market, mls_number, list_date, parking, and
  // zestimate. Without this, the analyzer was guessing those facts
  // from whatever document it saw a number in first (which produced
  // the wrong $1,178,000 / DOM=2 on the 1544 San Antonio St report,
  // pulled from a seller-form signature date and a stale price).
  listingText?: string | null;
  updateContext?: UpdateContext | null;
  onPassStarted?: (group: PassGroup, subIndex: number, subTotal: number) => Promise<void>;
  onPassCompleted?: (
    group: PassGroup,
    subIndex: number,
    subTotal: number,
    usage: { input_tokens: number; output_tokens: number },
  ) => Promise<void>;
  // Fired after each verifier sub-batch resolves. Outcome is one of
  // "ok" (verifier surfaced new findings), "empty_delta" (verifier
  // ran and confirmed nothing was missed), "no_tool_use" (verifier
  // failed to emit a tool_use), or "threw" (verifier threw an
  // exception). performAnalysis uses this to write a per-pass
  // audit_log row so /admin/health can compute the rolling
  // verifier success rate.
  onVerifyCompleted?: (params: {
    group: PassGroup;
    subIndex: number;
    subTotal: number;
    outcome: "ok" | "empty_delta" | "no_tool_use" | "threw";
    newFindingsCount: number;
    stopReason: string | null;
    errorMessage: string | null;
    usage: { input_tokens: number; output_tokens: number };
  }) => Promise<void>;
  // Cost-reference fetch happens SEQUENTIALLY before the focused
  // passes start, takes 30 to 90 seconds via a web_search Claude
  // call. Without these callbacks the polling progress block has
  // no signal for that whole window and the agent / admin sees
  // a frozen "queued" label.
  onCostReferenceStarted?: () => Promise<void>;
  onCostReferenceCompleted?: (params: {
    succeeded: boolean;
  }) => Promise<void>;
  // Market-context fetch + listing reconciliation run IN PARALLEL
  // after the focused passes complete, both via web_search Claude
  // calls. Together they consume the 2 to 4 minute "post-focused"
  // window between the last pass_completed and the
  // synthesis_started event. Without these callbacks the polling
  // progress block sat on "Finished {last group}" for that whole
  // window.
  onPostFocusedFetchStarted?: () => Promise<void>;
  onPostFocusedFetchCompleted?: (params: {
    market_context_ok: boolean;
    listing_reconciliation_ok: boolean;
  }) => Promise<void>;
  onSynthesisStarted?: () => Promise<void>;
  onSynthesisCompleted?: (usage: {
    input_tokens: number;
    output_tokens: number;
  }) => Promise<void>;
};

export type AnalyzeResult = {
  report: ReportData;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  passes: Array<{
    group: PassGroup;
    sub_index: number;
    sub_total: number;
    document_count: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  // Audit trail from the listing-data reconciliation step. Persisted
  // to reports.listing_reconciliation by performAnalysis. Used by
  // the UI to surface the divergence banner + the source-override
  // workflow. Null when reconciliation was skipped (no usable
  // listing data input) or failed.
  listing_reconciliation: ListingReconciliation | null;
  model: string;
};

// ============================================================================
// Public entry point
// ============================================================================

export async function analyzeDisclosurePackage(
  input: AnalyzeInput,
): Promise<AnalyzeResult> {
  const passResults: Array<{
    group: PassGroup;
    sub_index: number;
    sub_total: number;
    document_count: number;
    analysis: FocusedAnalysis;
    input_tokens: number;
    output_tokens: number;
  }> = [];

  // Live regional cost reference, web-searched at run start, scoped
  // to the subject property's California market. Matches the cowork
  // pattern of "build a regional cost reference library via web
  // search at the start of each run." Replaces (when successful) the
  // hardcoded biweekly-refresh table for THIS analysis. The
  // function has its own hard outer timeout (180s) so it can't blow
  // the budget; failure returns null and the focused passes fall
  // back to the hardcoded reference.
  //
  // We run this sequentially BEFORE focused passes start because
  // every focused pass consumes the reference in its system prompt.
  // The wall-clock cost is roughly 30 to 90 seconds in the happy
  // path, well inside the 800s analyze.maxDuration budget.
  await input.onCostReferenceStarted?.();
  const liveCost = await fetchLiveCostReference({
    propertyAddressHint: input.propertyAddressHint ?? null,
    marketRegion: null,
  });
  const liveMarketBlock = liveCost?.prompt_block ?? null;
  if (liveCost) {
    console.log(
      `[analyze] live cost reference fetched: region="${liveCost.region_label}" sources=${liveCost.sources.length}`,
    );
  }
  await input.onCostReferenceCompleted?.({ succeeded: Boolean(liveCost) });

  // For each group that has documents, run focused pass(es). Groups can
  // run in parallel.
  //
  // Live market-context used to fire IN PARALLEL with the focused
  // passes, with all metadata fields (property_type, bedrooms,
  // bathrooms, square_feet, list_price) hardcoded to null. That meant
  // Claude only had the address string to work with and was prone
  // to fabricating comps from prompt examples. Now market-context
  // runs AFTER focused passes complete, seeded with the real
  // property_facts the focused passes extracted. Costs us 4 to 6
  // minutes of wall-clock time we used to claw back in parallelism,
  // but the focused-pass wall clock typically sits at 3 to 5 minutes
  // and the new market-context cap is 240s, so the total still fits
  // inside the 800s Vercel maxDuration with comfortable margin.
  const groupKeys: PassGroup[] = ["seller_disclosures", "inspections", "hoa", "hazards"];
  const groupPromises = groupKeys
    .filter((g) => (input.groups[g] ?? []).length > 0)
    .map(async (group) => {
      const docs = input.groups[group];
      const mode = GROUP_MODE[group];
      // Sub-split docs to fit per-call budgets. PDF-mode groups
      // budget by page count (each page ≈ 1500 input tokens of
      // attached PDF); text-mode groups budget by extracted-text
      // tokens.
      const subBatches =
        mode === "pdf"
          ? splitDocumentsByPages(docs, PDF_PASS_PAGE_BUDGET)
          : splitDocumentsForBudget(docs, PASS_TOKEN_BUDGET);

      const subResults = await Promise.all(
        subBatches.map(async (batch, i) => {
          await input.onPassStarted?.(group, i + 1, subBatches.length);
          // First pass: extract findings.
          const r = await analyzeFocusedPass(
            batch,
            group,
            mode,
            input.propertyAddressHint,
            input.updateContext ?? null,
            input.listingText ?? null,
            liveMarketBlock,
          );
          // Second pass: verify the first pass's output against the
          // same documents. Returns a delta FocusedAnalysis with
          // ONLY the findings the first pass missed (or an empty
          // findings array if the first pass was complete). The
          // synthesizer flat-maps findings across all passes, so the
          // delta entries are picked up automatically. See
          // FOCUSED_VERIFY_SUFFIX above for what the verifier is
          // told to look for.
          const v = await verifyFocusedAnalysis({
            documents: batch,
            group,
            mode,
            propertyAddressHint: input.propertyAddressHint,
            updateContext: input.updateContext ?? null,
            listingText: input.listingText ?? null,
            liveMarketBlock,
            originalAnalysis: r.analysis,
          }).catch((err) => {
            // Verifier failures are non-fatal. The first pass's
            // output is what we'd have shipped without the verifier,
            // so on failure we just keep going with that.
            // outcome="threw" so the audit_log row distinguishes
            // a throw from the in-band "no_tool_use" outcome.
            console.warn(
              `[verify] ${group} sub-batch ${i + 1}/${subBatches.length} failed; using first-pass output as-is:`,
              err instanceof Error ? err.message : err,
            );
            return {
              analysis: { findings: [] } as unknown as FocusedAnalysis,
              usage: { input_tokens: 0, output_tokens: 0 },
              outcome: "threw" as const,
              stop_reason: null,
              errorMessage:
                err instanceof Error ? err.message : String(err),
            };
          });

          // Audit the verifier outcome so /admin/health can compute
          // the rolling success rate. "ok" and "empty_delta" are both
          // valid healthy outcomes; "no_tool_use" and "threw" are
          // failures worth surfacing.
          await input.onVerifyCompleted?.({
            group,
            subIndex: i + 1,
            subTotal: subBatches.length,
            outcome: v.outcome ?? "ok",
            newFindingsCount: Array.isArray(v.analysis.findings)
              ? v.analysis.findings.length
              : 0,
            stopReason: v.stop_reason ?? null,
            errorMessage:
              (v as unknown as { errorMessage?: string | null })
                .errorMessage ?? null,
            usage: v.usage,
          });
          const combinedUsage = {
            input_tokens: r.usage.input_tokens + v.usage.input_tokens,
            output_tokens: r.usage.output_tokens + v.usage.output_tokens,
          };
          await input.onPassCompleted?.(group, i + 1, subBatches.length, combinedUsage);
          // Return both as TWO pass entries. The synthesizer doesn't
          // distinguish first-pass from verifier-delta entries; it
          // just flat-maps findings across all of them.
          return [
            {
              group,
              sub_index: i + 1,
              sub_total: subBatches.length,
              document_count: batch.length,
              analysis: r.analysis,
              input_tokens: r.usage.input_tokens,
              output_tokens: r.usage.output_tokens,
            },
            {
              group,
              sub_index: i + 1,
              sub_total: subBatches.length,
              document_count: 0,
              analysis: v.analysis,
              input_tokens: v.usage.input_tokens,
              output_tokens: v.usage.output_tokens,
            },
          ];
        }),
      );
      // subBatches.map returned an array of [first, verify] tuples.
      // Flatten so the consumer sees a flat list of pass entries.
      return subResults.flat();
    });

  const all = (await Promise.all(groupPromises)).flat();
  passResults.push(...all);

  // Now run market-context with the real property metadata the
  // focused passes extracted. Pick the first non-null value across
  // passes for each metadata field, the focused passes typically
  // converge on the same answers for these basic facts.
  const facts = pickFirstFacts(passResults.map((p) => p.analysis));

  // Two web_search-backed fetches run in parallel after focused
  // passes complete:
  //   - market-context: comps, rates, monthly carrying cost
  //   - listing reconciliation: reconciles package MLS print-out vs.
  //     agent's listing URL vs. fresh live web search; produces the
  //     relist ladder and divergence flag
  // They're independent so we await them concurrently. Both have
  // their own hard outer timeouts so a single hang can't take the
  // whole analysis down.
  //
  // This is the 2-to-4-minute "post-focused" window. Without the
  // onPostFocusedFetchStarted/Completed callbacks the polling
  // progress block sits on "Finished {last group}" for the whole
  // window because no audit_log events fire here.
  await input.onPostFocusedFetchStarted?.();
  // Hard cap on the post-focused-fetch step. Both market context and
  // listing reconciliation are web_search-backed Claude calls that
  // can take 60 to 120 seconds each. When the upstream analysis
  // already ate most of the Vercel 800s budget (e.g., after a
  // long OCR pre-pass), letting these two run unbounded means the
  // function gets KILLED at maxDuration before synthesis runs,
  // and the report's report_data never updates. Better to skip
  // these nice-to-haves and produce a complete (slightly less
  // rich) report than to produce nothing.
  const POST_FETCH_CAP_MS = 90_000; // 90s
  const postFetchPromise = Promise.all([
    fetchMarketContext({
      propertyAddress: input.propertyAddressHint ?? null,
      marketRegion: facts.market_region ?? null,
      propertyType: facts.property_type ?? null,
      bedrooms: facts.bedrooms ?? null,
      bathrooms: facts.bathrooms ?? null,
      squareFeet: facts.square_feet ?? null,
      listPrice: facts.list_price ?? null,
      listingUrl: input.listingUrl ?? null,
    }).catch(() => null),
    reconcileListingData({
      propertyAddress: input.propertyAddressHint ?? null,
      apn: facts.apn ?? null,
      packageMlsText: input.listingText ?? null,
      listingUrl: input.listingUrl ?? null,
    }).catch(() => null),
  ]);
  const timeoutPromise = new Promise<readonly [null, null]>((resolve) =>
    setTimeout(() => resolve([null, null] as const), POST_FETCH_CAP_MS),
  );
  const [liveMarketContext, listingReconciliation] = (await Promise.race([
    postFetchPromise,
    timeoutPromise,
  ])) as [Awaited<ReturnType<typeof fetchMarketContext>> | null, Awaited<ReturnType<typeof reconcileListingData>> | null];
  await input.onPostFocusedFetchCompleted?.({
    market_context_ok: Boolean(liveMarketContext),
    listing_reconciliation_ok: Boolean(listingReconciliation),
  });

  // Diagnostic log so we can see what reconciliation produced
  // without having to grep the listing_reconciliation JSON column
  // by hand. Includes the key signals: did sources disagree, which
  // source was recommended, did we get a current price, how many
  // relist events were reconstructed. Helps diagnose "the report
  // still shows the stale price" reports quickly from server logs.
  if (listingReconciliation) {
    console.log(
      `[analyze] listing reconciliation: has_divergence=${listingReconciliation.has_divergence} recommended=${listingReconciliation.recommended_source} current_price=${listingReconciliation.current?.list_price ?? "null"} current_mls=${listingReconciliation.current?.mls_number ?? "null"} relist_events=${listingReconciliation.relist_ladder?.length ?? 0} same_agent=${listingReconciliation.same_listing_agent_pattern}`,
    );
  } else {
    console.log(
      "[analyze] listing reconciliation returned null (no sources or timed out)",
    );
  }

  // Synthesis pass, deterministic code, not a Claude call.
  // Observed in production: the Claude-driven synthesis call hung
  // indefinitely on real disclosure packages, dying at maxDuration.
  // Each focused pass already produced fully-structured findings; the
  // synthesis "work" (sort by severity, aggregate cost ranges, pick a
  // rating, dedupe questions) is deterministic transformation, not
  // reasoning. Doing it in code is instant and 100% reliable.
  await input.onSynthesisStarted?.();
  const report = synthesizeReportInCode(
    passResults.map((p) => p.analysis),
    input.propertyAddressHint ?? null,
    input.updateContext ?? null,
    liveMarketContext,
    listingReconciliation,
    passResults.map((p) => p.group),
  );
  await input.onSynthesisCompleted?.({ input_tokens: 0, output_tokens: 0 });

  const totalInput = passResults.reduce((sum, p) => sum + p.input_tokens, 0);
  const totalOutput = passResults.reduce((sum, p) => sum + p.output_tokens, 0);

  return {
    report,
    usage: { input_tokens: totalInput, output_tokens: totalOutput },
    passes: passResults.map((p) => ({
      group: p.group,
      sub_index: p.sub_index,
      sub_total: p.sub_total,
      document_count: p.document_count,
      input_tokens: p.input_tokens,
      output_tokens: p.output_tokens,
    })),
    listing_reconciliation: listingReconciliation,
    model: ANALYSIS_MODEL,
  };
}

// ============================================================================
// Focused per-group pass
// ============================================================================

const FOCUSED_SYSTEM_BASE = `You are Veroax, an AI-powered disclosure analysis assistant for real estate transactions in California.

You are part of a multi-pass analysis pipeline. Your job is to extract structured findings from a SUBSET of a buyer's disclosure package, the documents shown below. Another agent will combine your findings with those from other document groups (seller disclosures, inspection reports, HOA, hazards) into a final 14-section buyer report.

CRITICAL RULES:

1. GROUND EVERY FINDING IN THE DOCUMENTS PROVIDED. If a piece of information isn't in the documents you were given, do not invent it. Use null or empty arrays as appropriate. Mark findings with low confidence when the source is ambiguous.

2. SOURCE EVERY FINDING. Every Finding must cite which document (filename) and approximate page or section. Citations like "from the disclosures" are not acceptable.

3. SEVERITY RATING is weighted by (a) cost to remediate and (b) active hazard and (c) lender/insurance-blockability. Use this rubric strictly:

   - CRITICAL: any of (i) $15,000+ to remediate, (ii) active hazard, (iii) lender/insurance-blocking. THE FOLLOWING ITEMS ARE ALWAYS CRITICAL when present, regardless of remediation cost, because they routinely block insurance or conventional lending and are textbook closing-blockers in California real estate transactions:
     · Aluminum branch wiring (NM-type aluminum, common in 1965-1972 builds), insurers and conventional lenders often refuse to bind/fund unless remediated via COPALUM or AlumiConn pigtails throughout
     · Federal Pacific Stab-Lok panels (and Zinsco/Sylvania panels), known fire hazard; insurers commonly refuse to bind
     · Polybutylene supply plumbing (grey, white, or blue plastic with metal crimp rings), class-action settlement subject; coverage commonly refused
     · ABS drain piping subject to the 1984-1990 class action (recall-era ABS), defective material; many insurers exclude
     · Kitec plumbing (yellow brass fittings, PEX-AL-PEX), class-action subject; insurer concern
     · Knob-and-tube wiring with active circuits, insurance commonly refuses
     · Active roof leak, ongoing water intrusion, or active foundation settlement
     · Visible mold growth or moisture-saturated areas
     · Visible structural cracks > 1/4 inch in load-bearing walls or foundation
     · Asbestos in friable condition (vermiculite insulation, deteriorating popcorn ceiling)
     · Lead-based paint in homes pre-1978 with children under 6 occupying or expected to occupy
     · Galvanized supply piping with documented active leaks or failures
     · Underground oil/fuel storage tank without documented decommissioning
     · Unpermitted living-area conversion, ADU, or addition affecting appraisal/financing
     For these items specifically, do NOT downgrade to High based on low remediation cost. The cost is irrelevant, the issue is lender/insurance blockability and the buyer cannot close without addressing it.

   When you mark a finding Critical SOLELY because it matched one of the always-Critical items above, populate the optional "triggered_rule" field with the corresponding short identifier so the agent can see which rule fired. Identifiers: aluminum_wiring, FPE_panel, polybutylene, ABS_recall_era, kitec_plumbing, knob_and_tube, active_water_intrusion, active_mold, structural_crack_load_bearing, asbestos_friable, lead_paint_pre1978_w_children, galvanized_active_failure, underground_oil_tank, unpermitted_living_area. Leave "triggered_rule" null when the Critical rating came from cost/hazard/lender criteria rather than a named always-Critical rule.

   - HIGH: $5,000-$15,000 OR significant future risk that's NOT on the always-Critical list above. Examples: aging HVAC (15+ years), sewer lateral repair, full electrical panel replacement (non-FPE), retaining-wall issues, deferred chimney repair.
   - MODERATE: $1,000-$5,000 OR 1-5 year horizon. Examples: water heater near end of life, deferred exterior paint, minor plumbing fixtures, dated GFCI status.
   - COSMETIC: <$1,000 OR purely aesthetic. Examples: minor drywall cracks, dated finishes, worn carpet, minor exterior touch-up.

4. CONFIDENCE reflects directness of evidence:
   - HIGH: the document explicitly states the issue.
   - MEDIUM: the document implies the issue but doesn't state it directly.
   - LOW: inferred from indirect evidence (age, regional norms, missing information).

4.05. EXTRACTION DISCIPLINE (mandatory). The output of this pass is the input to a buyer's negotiation. The buyer's agent reads it next to the source documents and judges trust based on whether YOUR specifics match the documents'. Generic findings ("aging electrical system", "review HOA financials") read as filler. Findings carrying NAMES, DATES, REPORT IDs, DOLLAR AMOUNTS, and STATUTE REFERENCES read as professional analysis.

   For EVERY finding, EVERY property_facts field, and EVERY document_inventory entry, extract the source documents' SPECIFICS where present. Mandatory targets:

   A) NAMED PARTIES. Pull names verbatim, do NOT redact:
      - Sellers (from TDS / SPQ signature blocks)
      - Listing agent / team + brokerage + DRE numbers (from AVID, MLS printout, disclosure cover)
      - Inspectors + their license numbers + report numbers (from each inspection report cover)
      - Title company + file number (from prelim title cover)
      - HOA management company + management contact (from CC&Rs and management notice)
      - Insurance carriers (master HOA policy carrier + carrier of any disclosed claim history)
      - Existing lender on title (deed-of-trust beneficiary + recording date + loan amount)

   B) DOCUMENT IDs. Every cited document carries an identifier; extract it:
      - MLS number(s) for the current listing AND any prior cancelled listings (Cowork output cites both)
      - FEMA flood panel number + effective date (e.g., "06081C 0309F effective 4/5/2019")
      - NHD report number + provider (e.g., "JCP Report #3583333")
      - Inspector report numbers (e.g., "TAPS Termite #57662", "Marvin Morazan Roofing #RI0513202601")
      - Prelim title file number (e.g., "Chicago Title File FWTO-3472600554-TO")
      - HOA assessment ballot recording / approval dates and resolution numbers
      - APN, lot/block from prelim title or property profile

   C) SPECIFIC DOLLAR AMOUNTS pulled FROM THE DOCUMENTS, not your priors:
      - Loan balances / deed-of-trust amounts ("$455,200 deed of trust to LoanDepot recorded 2/2/2021")
      - HOA reserves balance from the balance sheet ("$40,891.19 as of Feb 28, 2026")
      - Approved special assessments with exact amounts ("$154,280.32 elevator project approved Nov 13, 2024")
      - Solar lease monthly cost + lease-end year ("Sunrun $241/mo through ~2036")
      - HOA monthly dues + last increase amount + effective date
      - List price + every prior list price in the relist history with the percentage reduction
      Numbers from inspector cost write-ups should be cited verbatim (e.g., "$3,850 partial repair quote per Morazan attachment, p.4"), even when your remediation cost_estimate is regional.

   D) STATUTE / CODE REFERENCES baked into recommended_action when the finding implies one. The analyzer should know the CA statutes that govern each finding type, cite them by section. The canonical mapping:
      - ADU permit / legalization: AB 2533 (effective 1/1/2025), CA Health & Safety Code Section 17920.3
      - HOA reserve study requirement: CA Civil Code Section 5550
      - HOA disclosure menu: CA Civil Code Section 4525 (and Section 4530 for litigation)
      - HOA balcony / elevated-element inspection (SB 326): CA Civil Code Section 5551
      - Flood insurance requirement on federally-backed mortgages: Flood Disaster Protection Act of 1973, with FEMA Risk Rating 2.0 as the current methodology
      - NHD-form disclosure requirements: CA Civil Code Section 1102.6c
      - Earthquake fault (Alquist-Priolo): CA Public Resources Code Section 2622
      - Seismic Hazard Zone (liquefaction / landslide): CA Public Resources Code Section 2696
      - Mello-Roos disclosure: CA Government Code Section 53341.5
      - Lead-based paint (federal): 24 CFR 35.92 and CA H&S 17920.10
      - Asbestos disturbance during remodel: 40 CFR Part 61 (NESHAP), CA H&S Section 25915
      - Structural pest report categorization (Section I vs Section II): California Structural Pest Control Board Rules Section 1992
      - Sewer lateral point-of-sale: jurisdiction-specific; cite the local agency (e.g., "East Palo Alto sewer is West Bay Sanitary District")
      When a finding cites a statute, use the section number verbatim, not a paraphrase.

   E) ACTIONABLE CONTACT INFO in recommended_action when an external party is implied:
      - City building department (planning / inspections) when permits are at issue: name the department + phone + email when locatable (e.g., "Contact City of East Palo Alto Planning at planning@cityofepa.org or 650-853-3189")
      - Inspector / contractor for re-inspection: cite an action like "Get two reroof quotes from licensed Peninsula roofing contractors during the inspection period"
      - Lender for product confirmation: "Confirm the buyer's lender will close on a FEMA Zone AE property with a known unpermitted ADU"
      - Insurance carriers / FAIR Plan when applicable: "Get a Zone AE flood quote at this specific address before contingency removal" or "California FAIR Plan applies in FHSZ areas, budget separately"
      - HOA management for missing documents: explicit ask, not "review HOA documents" but "Request from listing agent: forward-looking HOA budget, formal reserve study, written litigation statement, full elevator-assessment payoff schedule, within 3 days"

   F) DATES, DATES, DATES. Every finding carries at least one date relevant to its timeline:
      - Document signing dates
      - Report dates (inspections, NHD, prelim title effective date)
      - Listing dates (active, cancelled, re-listed)
      - Recording dates (deeds, UCC-1 liens, easements)
      - Last full fumigation / last roof replacement / last reserve study
      - HOA capital project approval dates from the board minutes
      An inspection dated 6/26/2024 with the property listed 3/19/2026 is 21 months stale; cite both dates so the staleness is visible.

   The verifier pass that runs AFTER this one will demote any Critical finding whose source_quote can't be matched against the package text. It will also flag findings that read as boilerplate (no names, no dates, no statute refs, no dollar amounts). Save yourself the demotion: extract the specifics now.

4.1. SCOPE GUARDRAIL (mandatory). Findings must not OVERREACH the scope of the source. The finding's wording must stay no broader than what the source document actually says. Common overreach patterns to avoid:
   - Source says "common areas", finding says "in the unit interior". If the source describes a common-area condition (lobby, exterior, mechanical room, etc.) and there is no in-unit evidence, the finding is HOA-scope, not unit-scope. cost_responsibility = "hoa" and the narrative says so.
   - Source says "may contain" or "possible presence of", finding says "contains" or "is present". Carry the source's uncertainty into the finding wording verbatim; don't upgrade "may" to "is".
   - Source says "limited inspection" or "could not be fully accessed", finding implies a comprehensive inspection finding. The finding must acknowledge the access limitation.
   - Source describes ONE specific unit, ONE floor, or ONE section of the building, finding implies the entire building. Don't generalize from one observation to the whole property unless the source itself does.
   - Source describes a CONDITION as of an inspection date, finding implies it is currently present or unchanged. If the inspection is old (>12 months), the finding must note that the condition was observed at the time of inspection and may have been remediated.
   These overreach patterns are validated post-hoc by a quote-match check that fuzzy-matches each Critical finding's source_quote against the concatenated source text. Critical findings whose quote cannot be verified are automatically demoted to High severity with a "needs review" flag. Save yourself the demotion: keep the finding wording aligned with the source wording, and pick a source_quote that genuinely supports the finding's exact claims.

5. COST ESTIMATES should reflect California regional pricing. Default to Bay Area / Silicon Valley when location is unclear (most expensive labor market in the state, so a safer over-estimate). ALWAYS populate property_facts.cost_reference_market with the regional reference you assumed for your numbers, e.g., "California Bay Area / Silicon Valley", "California Greater Los Angeles", "California Sacramento Valley". Agents need to see which market drove the cost estimates so they can sanity-check them against local labor.

   SCOPE THE COST ESTIMATE TO THE BUYER'S UNIT. The buyer is purchasing ONE specific address, not an interest in the building, the HOA, or the neighborhood. Cost estimates must reflect what THAT BUYER will pay (or in the case of HOA-paid items, what the buyer is exposed to). For condos, townhomes, and PUDs:
   - In-unit repairs (interior plumbing, interior electrical past the meter, in-unit HVAC, in-unit appliances, in-unit fixtures, balcony exclusive-use where the CC&Rs assign maintenance to the owner): cost_responsibility = "owner". Full cost goes in cost_estimate; counts toward the buyer's repair exposure.
   - Common-area / building-envelope repairs paid from HOA reserves or assessments (full-building roof replacement, exterior building paint, common-area plumbing risers, common boiler, elevator, lobby, common parking lot, exterior of building, structural / load-bearing common elements, common-area landscaping): cost_responsibility = "hoa". cost_estimate may show the FULL project cost (so the buyer understands the scope), but DO NOT include this dollar amount when computing the buyer's repair exposure narrative, the buyer doesn't write that check. The buyer's exposure to HOA-paid work is via reserve health, dues increases, and special-assessment risk, which belongs in the HOA section, NOT in the per-unit cost summary.
   - When CC&Rs are ambiguous about responsibility, use cost_responsibility = "shared" and explain in the description.

6. OBVIOUS-FACT FILTER. Do NOT surface a finding whose content the buyer already knew from the listing or a 30-second walkthrough. Findings must reveal something the buyer would NOT have learned from the MLS sheet or a tour. Skip:
   - Unit configuration descriptions ("1 bedroom 1 bath condominium", "2-story SFR", "single-family residence on a corner lot"), these are the listing
   - Bare property facts ("home has a kitchen", "property is in California", "the unit has a balcony"), the buyer can see the home
   - Generic disclaimer recitations ("this property is sold as-is per the contract", "buyer to verify all dimensions"), boilerplate
   - HOA boilerplate that doesn't materially change anything ("HOA has CC&Rs", "common area exists")
   A finding earns a slot in the report ONLY when it surfaces a defect, a material risk, a financial concern, a regulatory issue, a non-obvious restriction, or an inconsistency between documents. Be ruthless: if the title would make the reader say "yeah, I knew that," cut it.

7. PROPERTY-TYPE APPLICABILITY FILTER. Before surfacing any finding, check whether the underlying obligation or risk actually applies to THIS property type. Many California disclosure forms (TDS especially) ask questions that apply to single-family residences but NOT to condominiums or townhomes where the HOA owns the relevant element. Examples of findings that should be DROPPED for condo / townhome / PUD buyers because the responsibility lives with the HOA, not the unit owner:
   - Street tree maintenance / city street-tree compliance (HOA / city maintains; not the owner's obligation)
   - Sidewalk repair obligations (city or HOA)
   - Exterior building siding, roof, gutters, exterior paint (HOA-maintained common area)
   - Yard / landscape upkeep where common-area (HOA)
   - Property line / fence disputes when the fence is on common-area (HOA)
   - Roof drainage, roof warranties (when on common roof)
   - Earthquake retrofit of the building shell (HOA-paid; covered by the HOA-paid findings rule above)
   For SFR buyers, those items DO apply and SHOULD be surfaced when relevant. The decision pivot is property_facts.property_type: when it's condo/condominium/townhome/townhouse/PUD/co-op, drop findings whose subject is plainly common-area or city-curb obligations. When the boundary is ambiguous (balcony exclusive-use, in-unit assigned parking, in-unit window glass with HOA frame), surface the finding with cost_responsibility="shared" or "owner" and explain in the description what the CC&Rs say.

7.5. UNIT-FEATURE APPLICABILITY FILTER. The reader is buying ONE SPECIFIC UNIT. A finding about a physical feature the buyer's unit doesn't have is noise, DROP it entirely. Concrete examples from real reports we've seen go wrong:
   - A "balcony deferred maintenance" finding surfaced as Critical on a GROUND-FLOOR unit. Ground-floor units typically have no balcony. The finding doesn't apply.
   - A "roof structural concern" finding surfaced for every unit in a multi-story building. Only the TOP-FLOOR unit owners see roof-attached issues; mid-floor units have other units' floors as their "roof."
   - A "garage stall water intrusion" finding surfaced for a unit whose CC&Rs assign no garage stall, only street parking.
   To enable filtering, ALWAYS populate property_facts.unit_features with the lowercase tokens describing this specific unit's physical features when the documents make them clear: balcony, patio, private_yard, garage_stall_assigned, in_unit_laundry, top_floor, ground_floor, fireplace, in_unit_hvac. Add other tokens as needed. CRITICAL DISCIPLINE: only list a feature if you're confident this unit ACTUALLY has it. The downstream filter drops findings whose subject is a feature missing from unit_features, so "balcony" being absent means balcony findings get cut. When in doubt, OMIT, better to surface a marginal finding than to falsely claim a feature exists. Also populate property_facts.unit_number and property_facts.floor when available; they help the agent + buyer mentally place the unit in the building.

8.0. BUILDING-COMMON-AREA HAZARDS, NOT CRITICAL FOR THIS UNIT. Hazards that exist in COMMON AREAS of the building (common staircases, common hallways, common-area exterior walls, common-area waterproofing, courtyard, breezeway, pool deck, building envelope) are HOA concerns. They are NOT Critical findings against THIS unit unless the language explicitly states the hazard has entered THIS unit's interior. Concrete real-world examples from past reports where we got this wrong:

   - "Water intrusion at multiple staircase landings, ongoing structural concerns" → HOA concern, NOT a buyer-unit Critical. The landings are common area. The buyer's unit isn't impacted unless their interior is flooding.
   - "Stair landing waterproofing failure at multiple landings, water intrusion confirmed" → same. Building-wide, HOA-paid, doesn't enter the buyer's interior.
   - "Common-balcony deterioration" on a ground-floor unit → not even applicable (the buyer has no balcony).
   - "Architectural violations against other units" → not applicable to the buyer at all.

   The bar for Critical on a building-common-area hazard is: language EXPLICITLY says the hazard has entered THIS unit's interior, OR the hazard physically prevents close (e.g., common-area structural failure of the building shell that triggers insurance non-renewal for every owner). If neither holds, surface as an HOA concern in the HOA section with cost_responsibility="hoa", NOT as a unit-level Critical/High finding. The buyer's exposure is via dues + special-assessment risk; that's the HOA section's job, not the headline findings list.

   Common-area-scoping signal phrases the downstream synthesizer looks for: "common", "staircase", "stair landing", "stairwell", "hallway", "exterior", "courtyard", "breezeway", "building-wide", "multiple units", "across the complex", "neighbor's balcony". When you write a finding using these phrases, expect the synthesizer to redirect it to the HOA section unless you also explicitly cite the buyer's unit being directly impacted.

8. HOA SCOPING, PRIORITY ORDER FOR ANY FINDING SOURCED FROM HOA DOCUMENTS. Apply this checklist top-down and DROP if none of the conditions hold:
   (a) Does this finding affect the BUYER'S PHYSICAL UNIT, its interior, an exclusive-use area assigned to it per the CC&Rs, or a feature this unit actually has? → surface, severity based on impact.
   (b) Does this finding affect the RESERVES the buyer will pay into through dues? Reserve shortfall, planned underfunded capital project, etc. → surface as an HOA finding with cost_responsibility="hoa". Severity reflects financial exposure to the buyer (a $500K building roof at 60% reserve funding is High, not Critical, because the buyer's share is a possible dues increase or special assessment, not a $500K check).
   (c) Does this finding create SPECIAL-ASSESSMENT RISK that would hit the buyer's pocket directly (already-levied assessment, imminently-planned assessment, lawsuit reserve risk)? → surface with cost_responsibility="owner" or "shared", showing the buyer's pro-rata share.
   (d) Does this finding restrict the buyer's USE of THIS unit (rental cap that affects them, pet policy, architectural review for changes they plan)? → surface with low cost.
   None of the above? → DROP.
   Explicit examples of findings that should be dropped under this rule:
   - Architectural violations or fines against OTHER units: DROP (unless the dollar amount in reserves is large enough to threaten the reserve fund itself, and then re-frame the finding as a reserves-health concern, not "Issue 7: Violations Against Unit 4C")
   - Building-wide capital projects when this unit's pro-rata share is modest and reserves cover it: surface in the HOA section narrative, NOT as a Critical/High finding
   - Maintenance items in OTHER units' exclusive-use areas (a neighbor's balcony, a different floor's HVAC): DROP
   - Generic CC&R restrictions that exist in every CA HOA (no commercial vehicles in driveways, quiet hours, pet weight limits): DROP unless materially unusual
   - Board turnover / governance gossip that doesn't translate to financial or use-of-unit risk: DROP
   If the finding describes someone else's problem, it doesn't belong in this report.

8.5. LIEN AND ENCUMBRANCE DISCIPLINE. A routine first-position deed of trust on the seller's name, recorded before the listing, with a loan balance BELOW the list price, is what every financed seller has. Escrow pays it off at closing from sale proceeds. The buyer does NOT inherit it. Surfacing it as a critical or moderate finding misleads the reader into thinking the buyer is taking on the loan. DO NOT generate a finding for this case.

   Capture the loan amount, lender, recording date, and recording number under title_vesting.liens_summary so the buyer's agent can see the data, and reference it in property_snapshot when relevant (named_lender, deed_of_trust_amount, deed_of_trust_recorded). That is the right channel. DO NOT mirror it into critical_findings, moderate_findings, cosmetic_findings, or cross_document_findings.

   ONLY surface a deed-of-trust or lien as a finding when one of these holds:
   (a) UNDERWATER. The aggregate balance of recorded loans on this seller exceeds the list price. Probable short-sale or pre-foreclosure. Surface as Critical with a short-sale negotiation note.
   (b) STACKED FINANCING WITH HIGH CUMULATIVE LTV. Two or more deeds of trust (first + HELOC, first + second, hard-money second) combine to > 80% of list price. Surface as moderate. If > 100%, see (a).
   (c) NOT-IN-SELLER NAME. A recorded interest sits with a party who is NOT a named seller on the TDS / SPQ. Examples: prior owner whose deed never transferred, a deceased grantor with no probate, an ex-spouse from an unrecorded divorce settlement, a family trust the seller can't show authority over. Title-clearance concern, surface as Critical.
   (d) NON-CONSENSUAL LIEN. Federal or state tax lien, abstract of judgment, mechanic's lien, child-support lien, HOA lien, judgment lien. These are not normal financing and may require negotiation before close. Severity by amount and clearability.
   (e) UCC-1 ON A SYSTEM THAT SURVIVES SALE. A solar lease UCC-1 that the buyer will be asked to assume (rather than the seller paying off). Surface as moderate with the lease terms and payoff figure.
   (f) RECORDED-DURING-LISTING. A new deed of trust recorded AFTER the listing date suggests cash-out refinancing mid-sale and warrants a quick check on closing-funds availability. Surface as moderate.
   (g) ATYPICAL RECORDING ON COMMERCIAL OR PRIVATE LENDER. Hard-money lender, non-bank lender, private trustee with no website. Worth a paragraph explaining the verification step, not a Critical.

   When surfacing under (a) through (g), frame the finding as a TITLE-CLEARANCE timeline concern ("the buyer's closing date is contingent on this clearing"), not a debt-burden concern. The buyer is NOT assuming the loan.

   Concrete examples to internalize:
   - List price $1,050,000, single first deed of trust to LoanDepot for $455,200 in the sellers' name recorded 2/2/2021: NOT a finding. Capture in title_vesting.liens_summary. The sellers have ~$595K equity, escrow handles the payoff.
   - List price $850,000, first deed of trust $620,000, HELOC $180,000, combined $800,000 (94% LTV): moderate finding, stacked financing approaching list price, scrutinize the payoff statements.
   - List price $750,000, single deed of trust $800,000: Critical, underwater, short-sale workflow.
   - Title shows a 2015 deed of trust naming "John Smith, an unmarried man" but the current TDS is signed by "John Smith and Mary Smith, husband and wife": Critical, marital-property clearance question.
   - $12,400 IRS federal tax lien recorded against the seller in 2023: moderate or higher depending on whether the seller has shown a release, escrow will require clearing before recording the grant deed.

8.6. TITLE EXCEPTION TRIAGE (mandatory). The Schedule B of every California preliminary title report contains 10 to 30 recorded exceptions. The VAST MAJORITY do NOT bite the buyer's title. They are recorded against the master parcel, the subdivision tract, or every owner in a master-planned community as a class. Title insurance carves them out as standard exceptions and the buyer's grant deed at close is not subject to them. DO NOT surface these as findings.

   DROP these recorded-matter categories outright (capture them in title_vesting.recorded_matters only, never in findings):
   (a) MASTER-DEVELOPER INSTRUMENTS recorded against the master parcel BEFORE individual unit subdivision. Signal phrases: "developer", "density bonus", "regulatory agreement", "standard development requirements", "declaration of development covenants", and any document recorded BEFORE the CC&Rs for the project. These bind the developer's blanket interest, NOT the resale of individual market-rate units. A master-developer right of first refusal or option is a complex-wide instrument that gets carved out of every unit conveyance; it has no bite on a market-rate resale.
   (b) BLANKET ROFR / OPTION held by a developer LLC, master association, or municipality where the recording predates the individual units' first sale. Real-world example: "Right of first refusal in favor of 1090 East Duane Avenue LLC recorded June 1, 2020" on an OV8tion unit. The 2020 recording is the master parcel; the unit has been bought and sold since then without the LLC exercising. NOT a finding.
   (c) BLANKET EASEMENTS for non-exclusive ingress, egress, utilities, drainage, common-area access, or roof / wall maintenance, when these are recorded against every unit in the project as a class. The buyer's unit inherits them along with the right to use them.
   (d) OLD MINERAL / OIL / GAS / WATER RIGHTS reserved in deeds from prior centuries (e.g., "mineral rights reserved by Southern Pacific Railroad per deed recorded 1908"). These are real but they don't affect residential use. NOT a finding.
   (e) HOA ASSESSMENT LIEN RIGHTS, the HOA's recorded ability to lien for unpaid dues. Every HOA has this; it's not a finding, it's the structure of the HOA.
   (f) STANDARD CC&R RECORDINGS. The CC&Rs themselves being recorded is not a finding; specific provisions (rental cap, pet limit, architectural review) become findings only when materially unusual or affecting the buyer's stated plans.
   (g) NORMAL UTILITY EASEMENTS (PG&E, San Jose Water Company, AT&T) running across the property. Buyer is paying for utilities and getting them.

   The bar for ELEVATING a recorded matter from "recorded_matters narrative" to "finding" is one of:
   - The encumbrance affects the BUYER'S SPECIFIC UNIT in a way that is NOT shared by the rest of the complex (e.g., a private access easement only across this APN that another owner uses).
   - There is ACTIVE EXERCISE OR ACTIVE LITIGATION on the encumbrance currently (e.g., the ROFR holder has signaled intent to exercise, or there is recorded notice of default).
   - The encumbrance has a CONCRETE TRIGGER tied to this sale (e.g., a recorded BMR / Below Market Rate covenant requiring resale to qualified buyers, where the buyer may or may not qualify).
   - The encumbrance has a NEAR-TERM EXPIRATION or RENEWAL deadline that the parties need to act on.
   - The encumbrance is NON-CONSENSUAL (judgment, IRS lien, mechanic's lien, abstract of judgment).
   - The TITLE INSURER HAS NOTED AN EXCEPTION SPECIFIC TO THIS PROPERTY in Schedule B as something they will NOT insure over (e.g., a specific exception language that excludes coverage for a known boundary dispute on this APN).

   When in doubt, capture the encumbrance in title_vesting.recorded_matters with a one-line note and leave it OUT of findings. The buyer's agent reads recorded_matters; the buyer reads findings. The two channels serve different audiences.

   Concrete examples from real reports:
   - Density-bonus developer's blanket ROFR on a master-planned condo project (1090 East Duane Avenue LLC at OV8tion): recorded_matters, NOT a finding. The unit has changed hands since recording without exercise; title insurance handles it as a standard exception.
   - Master Dispute Resolution Declaration recorded against every unit in the project: recorded_matters, NOT a finding.
   - Standard PG&E easement running across the back 10 feet of every lot in the subdivision: recorded_matters, NOT a finding.
   - A recorded BMR covenant requiring resale to households at or below 120% AMI: FINDING (Critical), the buyer may not qualify and the covenant gates the sale.
   - A recorded mechanic's lien for $34,800 filed by a roofing contractor against this specific APN, not yet released: FINDING (Critical), escrow has to clear it.
   - An abstract of judgment recorded against the seller for $80,000 in a 2023 collections action: FINDING (Critical), escrow has to clear it before grant deed recording.

9. PROPERTY SNAPSHOT FIELDS, populate property_facts richly when this document group is the source of the information. Pull from the most likely document:
   - apn (Assessor's Parcel Number): typically in the prelim title report, escrow instructions, or county tax bill (usually formatted like "123-45-678" in California).
   - mls_number: from any MLS printout, listing sheet, or BAREIS/CRMLS export.
   - list_date (ISO YYYY-MM-DD): the original listing date from the MLS printout.
   - list_status: from the MLS printout. One of "active", "pending", "sold", "withdrawn", "unknown".
   - zestimate: only if explicitly shown in the listing materials (don't invent).
   - parking: from the MLS printout or seller disclosures, describe naturally (e.g., "2-car attached garage", "1-car carport plus driveway", "street parking only").
   - hoa_dues_monthly: from HOA financial docs or the listing, the CURRENT monthly dues.
   - hoa_last_increase_date / hoa_last_increase_amount: from HOA budgets or meeting minutes, when did the dues last go up and by how much.
   Leave any of these null when the documents in your group don't contain the information.

9.5. RATING EDITORIAL, REQUIRED. The overall rating section of the PDF renders two paragraphs alongside the rating pill: "Why this rating" and "Conditions on which this rating depends." These are NOT optional. ALWAYS populate overall_rating_why and overall_rating_conditions in your tool output:
   - overall_rating_why: 2-4 sentence explanation grounded in the findings. What's the upside (clean title, healthy reserves, no always-Critical rules fired)? What kept it from being a higher tier (the trio of unknowns the buyer needs to investigate, an aging system, a building project)?
   - overall_rating_conditions: short paragraph listing the conditions that must hold for the rating to remain valid. Concrete examples: "No new evidence of widespread ABS pipe failure across the complex. No aluminum branch wiring confirmed in the unit. Carport project funded from reserves through completion. Section I termite clearance completed by seller."
   These two fields synthesize information you already extracted into findings, they don't require external data. There is no excuse to leave them null.

9.6. MARKET CONTEXT, populate what you can. The market_context section is a strong differentiator but can only be filled from the source documents. Populate the fields that are reachable:
   - summary: required when ANY market data is available. 2-3 sentences placing the unit in its sub-segment (1-bedroom condos in a specific complex, 2-bed townhomes in a particular school district, etc.).
   - median_price, median_dom: populate when the MLS printout, the prelim title page, or any listing comparable lookup are in the source documents. Leave null otherwise.
   - mortgage_rate_range, monthly_carrying_cost: you DO NOT have live web access during analysis. Populate these only when the documents themselves reference rate data (rare). Otherwise leave null.
   - comparable_units: populate when the MLS printout includes comparable sales, or when the source documents reference other unit sale prices in the same complex (HOA collections sometimes show recent sale amounts at other APNs in the building). Three to five entries max.
   Better to leave market_context null than to invent numbers. If the documents support only a one-paragraph summary, populate just the summary and leave everything else null, the PDF renders gracefully.

10. RICH FINDING NARRATIVE, populate the per-finding narrative fields so the PDF can render the card layout that actually communicates with the buyer:
   - source_quote: VERBATIM 1-3 sentence quote from the source document supporting the finding. Use ellipsis (…) to elide unimportant middle text but never paraphrase. The quote is what makes the finding auditable against the underlying disclosure. Example: '"Branch Wire Material: Copper, Aluminum ... Subpanels: PAINTED/CAULKED - The panel is painted/caulked and unable to be fully viewed."'
   - what_it_is: Plain-language 2-4 sentence paragraph describing the THING in lay terms. Example: 'The home inspector recorded the panel's branch material as both copper and aluminum, and was unable to fully view the bedroom subpanel because it is painted and caulked over. Aluminum branch wiring is unusual for a 1988 build (the high-risk window is roughly 1965-1973), but recording it as a possibility means the buyer should not assume copper-only.'
   - why_it_matters: 2-4 sentence paragraph on why the BUYER should care, safety, insurance/lender impact, financial exposure. Example: 'Aluminum branch wiring at 120V outlets and switches is associated with elevated risk of loose connections, overheating, and fire when not properly terminated. Insurance carriers may decline or surcharge a unit with unremediated aluminum branch wiring.'
   - next_step: Concrete next action. Example: 'Have a licensed electrician open a representative number of outlets and switches to confirm whether aluminum is in branch circuits (concerning) or only in the service feeder (typical and benign). If branch is aluminum, get a written quote for COPALUM crimp or AlumiConn pigtail remediation.'
   - immediate_out_of_pocket: cost to INVESTIGATE during the contingency window, separate from cost_estimate, which is the remediation cost if confirmed. Example: an electrician's evaluation runs $300-$600; the remediation if confirmed runs $500-$4,500 per circuit. Populate immediate_out_of_pocket = {low: 300, high: 600} and cost_estimate = {low: 500, high: 4500}.

   These narrative fields turn a one-line finding ("Issue 1: Aluminum branch wiring may be present") into something the buyer can act on. ALWAYS populate them for critical/high findings; for moderate/cosmetic findings the existing description + risk_if_ignored + recommended_action are enough.

10.5. CROSS-DOCUMENT CONSISTENCY (mandatory check, populate cross_document_findings).
   Before finishing, scan the documents in YOUR PASS'S GROUP for inconsistencies BETWEEN documents. This is the single highest-value contribution a focused pass can make beyond the findings list, the disagreements between sources are often more actionable than any single source's findings.

   What to look for:
   - A document references an attachment ("see attached AVID," "per the underlying termite inspection") and the referenced document is not in the package.
   - Two documents disagree on a factual field (county, APN, year built, square footage, floor, unit number, list price, MLS number, date).
   - A Yes/No checkbox on one document contradicts a narrative or inspection finding in another (TDS Section II checks "no known plumbing defects" but SPQ Section 10A discloses 2023 water intrusion; SPQ Section 8 affirms "no known structural defects" but the home inspection notes a 1/2-inch foundation crack).
   - A financial document and a meeting minute disagree (HOA balance sheet shows X assets; minutes record an approved $Y special assessment funded from those assets where Y > X).
   - A listing field disagrees with the property's authoritative records (MLS public remarks say "third floor" but the listing's MLS data field says "second floor").

   Each cross_document_findings entry must:
   - Name the documents in tension via source_docs (minimum 2 entries; include dates / report numbers to disambiguate).
   - Describe what each document says and quote verbatim where short. The buyer should be able to read the description and understand the disagreement without opening the source PDFs.
   - Carry a severity ("critical" = could affect closing readiness or the buyer's decision; "moderate" = should be corrected before contract; "informational" = scrivener-level).
   - Recommend a concrete remediation when one exists.

   ONLY include cross-doc findings that are visible from documents YOUR PASS was given. Do NOT speculate about disagreements with documents in other groups (a downstream pass that sees everything will catch those). Leave cross_document_findings empty when the only documents you have are a single inspection report or a single disclosure form with nothing to cross-check.

   This section was added because the Cowork skill's Section 3 (Cross-Document Consistency Findings) is its most differentiated content; ours was producing none, which is the single biggest accuracy gap on the same packages.

11. CALL THE submit_focused_analysis TOOL EXACTLY ONCE with your structured analysis. Do not produce any other text output.`;

const FOCUSED_GROUP_INSTRUCTIONS: Record<PassGroup, string> = {
  seller_disclosures: `You are analyzing the SELLER DISCLOSURES group: typically the TDS (Transfer Disclosure Statement), SPQ (Seller Property Questionnaire), AVID (Agent Visual Inspection Disclosure), and any combined disclosure exports.

MANDATORY EXTRACTION for this group (populate property_facts AND embed in findings where relevant):
- named_sellers: pull seller names from the TDS / SPQ signature blocks verbatim
- named_listing_team: pull listing agent / team + brokerage + DRE numbers from the AVID signature page or disclosure cover
- disclosure_prep_service: pull the prep service stamped on the cover (Disclosures.io is most common in CA; NWMLS, eDisclosures, etc.)
- package_date: pull the package-level cover date (NOT individual form signing dates)
- adu_status: when the TDS Section II.C or SPQ Section 8.E mention an ADU, capture existence + permit status verbatim from the form
- solar_status: when the SPQ Solar form is present, capture vendor + ownership / lease + monthly payment + lease end year + UCC-1 status (cross-check against prelim title exceptions for the UCC-1 filing)
- For every TDS Section II / SPQ Section 10 "Yes" answer: include the section number AND the seller's verbatim explanation in your finding's description
- For every disclosed alteration, addition, or repair: capture the year, scope, and (when stated) whether it was permitted

Focus on:
- Defects, repairs, leaks, or issues the seller affirmatively disclosed
- Items the seller marked "Yes" or "Unknown" or refused to answer on the questionnaire, but only when the question applies to THIS property type
- Permit issues, room additions, conversions disclosed by the seller
- Neighborhood/nuisance disclosures (flooding, drainage, prior fires, neighbor disputes)
- Items the agent flagged in the AVID visual inspection
- The property snapshot facts (address, year built, sq ft, etc.) usually appear here, populate property_facts

CRITICAL, TDS questions are generic and many DO NOT APPLY to condos / townhomes / PUDs. Identify the property type FIRST (from the form, the listing, or the AVID) and then ignore TDS questions that ask about obligations the HOA owns:
- Street tree compliance / city street tree obligations: DROP for condos / townhomes. The HOA or city handles street trees; the unit owner has no obligation. Marking the seller "unaware of street tree compliance" is not a buyer concern when there are no street trees to maintain.
- Sidewalk repair obligations: DROP for condos / townhomes.
- Roof, gutters, exterior siding, exterior paint, exterior of building: DROP for condos / townhomes (HOA-maintained). If the seller disclosed something about THE UNIT (in-unit ceiling leak from roof above), that's still relevant, but as an in-unit issue, not a roof-repair finding.
- Property line, fence, retaining wall: DROP for condos when the boundary is HOA common area.
- Septic, well, propane tank: DROP for condos.
- Yard, landscaping: DROP unless it's exclusive-use yard assigned to this unit per the CC&Rs.

For SFR buyers, those items DO apply and SHOULD be surfaced when the seller disclosed anything noteworthy. The litmus test: would a reasonable buyer of THIS specific property actually be responsible for the underlying obligation post-close? If no → drop the finding (it's noise).

If a key disclosure section is blank or evasive AND the section applies to this property type, surface it in completeness_issues and add an outstanding_question for the agent to follow up on. Don't flag blank sections for inapplicable questions, a condo's TDS legitimately doesn't fill in the "septic system" subsection.`,

  inspections: `You are analyzing the INSPECTION REPORTS group: home/property inspections, termite/pest reports, mold inspections, sewer-lateral inspections, roof inspections.

MANDATORY EXTRACTION for this group (every inspection report carries these; pull them or the finding looks unsourced):
- Inspector NAME (e.g., "Steven Venn", "Marvin Morazan") on EVERY finding sourced from that inspector's report
- Inspector LICENSE NUMBER from the report cover (e.g., "License 1091319" for roof inspectors; CSLB number for general contractors)
- Inspector REPORT NUMBER (e.g., "TAPS Termite Report #57662", "Marvin Morazan Roofing #RI0513202601", "Elite Home Inspection #..."), and the report date in ISO format
- Specific PAGE and SECTION reference for each finding (e.g., "p.8 HVAC Action Items", "5.1.3 SOFT SPOTS", "Section 10.5.1")
- Inspector-quoted COST when stated in the report (e.g., "we cannot warranty repairs to the shingle parts of the roof" or "Items 5-8 reference an attached re-roof proposal whose dollar figures were not fully captured in the OCR")
- For termite findings: distinguish Section I (active) vs. Section II (conducive); cite the Pest Control Board's category rule

For each finding's recommended_action: include the SPECIFIC TRADE the buyer should engage (e.g., "licensed Peninsula roofing contractor", "California-licensed mold inspector", "Section I clearance from a Structural Pest Control Board-licensed firm") and a budget for the investigation phase separate from remediation.

Focus on:
- Every Critical and High finding the inspector called out
- Cost estimates the inspector provided (or that you can derive from regional pricing)
- Wood-destroying organism findings (active termite, conducive conditions)
- Active leaks, structural concerns, electrical/plumbing/HVAC issues
- Insurance/lender flags: FPE panels, knob-and-tube, polybutylene, ungrounded outlets
- Permit compliance issues observed during inspection

Be aggressive about marking insurance/lender-relevant items in insurance_lender_notes.`,

  hoa: `You are analyzing the HOA PACKAGE group: CC&Rs, Bylaws, Reserve Studies, Budgets, Financial Statements, Meeting Minutes, special-assessment notices.

MANDATORY EXTRACTION for this group (these are sitting in the HOA package; pull them verbatim):
- ASSOCIATION NAME from the CC&Rs cover or Bylaws (e.g., "La Acera Oak Association")
- BUILDING / PROJECT ADDRESS range when multi-building (e.g., "1530-1546 San Antonio Street, approx. 5-9 units")
- MANAGEMENT TYPE: self-managed (elected unit owners) vs. professional (name the management company)
- EXACT RESERVE BALANCE from the most recent balance sheet, with the asset breakdown (checking, savings, facility improvements separated) and the date stamp (e.g., "$40,891.19 as of Feb 28, 2026, split $15,151 BofA checking + $22,309 CapOne savings + $3,431 facility improvements")
- RESERVE STUDY CADENCE and date of last study; cite CA Civil Code Section 5550 when the study is missing or stale
- MASTER INSURANCE: carrier, policy number, $ limits (per-occurrence + aggregate), renewal date
- APPROVED CAPITAL PROJECTS from the meeting minutes: dollar amount + contractor name + approval date + funding mechanism (special assessment vs. reserves)
- SPECIAL ASSESSMENT HISTORY: every assessment in the last 24 months with the exact $ amount, what it funded, and how it was collected
- LITIGATION status, cite the management's written statement when present (or note its absence)
- MEETING MINUTE DATES for each minute referenced; quote the relevant agenda item verbatim when material
- RECENT DUES INCREASE: amount + effective date + what the increase was allocated to

Set hoa_facts.applicable=true and provide a summary.

Focus on:
- HOA financial health: reserve funding percentage, recent special assessments, pending special assessments
- Pending litigation against the HOA
- Rules that materially affect the buyer (rental restrictions, pet limits, architectural review)
- Recent dues increases or upcoming planned increases
- Major maintenance projects scheduled or deferred
- Insurance coverage gaps (e.g., earthquake not covered)

Treat CC&Rs/Bylaws boilerplate as low-priority, only flag genuinely consequential restrictions. Findings should be about the HOA's financial/operational health and rules that affect occupancy.

HOA FINANCIAL FACT TABLE, populate hoa_facts.facts (array of {label, value} pairs) with the compact KV data the PDF's HOA section renders as a table. Pull from the HOA package's financial statements, board minutes, insurance summary, and Section 4525 disclosure. Canonical labels to use when the data exists (don't invent values you can't source):
- "Master policy" → carrier name + phone if available
- "Master policy premium" → annual premium + renewal date
- "Operating account (recent)" → recent balance range from monthly statements
- "Reserves (recent)" → recent balance range from monthly statements
- "Dues" → current monthly dues + recent increase context
- "Special assessment now" → status from the Section 4525 disclosure ("None disclosed on the 4525 menu", "$3,200 levied 11/2025", etc.)
- "Capital projects approved" → board-approved projects with $ amounts + contractor names if mentioned
- "Litigation against the Association" → status as documented
- "Collections" → non-judicial foreclosures or delinquencies disclosed at the building level (NEVER name individual units, the user's privacy notes forbid this; describe as "two non-judicial foreclosures approved against other delinquent owners at unrelated APNs")
- "Rental restriction" → yes/no + brief reference to where the rule lives in the governing docs
- "Age restriction" → 55+ community status
- "Reserve study cadence" → required cadence from CC&Rs + most recent study date
Add additional labels as the package supports them. Leave the array null if no HOA package was provided.

EDITORIAL HOA PARAGRAPHS, populate two more fields on hoa_facts:
- reserve_health_read: 2-3 sentence "our read" of reserve adequacy in plain language. Example: "The Association is carrying roughly $4 million in reserves against a 332-unit complex, which is a comfortable cash-flow basis for a 38-year-old wood-sided community. The $10/month dues increase is modest and is allocated explicitly to reserves and insurance."
- watch_items: 1-2 sentence flag for items the buyer should monitor through close. Example: "The 9/16/25 minutes confirm that the original Giuliani Construction carport contract was abandoned after a $100K+ price jump and the project was reassigned to ReCon360. Mid-project contractor switches warrant attention because of schedule risk."

CRITICAL, COST RESPONSIBILITY FOR HOA FINDINGS:
Almost every cost-bearing finding sourced from HOA documents is HOA-paid, not owner-paid:
- Deferred building roof replacement → cost_responsibility = "hoa"
- Common-area plumbing or elevator capital project → cost_responsibility = "hoa"
- Exterior building paint cycle → cost_responsibility = "hoa"
- Reserve shortfall or planned special assessment → cost_responsibility = "hoa" on the project finding; the buyer's exposure (a future dues increase or pro-rata special assessment) belongs in hoa_facts.concerns
DO NOT mark a finding Critical because the HOA project costs $500K. The dollar figure shows the scope, but cost_responsibility="hoa" means it never lands on the buyer's repair-cost line. Severity for the BUYER reflects probability of a special assessment hitting them, the size of likely dues increases, and whether reserves are healthy enough to absorb the project, those are typically Moderate or High concerns, not Critical, unless reserves are dangerously underfunded relative to the imminent project (active hazard equivalent).

Items that ARE owner-paid even when sourced from HOA docs: balcony exclusive-use maintenance assigned to the unit owner per CC&Rs, in-unit fixtures the HOA explicitly disclaims, the buyer's pro-rata share of a special assessment ALREADY LEVIED. Tag those cost_responsibility = "owner" (or "shared" with explanation).`,

  hazards: `You are analyzing the NATURAL HAZARDS group: NHD reports, environmental disclosures, supplemental hazard documents.

MANDATORY EXTRACTION for this group:
- NHD REPORT NUMBER + provider name (e.g., "JCP Report #3583333" or "First American Report #3571219") and the report date
- For FEMA flood: zone designation (Zone A, AE, V, VE, X, etc.) + FEMA PANEL NUMBER + panel effective date. Example: "Zone AE per FEMA panel 06081C 0309F effective 4/5/2019". Cross-reference any standalone Standard Flood Hazard Determination Form (SFHDF) when present.
- For Alquist-Priolo earthquake fault: cite CA Public Resources Code Section 2622 and confirm IN / NOT IN with the determining language quoted
- For Seismic Hazard Zone (liquefaction / landslide): cite CA Public Resources Code Section 2696; capture both STATE and COUNTY / CITY-level findings when the report layers them (Cowork-style: "State Liquefaction - IN; County Liquefaction - moderate; City Liquefaction - Medium; City Ground Shaking - Severe")
- For FHSZ (Fire Hazard Severity Zone): name the determining authority (CAL FIRE for state, local LRA for local), and capture the local fire department contact if a special-services notice is included
- For Mello-Roos: cite CA Government Code Section 53341.5 and either name the CFD or confirm NOT SUBJECT
- For 1915 Improvement Bond Act: confirm SUBJECT / NOT SUBJECT explicitly
- For dam failure inundation: cite Government Code Section 8589.5
- For methane / transmission pipeline / wildland-area zones: report each verbatim (the JCP / First American reports enumerate them; copy the structure)

Use the structured hazard fields:
- Populate property_facts.fema_flood_zone with the zone + panel format above
- Populate property_facts.hazard_zone_summary as a one-line IN / NOT IN summary across all zones
- Populate environmental_hazards with one entry per zone (name, severity, notes); insurance/lender-blocking zones (FEMA AE/VE, FHSZ Very High) get severity critical or high

For recommended_action on flood findings: name the federal statute requiring flood insurance (Flood Disaster Protection Act of 1973), name FEMA Risk Rating 2.0 as the current methodology, and tell the buyer to get a SPECIFIC ADDRESS quote (Risk Rating 2.0 results vary by elevation; an Elevation Certificate may produce a substantially lower premium when finished floor is above BFE). Cite community CRS class when extractable from the report (e.g., "EPA participates in NFIP as Class 7, providing 15% discount on NFIP premiums").

Focus on:
- Zone determinations: flood, earthquake fault, seismic, fire hazard, methane, dam inundation, airport noise
- Insurance implications of each zone (often the most important takeaway)
- Lender implications (some zones trigger required insurance)
- Populate environmental_hazards with one entry per significant zone

Insurance/lender-blocking zones (high fire-hazard severity zone, FEMA flood AE) should be marked critical or high in environmental_hazards severity.`,
};

async function analyzeFocusedPass(
  documents: Document[],
  group: PassGroup,
  mode: "pdf" | "text",
  propertyAddressHint?: string | null,
  updateContext?: UpdateContext | null,
  // MLS-printout text extracted at finalize time. Only injected on
  // the seller_disclosures group (where property_facts come from);
  // ignored on other groups so we don't waste tokens. Null when the
  // agent didn't attach an MLS PDF.
  listingText?: string | null,
  // Live cost-reference block (web-search-fetched at run start),
  // replaces the hardcoded California reference when present. Falls
  // back to the hardcoded table when null. Identical shape to
  // formatMarketReferenceForPrompt output.
  liveMarketBlock?: string | null,
): Promise<{
  analysis: FocusedAnalysis;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const client = getAnthropicClient();
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  // Authoritative listing block, prepended for the seller_disclosures
  // group only. The MLS printout's list price, DOM, MLS#, list date,
  // parking, and zestimate beat whatever Claude might infer from a
  // seller-form signature date or a stale number elsewhere in the
  // package. Other groups (inspections, hoa, hazards) don't need
  // this block, their property_facts inferences are typically wrong
  // anyway (an HOA reserve study shouldn't be naming the list price).
  if (group === "seller_disclosures" && listingText && listingText.trim()) {
    content.push({
      type: "text",
      text:
        `===== AUTHORITATIVE LISTING DATA (agent-provided MLS printout) =====\n` +
        `The following is the agent's attached MLS / listing printout for ` +
        `the subject property. When populating property_facts, USE THIS ` +
        `BLOCK as the source of truth for list_price, days_on_market, ` +
        `mls_number, list_date, list_status, parking, zestimate, and ` +
        `hoa_dues_monthly. If any other document in this package shows a ` +
        `different number for those fields, the MLS printout below wins.\n\n` +
        `${listingText.trim()}\n\n` +
        `===== END AUTHORITATIVE LISTING DATA =====`,
    });
  }

  for (const doc of documents) {
    // Stamp newer-than-original docs so Claude knows the temporal
    // context. We rely on the `addedAt` ISO date carried on each
    // Document for updates; original docs have it null/undefined.
    const isNewer =
      updateContext &&
      doc.addedAt &&
      doc.addedAt > updateContext.originalAnalysisDate;
    const noticeLine = isNewer
      ? ` (Added on ${doc.addedAt}, NEWER than the original analysis on ${updateContext!.originalAnalysisDate})`
      : "";

    if (mode === "pdf" && doc.pdfBase64) {
      // Native PDF attachment, Claude sees the document as a human
      // would: check-boxes, signatures, layout, severity icons. The
      // text header before the attachment carries the filename so
      // citations like "TDS p.4" still resolve.
      content.push({
        type: "text",
        text:
          `===== BEGIN DOCUMENT: ${doc.filename} (${doc.pages} pages)${noticeLine} =====`,
      });
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: doc.pdfBase64,
        },
        // The title metadata helps Claude refer to the document
        // unambiguously even when it has near-identical content to
        // a sibling (TDS vs. SPQ from the same combined export, for
        // example).
        title: doc.filename,
      });
      content.push({
        type: "text",
        text: `===== END DOCUMENT (${doc.filename}) =====`,
      });
    } else {
      // Text-mode (or PDF-mode fallback when base64 is missing for
      // whatever reason, the analyzer can still ground in extracted
      // text, just with reduced layout fidelity).
      const body = doc.text
        ? doc.text
        : `[No text could be extracted from this PDF (likely a scan without OCR). ` +
          `Use other documents in this group when forming findings; cite this file only ` +
          `when its presence in the package is itself informative.]`;
      content.push({
        type: "text",
        text:
          `===== BEGIN DOCUMENT =====\n` +
          `Filename: ${doc.filename}\n` +
          `Pages: ${doc.pages}\n` +
          (noticeLine ? `${noticeLine.trimStart()}\n` : "") +
          `\n` +
          `${body}\n\n` +
          `===== END DOCUMENT (${doc.filename}) =====`,
      });
    }
  }

  const updateNotice = updateContext
    ? `\n\nIMPORTANT, this is an UPDATE to an earlier analysis. The ` +
      `original analysis was run on ${updateContext.originalAnalysisDate}. ` +
      `The agent has added new document(s) (${updateContext.addedFilenames.join(", ")}) ` +
      `and re-requested analysis on the full combined package. ` +
      `Pay attention to whether any new document CONTRADICTS or SUPPLEMENTS ` +
      `earlier disclosures, surface that in your findings and notes.`
    : "";

  content.push({
    type: "text",
    text:
      `Analyze the documents above and submit your findings via the ` +
      `submit_focused_analysis tool.` +
      (propertyAddressHint
        ? `\n\nProperty address hint from the agent: ${propertyAddressHint}`
        : "") +
      updateNotice,
  });

  // Regional cost reference. Preference order:
  //   1. liveMarketBlock (web-search-fetched at run start, scoped to
  //      the actual property's market). Matches the cowork pattern of
  //      "build a regional cost reference library via web search at
  //      the start of each run."
  //   2. Hardcoded California reference (lib/cost-reference/california-
  //      markets.ts), refreshed biweekly. The fallback when the
  //      web-search fetch failed or timed out, AND the baseline that
  //      gets injected when there is no propertyAddressHint to scope
  //      against.
  const marketBlock =
    liveMarketBlock && liveMarketBlock.trim()
      ? liveMarketBlock.trim()
      : formatMarketReferenceForPrompt(
          selectMarketReference(propertyAddressHint ?? null),
        );

  const systemPrompt = `${FOCUSED_SYSTEM_BASE}\n\n${FOCUSED_GROUP_INSTRUCTIONS[group]}\n\n${marketBlock}`;

  const response = await callWithRateLimitRetry(() =>
    client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 12000,
      // Determinism: agents who re-run the same disclosure package
      // expect the same severity ratings. temperature: 0 + the seed
      // implicit in identical inputs gives us reproducible output.
      // Without this, the same package can flip between "Acceptable"
      // and "Walk Away" across runs because Claude samples differently
      // each time. A 0-temperature run is also a better baseline for
      // human review, the only source of variation is the documents
      // themselves.
      //
      // TODO(admin-settings): expose this value in a future admin
      // section of the app so an admin can tune the analyzer's
      // temperature without a code change. Default stays at 0
      // (deterministic). The admin path would let us experiment with
      // small non-zero values (0.1–0.2) for novel-form QA workflows
      //, surfacing alternate interpretations during human review ,
      // without affecting the standard deterministic production
      // path. When that admin section ships, this literal becomes
      // a field read from the agent/admin profile or a system-wide
      // setting.
      temperature: 0,
      system: systemPrompt,
      tools: [FOCUSED_TOOL_SCHEMA],
      tool_choice: { type: "tool", name: FOCUSED_TOOL_SCHEMA.name },
      messages: [{ role: "user", content }],
    }),
  );

  const toolUse = response.content.find(
    (c): c is Anthropic.Messages.ToolUseBlock => c.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error(
      `Focused pass for ${group} did not return a tool_use block. stop_reason=${response.stop_reason}`,
    );
  }

  return {
    analysis: toolUse.input as FocusedAnalysis,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

// ============================================================================
// Verification pass: re-runs each focused group with the first-pass output
// in context, asking Claude to find what was missed or got wrong.
//
// Why this exists: the 1544 San Antonio St report shipped without any of
// these findings that ARE in the source documents:
//   - 2024 Able WDO inspection Item 10A water staining on water heater
//     closet ceiling (cowork flagged as Critical roof leak)
//   - Asbestos disclosed in TDS Question 1 Item C (cowork flagged as
//     Critical hazard)
//   - Missing underlying 01/06/2026 Horizon WDO inspection report
//     (cowork flagged as moderate diligence item)
//   - County mismatch on signed TDS / SPQ (Santa Clara listed; property
//     is San Mateo)
//
// The first focused pass over the seller-disclosures and inspections
// groups failed to surface these. A single pass is a high-recall
// challenge for a 60-to-100-page CA disclosure package; the verifier
// pass is a second look that asks specifically about commonly-missed
// item categories with the first pass's output as context.
//
// Cost: roughly doubles the per-report Claude bill (a second
// focused-style call per sub-batch). The founder explicitly authorized
// this for accuracy.
//
// Future optimization (separate TODO at /admin/tasks): a lighter
// "structured verifier" that only re-checks the structured fields
// (property_facts, finding counts) without re-attaching the full
// document set. ~25% of the cost of the current full verifier.
// ============================================================================

// System-prompt suffix appended to the focused-group instructions
// when running in verify mode. The user message includes the prior
// FocusedAnalysis as JSON context so Claude knows what it's verifying.
const FOCUSED_VERIFY_SUFFIX = `

==========================================
VERIFICATION PASS, READ THIS CAREFULLY
==========================================

This is the SECOND pass through these documents. A previous pass produced the JSON analysis shown in the user message under "PREVIOUS PASS OUTPUT". Your job NOW is NOT to re-list what the previous pass already caught. Your job is to find what it MISSED.

Specifically scan for these commonly-missed item categories (each one is grounded in a real disclosure-package miss we've seen in production):

1. WATER STAINING / LEAK INDICATORS in Wood-Destroying Organism (WDO) inspections. Inspectors often note "water stains on ceiling could indicate leakage through roof covering" or "water stains at bottom of kitchen cabinet" as Section II items. If the seller's TDS or SPQ does NOT cross-reference these and they have no documented remediation, surface them as Critical (active water intrusion) or High (unresolved diligence item) findings.

2. ASBESTOS / LEAD-PAINT DISCLOSURES on the TDS and SPQ. Look at TDS Question 1 (substances/materials/products on the property) for asbestos, lead-based paint, formaldehyde, radon, MTBE, methamphetamine, or other hazardous materials disclosed by the seller. Look at the home inspector's narrative for HVAC/duct insulation notes mentioning "material that may contain asbestos fiber." These are pre-1981 building items often surfaced by the inspector even when the seller's check-box is "no."

3. MISSING REFERENCED DOCUMENTS. Completion notices, inspection summaries, or HOA minutes sometimes reference an underlying document by date or title (e.g., "WDO inspection report dated 01/06/2026"). If the underlying document is NOT in the package's document inventory, surface this as a moderate diligence item, the buyer can't evaluate the recommendation without seeing what it was based on.

4. CROSS-DOCUMENT INCONSISTENCIES. Compare the county / city / address / APN on the signed TDS, signed SPQ, NHD report, Preliminary Title, and MLS printout. Mismatches (especially the wrong county on a signed seller form) need correction before close. Surface as a moderate finding.

5. INSURANCE / LENDER FLAGS the first pass undercounted: FPE panels, knob-and-tube, polybutylene plumbing, aluminum branch wiring, ungrounded outlets in living spaces. The first pass should have caught the obvious ones; check whether subtler signals (e.g., a panel photo description, a pipe material note buried in a plumbing section) were missed.

6. HOA RESERVE ADEQUACY JUDGMENT. Most first passes pull the reserve cash balance correctly but fail to contextualize it against building age, recent / upcoming capital projects, and segregated-fund status. A small total cash balance ($30K-$50K) is NOT "healthy" for a 50+-year-old building that just absorbed a six-figure capital assessment. If the previous pass flagged reserves as healthy or did not flag them at all, AND the building age + recent capital history suggests undercapitalization, surface a moderate-to-high finding.

7. ALWAYS-CRITICAL RULES MISSED. Re-check the standard CA always-critical list: FPE / Zinsco / Federal Pacific panels, knob-and-tube, aluminum branch wiring, polybutylene, galvanized supply, polybutylene drain, lead service line, sewer lateral non-compliance for ordinance cities (Berkeley, Albany, etc.), Section I termite findings active, unpermitted additions disclosed in seller forms.

OUTPUT CONVENTION:
- Submit a FocusedAnalysis via submit_focused_analysis as usual.
- findings array should contain ONLY the items the previous pass missed. If the previous pass was complete, return an empty findings array, that is the correct answer when nothing's missing.
- DO NOT re-list findings already present in the previous pass.
- property_facts: only populate fields you found the previous pass got wrong; leave the rest blank.
- For each new finding, set source to a clean citation (document name and page when known).
- Keep severity calibrated: do not inflate moderate items to critical; do not deflate genuine critical items to "moderate" because you want the report to look clean.

If you genuinely find nothing the previous pass missed, return findings = [] and property_facts = {}. An empty verifier pass means the original analysis was complete, which is a valid + valuable result.`;

async function verifyFocusedAnalysis({
  documents,
  group,
  mode,
  propertyAddressHint,
  updateContext,
  listingText,
  liveMarketBlock,
  originalAnalysis,
}: {
  documents: Document[];
  group: PassGroup;
  mode: "pdf" | "text";
  propertyAddressHint?: string | null;
  updateContext?: UpdateContext | null;
  listingText?: string | null;
  liveMarketBlock?: string | null;
  originalAnalysis: FocusedAnalysis;
}): Promise<{
  analysis: FocusedAnalysis;
  usage: { input_tokens: number; output_tokens: number };
  // outcome distinguishes the three valid endings of the verifier
  // call so the caller can write a meaningful audit_log row:
  //   "ok"           = verifier returned a tool_use with one or
  //                    more new findings (real second-look value)
  //   "empty_delta"  = verifier returned a tool_use but findings
  //                    array was empty (the correct answer when
  //                    the first pass was complete)
  //   "no_tool_use"  = response had no tool_use block, Claude
  //                    refused or hit max_tokens before tool call
  //                    (genuine failure mode, NOT silent success)
  // The caller catches throws separately and tags them as "threw".
  outcome: "ok" | "empty_delta" | "no_tool_use";
  // Diagnostic detail when outcome=no_tool_use. Useful for the
  // audit log so we can see why Claude didn't tool-call.
  stop_reason?: string | null;
}> {
  const client = getAnthropicClient();
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  // Authoritative listing block, same as the first pass for the
  // seller_disclosures group. The verifier needs the same context the
  // first pass had to evaluate what was missed.
  if (group === "seller_disclosures" && listingText && listingText.trim()) {
    content.push({
      type: "text",
      text:
        `===== AUTHORITATIVE LISTING DATA (agent-provided MLS printout) =====\n` +
        `${listingText.trim()}\n` +
        `===== END AUTHORITATIVE LISTING DATA =====`,
    });
  }

  // Re-attach the same documents the first pass saw. The verifier
  // needs to see the source material directly to find what the first
  // pass missed; an output-only verifier would only catch internal
  // contradictions and miss the missing-findings class of bug, which
  // is the bigger gap.
  for (const doc of documents) {
    const isNewer =
      updateContext &&
      doc.addedAt &&
      doc.addedAt > updateContext.originalAnalysisDate;
    const noticeLine = isNewer
      ? ` (Added on ${doc.addedAt}, NEWER than the original analysis on ${updateContext!.originalAnalysisDate})`
      : "";
    if (mode === "pdf" && doc.pdfBase64) {
      content.push({
        type: "text",
        text: `===== BEGIN DOCUMENT: ${doc.filename} (${doc.pages} pages)${noticeLine} =====`,
      });
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: doc.pdfBase64,
        },
        title: doc.filename,
      });
      content.push({
        type: "text",
        text: `===== END DOCUMENT (${doc.filename}) =====`,
      });
    } else {
      const body = doc.text
        ? doc.text
        : `[No text could be extracted from this PDF (likely a scan without OCR). Use other documents in this group when forming findings.]`;
      content.push({
        type: "text",
        text:
          `===== BEGIN DOCUMENT =====\n` +
          `Filename: ${doc.filename}\n` +
          `Pages: ${doc.pages}\n` +
          (noticeLine ? `${noticeLine.trimStart()}\n` : "") +
          `\n` +
          `${body}\n\n` +
          `===== END DOCUMENT (${doc.filename}) =====`,
      });
    }
  }

  // PREVIOUS PASS OUTPUT, the context that turns this into a verifier
  // call. We pass the original findings + property_facts as JSON.
  // The verifier prompt explicitly tells Claude to ONLY return what's
  // missing.
  content.push({
    type: "text",
    text:
      `===== PREVIOUS PASS OUTPUT (do not re-list these) =====\n` +
      JSON.stringify(
        {
          property_facts: originalAnalysis.property_facts ?? {},
          findings: originalAnalysis.findings ?? [],
          permit_compliance: originalAnalysis.permit_compliance ?? null,
          environmental_hazards: originalAnalysis.environmental_hazards ?? null,
          hoa_facts: originalAnalysis.hoa_facts ?? null,
        },
        null,
        2,
      ) +
      `\n===== END PREVIOUS PASS OUTPUT =====\n\n` +
      `This is a VERIFICATION pass. Find what the previous pass missed, NOT what it already caught. Return ONLY the deltas via the submit_focused_analysis tool.` +
      (propertyAddressHint
        ? `\n\nProperty address hint from the agent: ${propertyAddressHint}`
        : ""),
  });

  // Regional cost reference (same as the first pass, so cost
  // estimates on new findings land in the same ballpark).
  const marketBlock =
    liveMarketBlock && liveMarketBlock.trim()
      ? liveMarketBlock.trim()
      : formatMarketReferenceForPrompt(
          selectMarketReference(propertyAddressHint ?? null),
        );

  const systemPrompt =
    `${FOCUSED_SYSTEM_BASE}\n\n${FOCUSED_GROUP_INSTRUCTIONS[group]}\n\n${marketBlock}` +
    FOCUSED_VERIFY_SUFFIX;

  const response = await callWithRateLimitRetry(() =>
    client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 8000,
      temperature: 0,
      system: systemPrompt,
      tools: [FOCUSED_TOOL_SCHEMA],
      tool_choice: { type: "tool", name: FOCUSED_TOOL_SCHEMA.name },
      messages: [{ role: "user", content }],
    }),
  );

  const toolUse = response.content.find(
    (c): c is Anthropic.Messages.ToolUseBlock => c.type === "tool_use",
  );
  if (!toolUse) {
    // Verifier failed to produce a tool_use. Return an empty
    // delta rather than throwing, the first-pass result still
    // stands. Marked outcome="no_tool_use" so the audit_log row
    // shows a real failure, not a silent success. The /admin/
    // health verifier-success-rate panel reads this to compute
    // the rolling failure rate.
    console.warn(
      `[verify] ${group}: verifier did not return tool_use; treating as empty delta. stop_reason=${response.stop_reason}`,
    );
    return {
      analysis: { findings: [] } as unknown as FocusedAnalysis,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      outcome: "no_tool_use",
      stop_reason: response.stop_reason ?? null,
    };
  }

  const analysis = toolUse.input as FocusedAnalysis;
  // Distinguish empty findings (correct answer when first pass
  // was complete) from a non-empty delta (real second-look
  // value). Lets the audit_log row carry the signal.
  const outcome: "ok" | "empty_delta" =
    Array.isArray(analysis.findings) && analysis.findings.length > 0
      ? "ok"
      : "empty_delta";
  return {
    analysis,
    outcome,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

// ============================================================================
// Code-based synthesis, combines focused-pass outputs into ReportData.
// Replaces the Claude-driven synthesis that was hanging in production.
// ============================================================================

// Apply the listing-data reconciliation to a freshly-synthesized
// ReportData. Three changes:
//
//   1. property_snapshot.mls_number is set to the reconciled current
//      MLS number when reconciliation succeeded. This OVERRIDES
//      whatever value the focused passes inferred (the focused
//      passes can't know which MLS# is current; the reconciliation
//      can, via live web_search).
//   2. property_snapshot.mls_status_note is set to the "current;
//      prior MLS X and Y cancelled" suffix when there are prior
//      MLS numbers, so the cover and snapshot row render the full
//      historical context.
//   3. market_context gets relist_ladder + listing_divergence_note
//      when the seller has a relist history or when sources
//      disagreed.
//
// Returns the same ReportData reference, mutated in place. Pure
// transformation, no Claude call.
function applyListingReconciliation(
  report: ReportData,
  recon: ListingReconciliation | null,
): ReportData {
  if (!recon) return report;

  // 1 + 2: property_snapshot edits.
  if (report.property_snapshot && recon.current) {
    if (recon.current.mls_number) {
      report.property_snapshot.mls_number = recon.current.mls_number;
    }
    if (recon.current.list_price != null) {
      report.property_snapshot.list_price = recon.current.list_price;
    }
    if (recon.current.list_date) {
      report.property_snapshot.list_date = recon.current.list_date;
    }
    if (recon.current.days_on_market != null) {
      report.property_snapshot.days_on_market = recon.current.days_on_market;
    }
    const statusNote = mlsStatusNoteFromReconciliation(recon);
    if (statusNote) {
      report.property_snapshot.mls_status_note = statusNote;
    }
  }

  // 2.5: defensive override when the disclosure package's MLS
  // print-out is in a terminal status (cancelled / withdrawn /
  // sold / expired).
  //
  // Background: focused passes generate property_facts from
  // whatever the disclosure documents say, INCLUDING the package's
  // MLS print-out. The package print-out is a historical snapshot;
  // when the listing was cancelled and re-listed after the package
  // was assembled, the focused passes will happily pull the
  // cancelled-listing facts as the report's headline. The recon.
  // current override above fixes individual fields WHEN
  // reconciliation surfaces a confirmed current replacement, but
  // when the live web search and listing URL both fail to confirm
  // a current value, the focused passes' stale value ships
  // unchanged.
  //
  // Field-by-field stale check: when the package source is
  // confirmed stale AND a given property_snapshot field still
  // equals the stale package source's value AND reconciliation
  // didn't surface a confirmed current replacement for that
  // field, null the field. The narrative renderer handles nulls
  // gracefully (omits the relevant part).
  //
  // For sibling facts that change slowly (HOA monthly dues),
  // surface a completeness_audit issue instead of nulling, so the
  // agent sees the figure with a "verify against current data"
  // caveat rather than a blank.
  if (report.property_snapshot && recon.sources) {
    const pkg = recon.sources.package_mls;
    const pkgStatus = pkg?.status;
    const pkgIsStale =
      pkgStatus === "cancelled" ||
      pkgStatus === "withdrawn" ||
      pkgStatus === "sold" ||
      pkgStatus === "expired";

    if (pkgIsStale && pkg) {
      const ps = report.property_snapshot;
      let nulledSomething = false;

      // list_price: null when matches stale package AND
      // reconciliation didn't surface a current price.
      if (
        pkg.list_price != null &&
        ps.list_price === pkg.list_price &&
        (!recon.current || recon.current.list_price == null)
      ) {
        console.warn(
          `[analyze] property_snapshot.list_price (${ps.list_price}) matched the ${pkgStatus} package MLS price; nulling to avoid shipping stale data`,
        );
        ps.list_price = null;
        nulledSomething = true;
      }

      // days_on_market: same field-by-field check. DOM tied to
      // the cancelled listing is meaningless once the listing is
      // re-listed.
      if (
        pkg.days_on_market != null &&
        ps.days_on_market === pkg.days_on_market &&
        (!recon.current || recon.current.days_on_market == null)
      ) {
        console.warn(
          `[analyze] property_snapshot.days_on_market (${ps.days_on_market}) matched the ${pkgStatus} package MLS DOM; nulling`,
        );
        ps.days_on_market = null;
        nulledSomething = true;
      }

      // list_date: same field-by-field check. A list_date from
      // a cancelled listing is the wrong list_date for the
      // current active listing.
      if (
        pkg.list_date != null &&
        ps.list_date === pkg.list_date &&
        (!recon.current || recon.current.list_date == null)
      ) {
        console.warn(
          `[analyze] property_snapshot.list_date (${ps.list_date}) matched the ${pkgStatus} package MLS list_date; nulling`,
        );
        ps.list_date = null;
        nulledSomething = true;
      }

      // When we nulled at least one field AND there's no listing
      // history insight yet, write a buyer-facing note explaining
      // the gap. Renders as the Listing History callout in the
      // Market Context section.
      if (
        nulledSomething &&
        report.market_context &&
        !report.market_context.listing_history_insight
      ) {
        report.market_context.listing_history_insight =
          `The package's MLS print-out shows this listing as ${pkgStatus}. The current active listing's price, MLS number, and days on market could not be confirmed from public sources at analysis time. Ask the listing agent to confirm the current details before relying on any listing data in this section.`;
      }

      // HOA dues + general sibling-fact caveat. The HOA bundle in
      // a stale package is itself stale. We keep the dues figure
      // (HOA dues change rarely) but flag it as needing
      // verification, AND add a general "verify other facts from
      // this package" issue to the completeness audit so the
      // agent sees the broader risk.
      if (report.completeness_audit) {
        const issues = report.completeness_audit.issues ?? [];
        const dues = ps.hoa_dues_monthly;
        if (dues != null) {
          issues.push(
            `HOA monthly dues were extracted from a disclosure package whose MLS print-out is in '${pkgStatus}' status. HOA dues change rarely so the figure is likely still accurate, but verify current dues with the association directly before contingency removal.`,
          );
        }
        issues.push(
          `The disclosure package's MLS print-out shows the listing as '${pkgStatus}'. Any facts the analyzer pulled from that package (listing agent identity, taxes, prior-sale dates, HOA financials, inspection dates) should be re-verified against the current live listing or directly with the seller's agent before relying on them in negotiations or escrow timelines.`,
        );
        report.completeness_audit.issues = issues;

        // Refresh the completeness audit summary count so the
        // PDF + agent dashboard reflect the new issue count.
        const n = issues.length;
        report.completeness_audit.summary =
          n === 0
            ? "Disclosure package appears complete."
            : `${n} completeness issue${n === 1 ? "" : "s"} identified across the disclosure package. Review each item before proceeding.`;
      }
    }
  }

  // 3: market_context edits. Render the relist ladder when it
  // contains 2+ events (a single event is just the current listing
  // and doesn't tell a story). The buyer-facing listing history
  // insight + agent talking point render whenever the reconciliation
  // populated them, regardless of has_divergence, because the
  // signal is about the listing's history, not about source
  // disagreement.
  const hasHistory =
    (recon.relist_ladder && recon.relist_ladder.length >= 2) ||
    Boolean(recon.listing_history_insight) ||
    Boolean(recon.agent_talking_point);

  if (report.market_context) {
    if (recon.relist_ladder && recon.relist_ladder.length >= 2) {
      report.market_context.relist_ladder = recon.relist_ladder;
    }
    if (recon.listing_history_insight) {
      report.market_context.listing_history_insight =
        recon.listing_history_insight;
    }
    if (recon.agent_talking_point) {
      report.market_context.listing_history_talking_point =
        recon.agent_talking_point;
    }
    if (recon.same_listing_agent_pattern) {
      report.market_context.same_listing_agent_pattern = true;
    }
  } else if (hasHistory) {
    // No market_context existed but the reconciliation surfaced
    // signal worth rendering. Spin up a minimal market_context so
    // the listing history has a home.
    report.market_context = {
      summary:
        "Listing history reconstructed by the listing-data reconciliation step.",
      relist_ladder:
        recon.relist_ladder && recon.relist_ladder.length >= 2
          ? recon.relist_ladder
          : null,
      listing_history_insight: recon.listing_history_insight ?? null,
      listing_history_talking_point: recon.agent_talking_point ?? null,
      same_listing_agent_pattern: recon.same_listing_agent_pattern ?? null,
    };
  }

  // Fold the agent talking point into the Negotiation Leverage
  // section so it surfaces where the agent looks for negotiation
  // signal. Prepended (not appended) because a relist pattern is
  // often the strongest leverage on the report.
  if (recon.agent_talking_point && report.negotiation) {
    const leverage = Array.isArray(report.negotiation.leverage_points)
      ? report.negotiation.leverage_points
      : [];
    report.negotiation.leverage_points = [
      `Listing history: ${recon.agent_talking_point}`,
      ...leverage,
    ];
  }

  return report;
}

function synthesizeReportInCode(
  focused: FocusedAnalysis[],
  propertyAddressHint: string | null,
  updateContext: UpdateContext | null,
  // Optional live market context from the web_search pass. When
  // present, this WINS over what individual focused passes
  // produced, it's grounded in current rate aggregators and recent
  // sales data, which the focused passes can't reach.
  liveMarketContext: ReportData["market_context"] | null = null,
  // Optional listing-data reconciliation. When non-null, applied
  // at the end of synthesis to fix property_snapshot.mls_number,
  // property_snapshot.mls_status_note, market_context.relist_ladder,
  // and market_context.listing_divergence_note. See
  // applyListingReconciliation above.
  listingReconciliation: ListingReconciliation | null = null,
  // Optional parallel array of pass groups, indexed the same as
  // focused[]. When present, the rating-text composition can pick
  // the pass with the broadest context (seller_disclosures has
  // TDS+SPQ+MLS+prelim) rather than whichever pass happened to
  // populate overall_rating_why first. Without this, the hazards
  // pass (which only sees the NHD) can write a narrow rating
  // narrative like "This is a natural hazard disclosure report
  // only", overriding richer narratives from other passes.
  passGroups: PassGroup[] = [],
): ReportData {
  // Aggregate findings (treat permit_compliance findings separately so
  // they end up in the permit section, not double-counted).
  //
  // Now that the verification pass runs after each focused pass and
  // can also produce findings, the same underlying issue can land in
  // both the first-pass and verifier-delta arrays. The verifier is
  // told to return ONLY new findings, but in practice Claude
  // occasionally re-states an item it spotted in the original output.
  // Dedupe by a normalized title key, keeping the earlier-seen entry
  // (the first pass's wording is typically more complete).
  const rawAllFindings: Finding[] = [];
  const permitFindings: Finding[] = [];
  for (const f of focused) {
    if (Array.isArray(f.findings)) rawAllFindings.push(...f.findings);
    if (Array.isArray(f.permit_compliance?.findings)) {
      permitFindings.push(...(f.permit_compliance!.findings ?? []));
    }
  }
  const allFindings = dedupeFindings(rawAllFindings);

  // If this is an update, tag every finding whose `source` cites a
  // filename added in this update. The PDF / dashboard can then
  // surface a "Added in update" badge on those findings.
  if (updateContext && updateContext.addedFilenames.length > 0) {
    const addedSet = new Set(
      updateContext.addedFilenames.map((n) => n.toLowerCase()),
    );
    for (const finding of allFindings.concat(permitFindings)) {
      const src = (finding.source ?? "").toLowerCase();
      const matched = [...addedSet].find((added) => src.includes(added));
      if (matched) finding.from_doc_added_at = updateContext.updateDate;
    }
  }

  // -------- POST-PROCESSING: HOA cost-driven severity downgrade --------
  // The prompt asks Claude to honor cost_responsibility, but we belt-
  // and-suspenders it here. Any finding tagged cost_responsibility="hoa"
  // that's Critical AND has no triggered_rule AND has no active-hazard
  // language gets downgraded to High, the dollar amount drove its
  // severity, but the dollars don't hit the buyer's pocket. We KEEP
  // Critical when the finding's narrative implies an active hazard
  // (water intrusion, mold, structural movement) or when a triggered_
  // rule fired (those rules cover hazard/lender/insurance criteria
  // explicitly).
  for (const f of allFindings) {
    if (
      f.cost_responsibility === "hoa" &&
      f.severity === "critical" &&
      !f.triggered_rule &&
      !mentionsActiveHazardOrInsuranceBlock(
        `${f.title} ${f.description} ${f.risk_if_ignored}`,
      )
    ) {
      f.severity = "high";
    }
  }

  // -------- POST-PROCESSING: drop obvious-fact findings ----------------
  // Final defense against findings that just describe what the listing
  // says. The prompt's OBVIOUS-FACT FILTER catches most; this catches
  // the rest by pattern-matching titles/descriptions that read like
  // listing copy with no defect, risk, or actionable content.
  const obviousFiltered = allFindings.filter((f) => !isObviousFactFinding(f));
  const obviousFilteredPermits = permitFindings.filter(
    (f) => !isObviousFactFinding(f),
  );

  // -------- POST-PROCESSING: drop unit-feature-mismatch findings -------
  // Real-customer issue: a Critical "balcony deferred maintenance"
  // finding appeared on a ground-floor unit that doesn't have a
  // balcony. The prompt asks Claude to drop these, but Claude is
  // variable on unit-level applicability, building-wide reserve-study
  // items get pulled in as if they affect every unit. The merged
  // property_snapshot includes a unit_features list when the analyzer
  // could pin them down; we use that list to drop findings whose
  // subject matches a feature NOT in it.
  //
  // Compute the merged property snapshot here (was further down) so
  // we have the unit_features available for the filter. The same
  // value is reused in the final return object.
  const property = mergeProperty(focused, propertyAddressHint);
  const unitFeatures = new Set(
    (property.unit_features ?? []).map((f) => f.toLowerCase()),
  );
  const filteredAllFindings = obviousFiltered.filter(
    (f) => !mismatchesUnitFeatures(f, unitFeatures, property.property_type),
  );
  const filteredPermitFindings = obviousFilteredPermits.filter(
    (f) => !mismatchesUnitFeatures(f, unitFeatures, property.property_type),
  );

  // -------- Bucket + SORT by severity, then by cost.high descending ---
  // Within the critical-bucket we keep Critical above High by sorting on
  // the severity rank first, then descending cost so the biggest-dollar
  // items lead each tier. The dashboard + PDF show critical_findings as
  // the headline list, so this ordering is what the user reads first.
  const severityRank: Record<Severity, number> = {
    critical: 0,
    high: 1,
    moderate: 2,
    cosmetic: 3,
  };
  const sortFindings = (arr: Finding[]) =>
    [...arr].sort((a, b) => {
      const sevDelta = severityRank[a.severity] - severityRank[b.severity];
      if (sevDelta !== 0) return sevDelta;
      const aCost = a.cost_estimate?.high ?? 0;
      const bCost = b.cost_estimate?.high ?? 0;
      return bCost - aCost;
    });

  // HOA-paid findings get pulled OUT of the critical/high bucket and
  // surfaced in the HOA section as concerns. Without this redirect,
  // building-wide HOA capital projects (which the buyer doesn't pay
  // directly) bloat the critical/high count and tilt the overall
  // rating toward "Significant Concerns" even when the unit itself
  // has no real owner-pays critical findings. The only HOA-paid items
  // that STAY in critical/high are ones that hit an always-Critical
  // rule (triggered_rule populated) or describe an active hazard /
  // insurance-blocker, those impact the buyer's deal regardless of
  // who writes the repair check.
  const hoaDivertedConcerns: string[] = [];
  const criticalHighRaw = filteredAllFindings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  const criticalHighKept = criticalHighRaw.filter((f) => {
    const findingText = `${f.source ?? ""} ${f.title ?? ""} ${f.description ?? ""} ${f.risk_if_ignored ?? ""} ${f.recommended_action ?? ""}`;
    const isHoa =
      f.cost_responsibility === "hoa" ||
      (f.cost_responsibility == null &&
        // For legacy findings without cost_responsibility we use a
        // textual heuristic on the source citation, same approach
        // as the PDF render's looksHoaPaid().
        /\b(reserve study|reserve fund|hoa reserve|association reserve|board minutes|hoa budget|association budget|special assessment|common area|common element|building exterior|exterior of (the )?building|building envelope|common roof|elevator|lobby|common[\s-]?area plumbing|common boiler|common parking|staircase|stair landing|stairwell|common hallway|common laundry|courtyard|breezeway|pool deck|building exterior)\b/i.test(
          findingText,
        ));
    if (!isHoa) return true; // owner-pays, keep
    // The active-hazard escape preserves Critical when the hazard
    // affects the BUYER'S UNIT directly. Critical real-world
    // example: "active leak in this unit's bedroom ceiling" stays
    // Critical even though the HOA pays the repair.
    //
    // BUT we don't want building-wide HOA hazards (water intrusion
    // at multiple common staircase landings, common-balcony
    // deterioration) to stay Critical when the buyer's unit isn't
    // physically affected. Customer feedback (2026-05-22): ground-
    // floor unit was rated "Significant Concerns" because Critical
    // findings about COMMON staircase water intrusion were
    // preserved by the hazard-escape, those don't impact a unit
    // that doesn't use those stairs.
    //
    // Refined rule: keep Critical ONLY when active-hazard language
    // AND the language doesn't ALSO flag the issue as confined to
    // a common area or other building parts. If both signals are
    // present, the hazard is the BUILDING'S, not this unit's ,
    // divert to HOA concerns.
    const isHazardLanguage = mentionsActiveHazardOrInsuranceBlock(
      `${f.title} ${f.description ?? ""} ${f.risk_if_ignored ?? ""}`,
    );
    const isBuildingScoped = mentionsBuildingCommonArea(findingText);
    const mentionsThisUnitDirectly = mentionsTheBuyersUnit(findingText);

    if (f.triggered_rule) {
      // Always-Critical rules (FPE, polybutylene, etc.) supersede
      // everything else, keep regardless of HOA/common-area
      // scoping.
      return true;
    }
    if (isHazardLanguage && (!isBuildingScoped || mentionsThisUnitDirectly)) {
      // Active hazard affecting this unit (or unclear scope that
      // could affect this unit), keep Critical.
      return true;
    }
    // HOA-paid AND no clear unit-level hazard → divert into HOA
    // concerns and drop from critical/high.
    const concernLine = formatHoaDivertedConcern(f);
    if (concernLine) hoaDivertedConcerns.push(concernLine);
    return false;
  });
  const criticalFindings = sortFindings(criticalHighKept);
  const moderateFindings = sortFindings(
    filteredAllFindings.filter((f) => f.severity === "moderate"),
  );
  const cosmeticFindings = sortFindings(
    filteredAllFindings.filter((f) => f.severity === "cosmetic"),
  );

  // -------- Cost summary: BUYER OUT-OF-POCKET vs HOA-PAID --------------
  // The grand_total / critical_high_total / moderate_total numbers
  // surface in the executive summary as "repair exposure" and need to
  // reflect what the buyer actually pays. We split:
  //   - buyer-pays subset: findings where cost_responsibility is null,
  //     undefined, "owner", or "shared". These count toward the buyer's
  //     repair exposure.
  //   - hoa-paid subset: cost_responsibility === "hoa". Reported as a
  //     separate informational line in the cost summary, NOT rolled
  //     into the buyer's totals.
  const isBuyerPays = (f: Finding) =>
    f.cost_responsibility !== "hoa"; // null/undefined/owner/shared → buyer pays

  const buyerCritHighCosts = criticalFindings
    .filter(isBuyerPays)
    .map((f) => f.cost_estimate)
    .filter(Boolean);
  const buyerModerateCosts = moderateFindings
    .filter(isBuyerPays)
    .map((f) => f.cost_estimate)
    .filter(Boolean);
  const critHighTotal = sumCostRanges(buyerCritHighCosts);
  const moderateTotal = sumCostRanges(buyerModerateCosts);
  const grandTotal: CostRange = {
    low: critHighTotal.low + moderateTotal.low,
    high: critHighTotal.high + moderateTotal.high,
  };

  // Line items: buyer-pays go under severity-bucketed categories; HOA-
  // paid findings get their own category so the agent + buyer can SEE
  // the scope of HOA capital work without it inflating the buyer total.
  const lineItemsByCategory = new Map<string, Array<{ label: string; cost: CostRange }>>();
  for (const f of criticalFindings) {
    if (isBuyerPays(f)) {
      addLine(
        lineItemsByCategory,
        "Critical & high-priority repairs (buyer)",
        f.title,
        f.cost_estimate,
      );
    } else {
      addLine(
        lineItemsByCategory,
        "HOA-paid capital projects (informational)",
        f.title,
        f.cost_estimate,
      );
    }
  }
  for (const f of moderateFindings) {
    if (isBuyerPays(f)) {
      addLine(
        lineItemsByCategory,
        "Moderate repairs (1-5 year horizon, buyer)",
        f.title,
        f.cost_estimate,
      );
    } else {
      addLine(
        lineItemsByCategory,
        "HOA-paid capital projects (informational)",
        f.title,
        f.cost_estimate,
      );
    }
  }
  // Cost estimates from focused passes → line items (use as-given category).
  // These come from Claude's cost_estimates array, separate from finding
  // estimates. We don't have a cost_responsibility on these so we trust
  // the category Claude picked.
  for (const pass of focused) {
    for (const e of pass.cost_estimates ?? []) {
      addLine(lineItemsByCategory, e.category || "Other", e.label, e.cost);
    }
  }
  const lineItems = Array.from(lineItemsByCategory.entries()).map(
    ([category, items]) => ({ category, items }),
  );

  // Property snapshot was computed up above (alongside the unit-feature
  // filter that needs it). The `property` const is in scope here.

  // Document inventory, union docs across passes, then consolidate any
  // `{base}_part_N.pdf` split chunks back into a single `{base}.pdf` entry
  // with the page counts summed. The user only ever uploaded the original
  // file; the parts are an internal processing artifact and shouldn't
  // surface in the PDF document inventory.
  const docByName = new Map<string, { name: string; type: string; pages?: number }>();
  for (const pass of focused) {
    for (const d of pass.document_inventory ?? []) {
      if (!docByName.has(d.name)) docByName.set(d.name, d);
    }
  }
  const consolidated = consolidateSplitDocuments(Array.from(docByName.values()));
  const documentInventory = {
    documents_provided: consolidated,
    documents_missing: detectMissingDocuments(consolidated),
  };

  // Completeness audit, concat issues across passes.
  const completenessIssues = focused.flatMap((p) => p.completeness_issues ?? []);
  const completenessSummary =
    completenessIssues.length === 0
      ? "Disclosure package appears complete based on the documents reviewed."
      : `${completenessIssues.length} completeness issue${completenessIssues.length === 1 ? "" : "s"} identified across the disclosure package. Review each item before proceeding.`;

  // HOA, take the HOA pass's facts, fall back to "not applicable" if no
  // HOA pass populated it. Also merge in the enriched HOA narrative
  // fields (financial fact table, reserve-health read, watch items)
  // from whichever pass populated them, typically the same HOA pass
  // but the schema allows any pass to contribute.
  const hoaSource = focused.find(
    (p) => p.hoa_facts && (p.hoa_facts.summary || p.hoa_facts.concerns?.length),
  );
  const hoaFinancialFacts =
    focused.find((p) => p.hoa_financial_facts && p.hoa_financial_facts.length > 0)
      ?.hoa_financial_facts ?? null;
  const hoaReserveHealthRead = cleanEditorialString(
    focused.find((p) => p.hoa_reserve_health_read)?.hoa_reserve_health_read,
  );
  const hoaWatchItems = cleanEditorialString(
    focused.find((p) => p.hoa_watch_items)?.hoa_watch_items,
  );
  const hoaBase = hoaSource?.hoa_facts
    ? {
        ...hoaSource.hoa_facts,
        facts: hoaFinancialFacts,
        reserve_health_read: hoaReserveHealthRead,
        watch_items: hoaWatchItems,
      }
    : {
        applicable: false,
        summary: "HOA documents not present or not applicable to this property.",
        concerns: [] as string[],
        facts: null,
        reserve_health_read: null,
        watch_items: null,
      };
  // Merge in concerns diverted from the critical/high bucket. These
  // are HOA-paid items that don't directly impact the buyer but are
  // worth noting in the HOA section so the agent has a complete
  // picture of association activity. Dedupe against any concerns
  // the HOA pass already produced.
  const mergedConcerns = [
    ...(Array.isArray(hoaBase.concerns) ? hoaBase.concerns : []),
    ...hoaDivertedConcerns,
  ];
  const hoa = {
    ...hoaBase,
    // If we have diverted concerns but the HOA pass didn't flag this
    // property as applicable (no HOA pass populated), upgrade
    // applicable to true so the section renders with the diverted
    // concerns visible.
    applicable: hoaBase.applicable || hoaDivertedConcerns.length > 0,
    concerns: dedupeStrings(mergedConcerns),
  };

  // Environmental, take the hazards pass's content.
  const environmentalHazards = focused.flatMap(
    (p) => p.environmental_hazards ?? [],
  );
  const environmental = {
    summary:
      environmentalHazards.length === 0
        ? "No significant natural hazards identified in the disclosed documents."
        : `${environmentalHazards.length} hazard zone${environmentalHazards.length === 1 ? "" : "s"} applicable to this property. Review each below for insurance and lender implications.`,
    hazards: environmentalHazards,
  };

  // Permit compliance, combine summaries and findings.
  const permitSummaries = focused
    .map((p) => p.permit_compliance?.summary)
    .filter((s): s is string => !!s);
  const permitCompliance = {
    summary:
      permitSummaries.length > 0
        ? permitSummaries.join(" ")
        : "No permit-related issues surfaced in the documents reviewed.",
    findings: sortFindings(filteredPermitFindings),
  };

  // Insurance / lender risk, sort notes into the two buckets via
  // simple keyword classification.
  const insuranceConcerns: string[] = [];
  const lenderConcerns: string[] = [];
  for (const pass of focused) {
    for (const note of pass.insurance_lender_notes ?? []) {
      const lower = note.toLowerCase();
      const looksLender =
        /lend|loan|mortgage|appraisal|funding|underwrit/.test(lower);
      const looksInsurance =
        /insur|policy|premium|carrier|bind|covered/.test(lower);
      if (looksLender && !looksInsurance) lenderConcerns.push(note);
      else if (looksInsurance && !looksLender) insuranceConcerns.push(note);
      else {
        // Default to both buckets for ambiguous items, better to
        // surface twice than to drop.
        insuranceConcerns.push(note);
        lenderConcerns.push(note);
      }
    }
  }
  const insuranceLenderRisk = {
    summary:
      insuranceConcerns.length === 0 && lenderConcerns.length === 0
        ? "No significant insurance or lender concerns identified."
        : "Review the items below before contingency removal. Items affecting insurability or lending often have hard timing implications.",
    insurance_concerns: dedupeStrings(insuranceConcerns),
    lender_concerns: dedupeStrings(lenderConcerns),
  };

  // Outstanding questions, dedupe, normalize, cap to a handful.
  //
  // We were generating 20+ questions per report and the agent feedback
  // was clear: a wall of questions overwhelms the buyer and the goal is
  // to surface FACTS, then let them and the agent reach a conclusion.
  // The cap is a hard limit so the section reads like "here are the
  // questions worth asking" instead of an exhaustive interrogation.
  //
  // Ranking heuristics (we don't have semantic understanding here):
  //   1. Questions that mention a critical/high finding title get
  //      priority, those questions are directly tied to closing-
  //      blocking concerns.
  //   2. Questions that contain "?" near the end and look like real
  //      open-ended buyer questions go next.
  //   3. Generic boilerplate-y questions ("Are there any other items
  //      the seller is aware of?") get dropped.
  const MAX_QUESTIONS = 6;
  const allQuestions = dedupeStrings(
    focused.flatMap((p) => p.outstanding_questions ?? []),
  );
  const criticalTitleWords = new Set(
    criticalFindings
      .flatMap((f) => f.title.toLowerCase().split(/\W+/))
      .filter((w) => w.length > 4),
  );
  const rankedQuestions = allQuestions
    .map((q) => {
      const lower = q.toLowerCase();
      const isGenericBoilerplate =
        /^(are there any other|is there anything else|does the seller|do you have any additional)/i.test(
          q.trim(),
        );
      const tiesToCritical = Array.from(criticalTitleWords).some((w) =>
        lower.includes(w),
      );
      let score = 0;
      if (tiesToCritical) score += 10;
      if (q.trim().endsWith("?")) score += 3;
      if (isGenericBoilerplate) score -= 20;
      // Prefer specific (mid-length) over very short or very long
      if (q.length > 40 && q.length < 200) score += 2;
      return { q, score };
    })
    .filter((x) => x.score > -10) // drop the genuinely useless ones
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_QUESTIONS)
    .map((x) => x.q);
  const outstandingQuestions = rankedQuestions;

  // Negotiation leverage, high-confidence critical/high findings.
  const leveragePoints = criticalFindings
    .filter((f) => f.confidence === "high")
    .map((f) => `${f.title}, ${f.recommended_action}`);

  const negotiation = {
    summary:
      leveragePoints.length === 0
        ? "Limited negotiation leverage from the documented findings."
        : `${leveragePoints.length} high-confidence critical/high finding${leveragePoints.length === 1 ? "" : "s"} provide${leveragePoints.length === 1 ? "s" : ""} meaningful negotiation leverage.`,
    leverage_points: leveragePoints,
  };

  // Overall rating, rule-based on FILTERED finding counts so obvious-
  // fact junk and HOA-downgraded items don't tilt the rating. Also
  // pulls in the analyzer's editorial narrative when populated.
  //
  // IMPORTANT: critical/high counts used here come from the BUCKETED
  // criticalFindings list (post-HOA-divert), not from filteredAll-
  // Findings. This matches what the reader sees in the report: the
  // rating reflects findings the BUYER faces, not building-wide HOA
  // business we already redirected into the HOA section.
  // Pick the rating narrative from the pass with the BROADEST context.
  // seller_disclosures sees TDS+SPQ+MLS+prelim+AVID, the richest source.
  // hazards sees only the NHD and writes narrow narratives like
  // "This is a natural hazard disclosure report only". When passGroups
  // is provided, prefer passes by group rank; otherwise fall back to
  // the legacy first-found behavior.
  //
  // Tiebreaker within the same group rank: the pass that produced the
  // most findings (signal of how much context it actually engaged with).
  const RATING_GROUP_RANK: Record<PassGroup, number> = {
    seller_disclosures: 0,
    inspections: 1,
    hoa: 2,
    hazards: 3,
  };
  const indexedFocused = focused.map((analysis, i) => ({
    analysis,
    group: passGroups[i] ?? null,
    rank: passGroups[i] ? RATING_GROUP_RANK[passGroups[i]] : 99,
    findingCount: (analysis.findings?.length ?? 0),
  }));
  const ratingWhyCandidate = [...indexedFocused]
    .filter((p) => p.analysis.overall_rating_why)
    .sort((a, b) => a.rank - b.rank || b.findingCount - a.findingCount)[0];
  const ratingConditionsCandidate = [...indexedFocused]
    .filter((p) => p.analysis.overall_rating_conditions)
    .sort((a, b) => a.rank - b.rank || b.findingCount - a.findingCount)[0];
  const ratingWhyText = cleanEditorialString(
    ratingWhyCandidate?.analysis.overall_rating_why,
  );
  const ratingConditionsText = cleanEditorialString(
    ratingConditionsCandidate?.analysis.overall_rating_conditions,
  );
  const baseRating = determineOverallRating({
    criticalCount: criticalFindings.filter((f) => f.severity === "critical")
      .length,
    highCount: criticalFindings.filter((f) => f.severity === "high").length,
    moderateCount: moderateFindings.length,
    cosmeticCount: cosmeticFindings.length,
  });
  // Code-side fallback for the editorial fields. Claude is asked to
  // populate these in the prompt but doesn't always, and they're
  // synthesizable from data we already have, so the report shouldn't
  // ship with them blank. Fallback is conservative and clearly
  // generic when used; the real value still comes from the analyzer.
  const fallbackWhy = composeFallbackRatingWhy(
    baseRating.label,
    criticalFindings,
    moderateFindings,
    cosmeticFindings,
  );
  const fallbackConditions = composeFallbackRatingConditions(
    criticalFindings,
  );
  const overallRating = {
    ...baseRating,
    why_this_rating: ratingWhyText ?? fallbackWhy,
    conditions_on_which_this_depends: ratingConditionsText ?? fallbackConditions,
  };

  // Inspection follow-ups, market context, title & vesting, each
  // analyzer pass may populate one or more of these. Take the first
  // populated value across passes (typically seller_disclosures sees
  // the prelim and the MLS, so it's the natural source).
  const inspectionFollowUps =
    focused.find(
      (p) => p.inspection_follow_ups && p.inspection_follow_ups.length > 0,
    )?.inspection_follow_ups ?? null;

  // Aggregate cross-document consistency findings across all passes.
  // Each pass surfaces inconsistencies it can see within its own
  // document group (seller_disclosures pass: TDS vs SPQ vs LBP;
  // inspections pass: home inspection vs WDO vs roof; hoa pass:
  // minutes vs balance sheet vs reserve study). Inter-group
  // inconsistencies (e.g., TDS vs Reserve Study) belong to a
  // future top-level consistency pass that sees everything; this
  // commit ships the focused-pass version. Dedupe by lowercased
  // title so two passes flagging the same disagreement don't
  // double up.
  const crossDocSeen = new Set<string>();
  const crossDocFindings: NonNullable<ReportData["cross_document_findings"]> = [];
  for (const p of focused) {
    const items = p.cross_document_findings ?? [];
    for (const item of items) {
      const key = item.title.trim().toLowerCase();
      if (crossDocSeen.has(key)) continue;
      crossDocSeen.add(key);
      crossDocFindings.push({
        title: item.title,
        description: item.description,
        source_docs: item.source_docs,
        recommended_action: item.recommended_action ?? null,
        severity: item.severity ?? "moderate",
      });
    }
  }
  // Prefer the live web-search-grounded market context over what
  // focused passes produced. Focused passes typically can't reach
  // the data needed for this section (current rates, current segment
  // medians, recent comps), so when liveMarketContext is populated
  // it's almost always the right choice. Fall through to the focused-
  // pass value when live context is null.
  const marketContext =
    liveMarketContext ??
    focused.find((p) => p.market_context?.summary)?.market_context ??
    null;
  const titleVesting =
    focused.find((p) => p.title_vesting?.vesting_summary)?.title_vesting ??
    null;

  // Human-readable update note. Counts filtered findings whose source
  // cited an added document, gives the agent (and the email/dashboard
  // summary) a one-liner explaining what this re-analysis actually
  // changed.
  const updateNote = composeUpdateNote(
    updateContext,
    filteredAllFindings.concat(filteredPermitFindings),
  );

  // Safety-net: detect missed always-Critical rules and append them
  // to completeness_audit.issues so the agent + admin can see "the
  // source documents mentioned ABS pipe in the 1984-1990 window but
  // the analyzer didn't surface a Critical finding for it." This
  // catches Claude regressions across reruns (real 2026-05-22 case:
  // ABS pipe Critical disappeared between runs on the same docs).
  const missedRules = detectMissedAlwaysCriticalRules(
    focused,
    filteredAllFindings.concat(filteredPermitFindings),
  );
  if (missedRules.length > 0) {
    for (const r of missedRules) {
      completenessIssues.push(
        `Possible missed always-Critical signal: ${r.label}. The source documents mentioned this but the analyzer didn't surface a finding. Review manually, re-running the analysis often resolves it.`,
      );
    }
  }

  const baseReport: ReportData = {
    property_snapshot: property,
    document_inventory: documentInventory,
    completeness_audit: { summary: completenessSummary, issues: completenessIssues },
    critical_findings: criticalFindings,
    moderate_findings: moderateFindings,
    cosmetic_findings: cosmeticFindings,
    permit_compliance: permitCompliance,
    hoa,
    environmental,
    cost_summary: {
      critical_high_total: critHighTotal,
      moderate_total: moderateTotal,
      grand_total: grandTotal,
      line_items: lineItems,
    },
    negotiation,
    insurance_lender_risk: insuranceLenderRisk,
    outstanding_questions: outstandingQuestions,
    cross_document_findings:
      crossDocFindings.length > 0 ? crossDocFindings : null,
    inspection_follow_ups: inspectionFollowUps,
    market_context: marketContext,
    title_vesting: titleVesting,
    overall_rating: overallRating,
    update_note: updateNote,
  };

  // Apply the listing-data reconciliation last so the live MLS#,
  // status note, relist ladder, and divergence note take precedence
  // over whatever the focused passes inferred. The reconciliation
  // has fresher signal (live web_search) than the focused passes
  // can produce.
  return applyListingReconciliation(baseReport, listingReconciliation);
}

// Format a human-readable update banner for re-analyzed reports. Null
// for original (never-updated) reports.
function composeUpdateNote(
  ctx: UpdateContext | null,
  allFindings: Finding[],
): string | null {
  if (!ctx) return null;
  const newCount = allFindings.filter((f) => f.from_doc_added_at).length;
  const fmt = (iso: string) => {
    // Render an ISO date as e.g. "Mar 14, 2026". Falls back to the raw
    // string if it isn't a parseable date.
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const addedCount = ctx.addedFilenames.length;
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  return (
    `Updated ${fmt(ctx.updateDate)}: ` +
    `${plural(newCount, "finding")} drawn from ` +
    `${plural(addedCount, "newly-added document")} ` +
    `since the original ${fmt(ctx.originalAnalysisDate)} analysis.`
  );
}

function sumCostRanges(ranges: CostRange[]): CostRange {
  let low = 0;
  let high = 0;
  for (const r of ranges) {
    low += Number(r.low) || 0;
    high += Number(r.high) || 0;
  }
  return { low, high };
}

function addLine(
  bucket: Map<string, Array<{ label: string; cost: CostRange }>>,
  category: string,
  label: string,
  cost: CostRange,
): void {
  const items = bucket.get(category) ?? [];
  items.push({ label, cost });
  bucket.set(category, items);
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of arr) {
    const key = s.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(s.trim());
    }
  }
  return result;
}

// Dedupe a flat findings array by normalized title key. Used to
// collapse cases where the verifier pass re-listed an item the first
// pass already produced. We keep the FIRST entry seen (typically the
// first pass's, which has fuller narrative fields populated). When
// titles are not exact matches but share a strong-enough subject
// signal (first two non-stopword tokens), they are also collapsed,
// the verifier sometimes reworded a title slightly.
function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const result: Finding[] = [];
  for (const f of findings) {
    const norm = normalizeFindingTitle(f.title);
    if (!norm) {
      result.push(f);
      continue;
    }
    if (seen.has(norm)) continue;
    seen.add(norm);
    result.push(f);
  }
  return result;
}

function normalizeFindingTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  // Strip punctuation, lowercase, drop stopwords, take the first 4
  // signal tokens. Two findings with the same first 4 signal tokens
  // are almost certainly the same issue worded slightly differently.
  const stopwords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "for",
    "in",
    "on",
    "at",
    "to",
    "with",
    "from",
    "by",
    "is",
    "are",
    "be",
    "this",
    "that",
    "may",
    "could",
    "should",
    "must",
    "possible",
    "potential",
    "likely",
  ]);
  const tokens = raw
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopwords.has(t));
  return tokens.slice(0, 4).join(" ");
}

// Identify findings that just describe what the listing already says ,
// e.g. "1 Bedroom, 1 Bath Condominium". The prompt's OBVIOUS-FACT FILTER
// asks Claude to skip these, but Claude is variable; this is the belt-
// and-suspenders pattern match. We look for telltale shapes:
//   - Title or description that's purely a unit configuration string
//     ("X bedroom Y bath condominium / townhome / SFR")
//   - Title is a property-type label with no defect language
//   - Bare boilerplate ("sold as-is", "buyer to verify dimensions")
// AND there's no cost > 0 AND no risk_if_ignored content of substance.
// If a finding has a real cost or a real risk paragraph, we keep it
// even if the title is generic.
function isObviousFactFinding(f: Finding): boolean {
  const titleLower = (f.title || "").toLowerCase().trim();
  const descLower = (f.description || "").toLowerCase().trim();
  const hasMaterialRisk =
    (f.risk_if_ignored?.length ?? 0) > 60 &&
    !/^(none|n\/a|no risk|not applicable|cosmetic)/i.test(f.risk_if_ignored);
  const hasRealCost =
    (f.cost_estimate?.high ?? 0) > 100 || (f.cost_estimate?.low ?? 0) > 100;
  // If the finding has real teeth, keep it.
  if (hasMaterialRisk || hasRealCost) return false;

  // Unit-configuration patterns: "X bed Y bath condo", "single-family
  // residence", "townhome / townhouse", "studio condo", etc.
  const unitConfigPatterns = [
    /^\d+\s*(bed(room)?s?|br)[\s,\-/]+\d+\.?\d*\s*(bath(room)?s?|ba)/i,
    /^(single[-\s]?family|sfr|townho(use|me)|condominium|condo|studio|duplex|multi[-\s]?family)/i,
    /^property is (a|an)\s/i,
  ];
  for (const re of unitConfigPatterns) {
    if (re.test(titleLower) || re.test(descLower)) return true;
  }

  // Pure boilerplate phrases that don't tell the buyer anything new.
  const boilerplatePatterns = [
    /\bsold as[-\s]?is\b/i,
    /\bbuyer to verify\b/i,
    /\bsubject to verification\b/i,
    /\binformation deemed reliable but not guaranteed\b/i,
    /\bsquare footage approximate\b/i,
  ];
  // Boilerplate only counts as "obvious" when it's the ENTIRE substance
  // of the finding, short titles that are basically just the cliché.
  if (titleLower.length < 80) {
    for (const re of boilerplatePatterns) {
      if (re.test(titleLower)) return true;
    }
  }

  return false;
}

// Drop findings whose subject is a physical feature the buyer's unit
// doesn't have. Real customer example: a Critical "balcony defect"
// finding on a ground-floor unit without a balcony. The prompt asks
// Claude to skip these, but it's variable on unit-level applicability
// when the source document describes a building-wide issue.
//
// Strategy: for each feature token we know about (balcony, top floor
// only, etc.), define a text pattern that signals the finding's
// subject. If the finding's title/description matches the pattern AND
// the property's unit_features set does NOT contain the feature, drop.
// Only runs when we have a populated unit_features list, without it
// we can't make the call confidently, so we keep the finding.
//
// For SFR property types we skip this filter entirely (single-family
// homes have all their own features by definition).
const FEATURE_PATTERNS: Array<{ feature: string; pattern: RegExp }> = [
  { feature: "balcony", pattern: /\bbalcon(y|ies)\b/i },
  { feature: "patio", pattern: /\bpatio\b/i },
  { feature: "private_yard", pattern: /\bprivate\s+yard\b|\bexclusive[-\s]?use\s+yard\b/i },
  {
    feature: "garage_stall_assigned",
    pattern: /\bassigned\s+(garage|parking|stall)\b|\bgarage\s+stall\b/i,
  },
  { feature: "in_unit_laundry", pattern: /\bin[-\s]?unit\s+laundry\b/i },
  { feature: "fireplace", pattern: /\bfireplace\b|\bwood[-\s]?burning\b/i },
  { feature: "in_unit_hvac", pattern: /\bin[-\s]?unit\s+(HVAC|furnace|AC|air\s+condition)\b/i },
  // Floor-specific signals: top-floor-only roof concerns; ground-
  // floor-only foundation/soil/slab concerns. We treat these as
  // requiring the matching feature token to be present.
  { feature: "top_floor", pattern: /\b(top[-\s]?floor|attic|roof\s+(leak|condition))\b/i },
];
function mismatchesUnitFeatures(
  f: Finding,
  unitFeatures: Set<string>,
  propertyType: string | null,
): boolean {
  // No filter for SFRs, they're presumed to have all common features.
  const typeLower = (propertyType ?? "").toLowerCase();
  const isCondoLike =
    typeLower.includes("condo") ||
    typeLower.includes("townho") ||
    typeLower.includes("pud") ||
    typeLower.includes("co-op") ||
    typeLower.includes("coop");
  if (!isCondoLike) return false;
  // No filter when we have no signal about what features the unit
  // has, better to keep the finding than guess wrong.
  if (unitFeatures.size === 0) return false;

  const blob = `${f.title ?? ""} ${f.description ?? ""} ${f.risk_if_ignored ?? ""} ${f.recommended_action ?? ""}`;
  for (const { feature, pattern } of FEATURE_PATTERNS) {
    if (pattern.test(blob) && !unitFeatures.has(feature)) {
      // Title-bar pattern match: the finding's text discusses a
      // feature this unit doesn't have. Drop.
      return true;
    }
  }
  return false;
}

// Compose a generic "Why this rating" paragraph when the analyzer
// didn't supply one. The text is intentionally neutral, it describes
// what's in the file without imagining details. The analyzer's
// editorial is always preferable when populated.
function composeFallbackRatingWhy(
  label: string,
  critical: Finding[],
  moderate: Finding[],
  cosmetic: Finding[],
): string {
  const critCount = critical.filter((f) => f.severity === "critical").length;
  const highCount = critical.filter((f) => f.severity === "high").length;
  const modCount = moderate.length;
  const cosmCount = cosmetic.length;

  if (label === "Excellent" || label === "Good") {
    return `The disclosure package shows ${critCount === 0 ? "no critical findings affecting this unit" : `${critCount} critical finding${critCount === 1 ? "" : "s"} affecting this unit`}${highCount > 0 ? ` and ${highCount} high-priority item${highCount === 1 ? "" : "s"}` : ""}. Moderate items (${modCount}) and cosmetic items (${cosmCount}) are normal for the build year and condition, and the documents reviewed support a clean read of the property.`;
  }
  if (label === "Acceptable") {
    return `${critCount > 0 ? `${critCount} critical / ` : ""}${highCount} high-priority item${highCount === 1 ? "" : "s"} surfaced on this analysis along with ${modCount} moderate item${modCount === 1 ? "" : "s"}. Each carries a specific next step in Section 4. The file is workable but the buyer should run the named follow-ups before contingency removal.`;
  }
  if (label === "Significant Concerns") {
    return `${critCount} critical and ${highCount} high-priority finding${critCount + highCount === 1 ? "" : "s"} affect this unit directly. The buyer should consider whether the dollar exposure aligns with their offer and whether any of the named follow-ups are deal-changing for them before committing.`;
  }
  if (label === "Walk Away") {
    return `The disclosure documents include items that materially threaten the buyer's ability to close (insurance, lender, or hazard blockers). Each is described in Section 4 with its source quote and next step. Confirm the items in person before continuing to spend on inspections.`;
  }
  return `Rating drivers are listed in Section 4 above. Pair this report with a walk-through and the named contingency inspections.`;
}

// Compose a "Conditions on which this rating depends" paragraph from
// the live findings. Pulls the next_step (or recommended_action) from
// each critical/high finding so the conditions list is concrete.
function composeFallbackRatingConditions(critical: Finding[]): string {
  if (critical.length === 0) {
    return "This rating assumes the buyer's inspection contingency confirms the document review and that no new material defects surface during the contingency period.";
  }
  const lines = critical.slice(0, 5).map((f) => {
    const action = f.next_step?.trim() || f.recommended_action?.trim() || "";
    if (!action) return `${f.title} closes out cleanly.`;
    // Keep the line short, first sentence of next_step.
    const firstSentence = action.split(/\.\s+/)[0].trim().replace(/\.$/, "");
    return `${firstSentence}.`;
  });
  return `This rating depends on: ${lines.join(" ")}`;
}

// Safety-net scanner: scans the entire focused-pass output for
// always-Critical-rule keywords and detects "missed" findings, cases
// where the source documents clearly contain a triggering condition
// but Claude didn't surface a Critical for it. Real-world example
// (2026-05-22): a re-run dropped the "ABS drain piping in 1984-1990
// class-action window" finding even though the previous run had it
// and the source inspection report still mentioned ABS pipe. Claude
// is stochastic, we can't guarantee every run catches every
// trigger. This scanner doesn't add findings (that requires real
// reasoning) but DOES surface a guardrail audit-log entry so the
// agent + admin can spot the gap during QA.
const ALWAYS_CRITICAL_KEYWORDS: Array<{
  rule: string;
  pattern: RegExp;
  label: string;
}> = [
  {
    rule: "ABS_recall_era",
    // TypeScript target doesn't support the `s` (dotAll) flag here.
    // Use [\s\S] to match any char including newlines.
    pattern: /\babs\s+(drain\s+)?(pipe|piping)\b[\s\S]*\b(198[4-9]|1990|class[- ]action|recall)/i,
    label: "ABS drain piping (1984-1990 class-action window)",
  },
  {
    rule: "polybutylene",
    pattern: /\bpolybutylene\b/i,
    label: "Polybutylene supply plumbing",
  },
  {
    rule: "FPE_panel",
    pattern: /\b(federal\s+pacific|stab[- ]?lok|zinsco|sylvania)\s+(panel|electric)/i,
    label: "Federal Pacific / Zinsco / Sylvania electric panel",
  },
  {
    rule: "aluminum_wiring",
    pattern: /\baluminum\s+(branch\s+)?(wiring|wire|circuit)/i,
    label: "Aluminum branch wiring",
  },
  {
    rule: "knob_and_tube",
    pattern: /\bknob[- ]?and[- ]?tube\b/i,
    label: "Knob-and-tube wiring",
  },
  {
    rule: "kitec_plumbing",
    pattern: /\bkitec\b/i,
    label: "Kitec plumbing",
  },
];

function detectMissedAlwaysCriticalRules(
  focused: FocusedAnalysis[],
  surfacedFindings: Finding[],
): Array<{ rule: string; label: string }> {
  // Gather all the text the analyzer SAW: focused-pass findings,
  // their descriptions, source quotes, etc.
  const seenText = focused
    .flatMap((p) => p.findings ?? [])
    .map(
      (f) =>
        `${f.source ?? ""} ${f.title ?? ""} ${f.description ?? ""} ${f.source_quote ?? ""} ${f.risk_if_ignored ?? ""}`,
    )
    .join(" ");

  // Set of triggered_rule values Claude actually used.
  const surfacedRules = new Set(
    surfacedFindings
      .map((f) => f.triggered_rule)
      .filter((r): r is string => Boolean(r)),
  );

  const missed: Array<{ rule: string; label: string }> = [];
  for (const candidate of ALWAYS_CRITICAL_KEYWORDS) {
    if (surfacedRules.has(candidate.rule)) continue;
    if (candidate.pattern.test(seenText)) {
      missed.push({ rule: candidate.rule, label: candidate.label });
    }
  }
  return missed;
}

// One-line summary of an HOA-paid finding that's being diverted from
// the critical/high bucket into the HOA section's concerns list.
// Includes the finding's title + dollar context so the agent reading
// the HOA section can tell what we redirected and why.
function formatHoaDivertedConcern(f: Finding): string {
  const cost = f.cost_estimate;
  const hasCost =
    cost && ((cost.low && cost.low > 0) || (cost.high && cost.high > 0));
  const costSuffix = hasCost
    ? cost!.low === cost!.high
      ? ` (HOA project cost ≈ $${cost!.high.toLocaleString()})`
      : ` (HOA project cost ≈ $${cost!.low.toLocaleString()}–$${cost!.high.toLocaleString()})`
    : " (HOA-paid)";
  return `${f.title}${costSuffix}`;
}

// Does the finding language localize the issue to a building common
// area (staircase, common hallway, exterior, courtyard, etc.)?
// Used by the divert-from-Critical step: when an HOA-paid finding's
// hazard language is paired with common-area scoping, the hazard
// belongs to the building, not the buyer's unit, and the finding
// goes to HOA concerns instead of being held as a unit-level
// Critical.
function mentionsBuildingCommonArea(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(common(\s+area|\s+element|\s+hallway|\s+stairs?(case)?|\s+walkway|\s+laundry|\s+exterior|\s+roof|\s+breezeway|\s+courtyard|\s+balcony|\s+pool)|stair(\s+landing|case|well)|breezeway|courtyard|pool deck|exterior of (the )?building|building exterior|building envelope|multiple (units|landings|stairs)|building-?wide|across the (complex|property|building)|other (units|owners)|neighbor['']?s? (unit|balcony)|adjacent units)\b/.test(
    lower,
  );
}

// Does the finding language explicitly call out the BUYER'S
// specific unit (the unit they're purchasing) as affected? Used as
// the counterweight to mentionsBuildingCommonArea, if the finding
// scope flags BOTH common-area AND this-unit, we keep Critical
// because the hazard reaches into the buyer's interior even though
// the source is the common area.
function mentionsTheBuyersUnit(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(in (the |this )?unit\b|inside (the |this )?unit\b|the unit['']?s interior|subject unit|subject property|buyer['']?s unit|inside the home|in[-\s]?unit (leak|intrusion|damage|moisture|mold))\b/.test(
    lower,
  );
}

// Decide whether finding language indicates an active hazard, water
// intrusion, structural issue, or insurance/lender-blocking condition.
// Used to PROTECT a Critical finding from the auto-downgrade we apply
// when cost_responsibility="hoa", if the HOA project addresses an
// active hazard (active leaks, mold, structural movement) we keep
// Critical because the issue, not the cost, is what makes it urgent.
function mentionsActiveHazardOrInsuranceBlock(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(active leak|active water|water intrusion|ongoing leak|mold growth|moisture[-\s]saturated|structural (crack|settlement|movement)|foundation settlement|active hazard|imminent failure|lender (will not|won't|refus)|insurer (will not|won't|refus)|cannot bind|coverage refused|not insurable|uninsurable)\b/.test(
    lower,
  );
}

// Treat common no-data sentinels as actually empty.
//
// Background: Claude occasionally returns the literal string "null"
// (four characters) for editorial paragraph fields it can't fill in,
// rather than returning JSON null. The PDF renderer's truthiness
// check ({field ? ... : null}) lets "null" through and the agent
// sees "Why this rating: null" rendered literally in the report.
// Filter sentinels at the synthesis step so EVERY render path
// (PDF download, public share, email attachment) benefits.
//
// Casing-insensitive. Trims first so "  null  " also catches.
function cleanEditorialString(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower === "null" ||
    lower === "none" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "undefined" ||
    lower === "tbd" ||
    lower === "unknown"
  ) {
    return null;
  }
  return trimmed;
}

// Pick the first non-null value across all focused-pass property_facts
// for each canonical metadata field. Used to seed the market-context
// fetch with the property characteristics the focused passes extracted.
// Returns a partial property_snapshot (only fields present in at least
// one pass).
function pickFirstFacts(
  focused: FocusedAnalysis[],
): Partial<ReportData["property_snapshot"]> {
  const out: Record<string, unknown> = {};
  const keys: Array<keyof ReportData["property_snapshot"]> = [
    "property_type",
    "year_built",
    "square_feet",
    "bedrooms",
    "bathrooms",
    "list_price",
    "days_on_market",
    "market_region",
    "apn",
    "mls_number",
    "list_date",
    "list_status",
    "parking",
    "hoa_dues_monthly",
  ];
  for (const pass of focused) {
    const facts = pass.property_facts;
    if (!facts) continue;
    for (const key of keys) {
      if (out[key as string] == null && facts[key as keyof typeof facts] != null) {
        out[key as string] = facts[key as keyof typeof facts];
      }
    }
  }
  return out as Partial<ReportData["property_snapshot"]>;
}

function mergeProperty(
  focused: FocusedAnalysis[],
  hint: string | null,
): ReportData["property_snapshot"] {
  const merged: ReportData["property_snapshot"] = {
    address: hint ?? null,
    property_type: null,
    year_built: null,
    square_feet: null,
    bedrooms: null,
    bathrooms: null,
    list_price: null,
    days_on_market: null,
    market_region: null,
    // Optional extensions, populated by whichever focused pass found
    // the source document (APN/title goes to seller_disclosures, MLS
    // / list to seller_disclosures or whatever pass got the MLS
    // printout, etc.). CRITICAL: every property_snapshot key that
    // SHOULD be merged from focused passes must be present in this
    // initializer. The merge loop iterates Object.keys(merged); any
    // field missing here gets silently dropped from the final
    // synthesized report. The Cowork-parity fields below were
    // populating in the focused-pass JSON output but vanishing in
    // synthesis until this initializer was extended.
    apn: null,
    mls_number: null,
    list_date: null,
    list_status: null,
    zestimate: null,
    parking: null,
    hoa_dues_monthly: null,
    hoa_last_increase_date: null,
    hoa_last_increase_amount: null,
    cost_reference_market: null,
    unit_number: null,
    floor: null,
    unit_features: null,
    // Cowork-parity fields from the 5f45a99 extraction-discipline
    // prompt overhaul. The analyzer prompts the focused passes to
    // populate these when present in the source documents.
    adu_status: null,
    solar_status: null,
    fema_flood_zone: null,
    hazard_zone_summary: null,
    named_sellers: null,
    named_listing_team: null,
    disclosure_prep_service: null,
    package_date: null,
  };
  // Walk passes in order (seller_disclosures first via splitDocumentsForBudget
  // ordering); fill in the first non-null value for each field.
  for (const pass of focused) {
    const facts = pass.property_facts;
    if (!facts) continue;
    for (const key of Object.keys(merged) as Array<keyof typeof merged>) {
      if (
        merged[key] == null &&
        facts[key as keyof typeof facts] != null
      ) {
        (merged as Record<string, unknown>)[key] = facts[
          key as keyof typeof facts
        ];
      }
    }
  }
  // If the agent supplied a hint, it wins over what passes extracted.
  if (hint && hint.trim()) merged.address = hint.trim();
  // Cost-reference market always gets a default so the PDF cover never
  // shows an empty value here, agents should always see which market
  // drove the cost estimates.
  if (!merged.cost_reference_market) {
    merged.cost_reference_market = "California Bay Area / Silicon Valley";
  }

  // Internal-consistency check: list_date + days_on_market must roughly
  // line up. The 1544 San Antonio St report shipped with list_date
  // 3/19/2026 (actually the SPQ signature date) + days_on_market 2 +
  // analysis date 5/27/2026, which is mathematically impossible (2-day
  // DOM with a 2.3-month-old list date). When the two disagree by more
  // than a 3-day fudge factor, we trust days_on_market and null out
  // list_date so the agent isn't shown a fabricated combination. The
  // synthesizer's completeness_audit also surfaces the disagreement
  // when populated.
  if (merged.list_date && merged.days_on_market != null) {
    const listMs = Date.parse(String(merged.list_date));
    if (Number.isFinite(listMs)) {
      const inferredDom = Math.floor(
        (Date.now() - listMs) / (24 * 60 * 60 * 1000),
      );
      const reportedDom = Number(merged.days_on_market);
      if (
        Number.isFinite(reportedDom) &&
        Math.abs(inferredDom - reportedDom) > 3
      ) {
        console.warn(
          `[analyze] property_snapshot consistency: list_date ${merged.list_date} and days_on_market ${reportedDom} disagree (inferred ${inferredDom}); nulling list_date to avoid showing a fabricated combination`,
        );
        merged.list_date = null;
      }
    }
  }

  return merged;
}

const STANDARD_CA_DISCLOSURE_TYPES = [
  "TDS",
  "SPQ",
  "AVID",
  "NHD",
  "Preliminary Title Report",
];

// Merge documents named `{base}_part_N.pdf` (artifacts of our internal
// PDF splitting) back to a single `{base}.pdf` entry. The user uploaded
// one file; we only split it server-side to fit Claude's per-document
// page limit. Their PDF inventory should reflect what they uploaded.
function consolidateSplitDocuments(
  docs: Array<{ name: string; type: string; pages?: number }>,
): Array<{ name: string; type: string; pages?: number }> {
  const groups = new Map<
    string,
    { name: string; type: string; pages: number }
  >();
  for (const d of docs) {
    const match = d.name.match(/^(.+)_part_(\d+)\.pdf$/i);
    const baseName = match ? `${match[1]}.pdf` : d.name;
    const existing = groups.get(baseName);
    if (existing) {
      existing.pages += d.pages ?? 0;
    } else {
      groups.set(baseName, {
        name: baseName,
        type: d.type,
        pages: d.pages ?? 0,
      });
    }
  }
  return Array.from(groups.values()).map((g) => ({
    name: g.name,
    type: g.type,
    pages: g.pages > 0 ? g.pages : undefined,
  }));
}

function detectMissingDocuments(
  provided: Array<{ name: string; type: string }>,
): string[] {
  // Two-channel detection: Claude's type label AND our filename-based
  // classifier. The Claude-supplied type is variable in wording
  // ("Prelim Package", "Preliminary Title", "Title Report", etc.)
  // so a strict substring match on STANDARD_CA_DISCLOSURE_TYPES
  // frequently misses real documents. We supplement with
  // classifyDocument on the filename, a file named "4._Prelim_
  // Package.pdf" classifies cleanly as "title" regardless of what
  // Claude called its type, so the "Preliminary Title Report"
  // requirement is satisfied.
  const typesLower = provided.map((d) => (d.type ?? "").toLowerCase());
  const filenameClassifications = new Set(
    provided.map((d) => classifyDocument(d.name)),
  );

  // Map required-disclosure label → which document type satisfies it.
  // If either the Claude-supplied type OR the filename classification
  // matches, we consider the requirement met. This is intentionally
  // generous; an explicit OMISSION is a stronger statement than a
  // false-positive missing.
  const requiredToType: Record<
    string,
    { typeKeywords: string[]; classifiesAs: DocumentType[] }
  > = {
    TDS: {
      typeKeywords: ["tds", "transfer disclosure"],
      classifiesAs: ["seller_disclosures"],
    },
    SPQ: {
      typeKeywords: ["spq", "seller property questionnaire"],
      classifiesAs: ["seller_disclosures"],
    },
    AVID: {
      typeKeywords: ["avid", "agent visual"],
      classifiesAs: ["seller_disclosures"],
    },
    NHD: {
      typeKeywords: ["nhd", "natural hazard", "hazard disclosure"],
      classifiesAs: ["hazards"],
    },
    "Preliminary Title Report": {
      typeKeywords: ["prelim", "preliminary title", "title report", "escrow"],
      classifiesAs: ["title"],
    },
  };

  const missing: string[] = [];
  for (const required of STANDARD_CA_DISCLOSURE_TYPES) {
    const cfg = requiredToType[required];
    if (!cfg) continue;
    const typeMatches = cfg.typeKeywords.some((kw) =>
      typesLower.some((t) => t.includes(kw)),
    );
    const filenameMatches = cfg.classifiesAs.some((t) =>
      filenameClassifications.has(t),
    );
    if (!typeMatches && !filenameMatches) {
      missing.push(required);
    }
  }
  return missing;
}

function determineOverallRating(counts: {
  criticalCount: number;
  highCount: number;
  moderateCount: number;
  cosmeticCount: number;
}): ReportData["overall_rating"] {
  const { criticalCount, highCount, moderateCount } = counts;

  // "Walk Away", multiple compounding criticals.
  if (criticalCount >= 3) {
    return {
      label: "Walk Away",
      summary: `${criticalCount} critical findings compound to create significant transaction risk. The combination of issues may not be addressable within typical contingency periods, and lender or insurance complications are likely.`,
      contingency_advice:
        "Recommend an extended inspection contingency period before any waiver. Re-evaluate whether this property fits the buyer's risk tolerance and budget for repairs.",
    };
  }

  // "Significant Concerns", one or more criticals, but addressable.
  if (criticalCount >= 1) {
    return {
      label: "Significant Concerns",
      summary: `${criticalCount} critical and ${highCount} high-severity finding${highCount === 1 ? "" : "s"} require immediate attention. ${moderateCount} additional moderate item${moderateCount === 1 ? "" : "s"} add to the work scope. All findings are negotiable but should be addressed before contingency removal.`,
      contingency_advice:
        "Do not remove inspection or loan contingencies until contractor bids are in hand on critical items and the lender has confirmed funding subject to any permit or condition requirements.",
    };
  }

  // "Acceptable", meaningful but bounded.
  if (highCount >= 2 || moderateCount >= 4) {
    return {
      label: "Acceptable",
      summary: `No critical findings, but ${highCount} high-severity and ${moderateCount} moderate item${moderateCount === 1 ? "" : "s"} reflect typical aging-property maintenance. The work is bounded and routine.`,
      contingency_advice:
        "Standard contingency timelines should suffice. Consider price adjustment or seller credit for high-severity items.",
    };
  }

  // "Good", minor findings.
  if (highCount >= 1 || moderateCount >= 1) {
    return {
      label: "Good",
      summary: `Minor findings only. No critical or major issues. ${highCount + moderateCount} item${highCount + moderateCount === 1 ? "" : "s"} represent normal homeowner maintenance.`,
      contingency_advice:
        "Proceed through standard contingencies. Findings can be addressed by the buyer post-close as routine maintenance.",
    };
  }

  // "Excellent", nothing of consequence.
  return {
    label: "Excellent",
    summary:
      "No significant findings identified. The property appears well-maintained based on the disclosed documents.",
    contingency_advice:
      "Proceed with standard inspection contingencies as a verification step.",
  };
}

// ============================================================================
// Synthesis pass (legacy Claude-driven, kept for reference; not used)
// ============================================================================

const SYNTHESIS_SYSTEM = `You are Veroax, an AI-powered disclosure analysis assistant. You are the SYNTHESIS step in a multi-pass analysis pipeline.

You receive structured findings from several focused passes (seller disclosures, inspection reports, HOA package, natural hazards), each already analyzed by Claude in a separate call. Your job is to combine them into the final 14-section disclosure analysis report.

CRITICAL RULES:

1. PRESERVE EVERY FINDING from the focused passes. Do not silently drop findings. If two passes report the same issue, dedupe by combining them into one finding with both citations. Do not invent new findings, work with what the focused passes provided.

2. SORT FINDINGS by severity into the report sections:
   - critical_findings: all severity="critical"
   - moderate_findings: all severity="moderate" (also include "high" severity here, OR pull them into critical_findings if they're at the high end)
   - Actually: critical_findings = ["critical", "high"], moderate_findings = ["moderate"], cosmetic_findings = ["cosmetic"]

3. AGGREGATE COST ESTIMATES into the cost_summary:
   - critical_high_total = sum of cost ranges for critical+high findings
   - moderate_total = sum of cost ranges for moderate findings
   - grand_total = sum of all above
   - line_items: organize cost_estimates into categories

4. OVERALL RATING based on aggregate findings:
   - "Excellent": minimal findings, all Cosmetic
   - "Good": one or two Moderate findings, no Critical
   - "Acceptable": handful of Moderate findings, no Critical
   - "Significant Concerns": one or more Critical findings AND addressable
   - "Walk Away": multiple Critical findings AND compounding

5. NEGOTIATION LEVERAGE should identify findings that give the buyer real negotiating power, typically Critical and High findings with high-confidence sourcing.

6. PROPERTY SNAPSHOT comes from any pass's property_facts. Prefer the most complete and consistent. If facts disagree across passes, surface the disagreement in completeness_audit.

7. HOA section comes from the HOA pass's hoa_facts. If no HOA pass ran, set hoa.applicable=false.

8. ENVIRONMENTAL section comes from the hazards pass's environmental_hazards.

9. PERMIT COMPLIANCE merges any pass's permit_compliance.

10. INSURANCE & LENDER RISK aggregates all insurance_lender_notes from all passes.

11. OUTSTANDING QUESTIONS deduped across all passes.

12. DOCUMENT INVENTORY combines document_inventory from all passes. documents_missing should list standard CA disclosures NOT seen in any pass.

CALL THE submit_disclosure_report TOOL EXACTLY ONCE with the complete merged report.`;

// (Legacy synthesizeReport removed, replaced by synthesizeReportInCode.
// The Claude-driven call hung in production; deterministic code synthesis
// is faster and 100% reliable.)

// ============================================================================
// Document batching for token budget
// ============================================================================

// Splits an array of documents into batches each totaling <= budget tokens.
// Uses first-fit-decreasing for reasonably tight packing: sort by tokens
// desc, place each in the first batch that has room, open a new batch if
// none fits.
function splitDocumentsForBudget(
  documents: Document[],
  budget: number,
): Document[][] {
  const sorted = [...documents].sort((a, b) => b.tokens - a.tokens);
  const batches: Array<{ docs: Document[]; total: number }> = [];

  for (const doc of sorted) {
    // Find a batch with room. If none, start a new one.
    let placed = false;
    for (const batch of batches) {
      if (batch.total + doc.tokens <= budget) {
        batch.docs.push(doc);
        batch.total += doc.tokens;
        placed = true;
        break;
      }
    }
    if (!placed) {
      batches.push({ docs: [doc], total: doc.tokens });
    }
  }

  // Defensive: if any single document exceeds budget on its own, we
  // still keep it as its own batch, it will likely get truncated by
  // Anthropic with a clear error rather than silently fail.
  return batches.map((b) => b.docs);
}

// Page-budget splitter for PDF-mode groups. PDF attachments cost
// 1500-2000+ tokens per page sent to Claude (scanned + image-heavy
// pages land at the high end), so we sub-batch by page count rather
// than by extracted-text tokens. Same bin-packing strategy as
// splitDocumentsForBudget: largest-first placement, open a new batch
// when nothing fits. PDFs that exceed PDF_PASS_PAGE_BUDGET on their
// own (e.g. an unsplit 90-page inspection report) get their own
// dedicated batch and that batch only, the bin-packer can't shrink
// a single document. lib/pdf/split.ts caps individual PDFs at 90
// pages (Claude's per-document limit); the per-CALL budget here is
// what protects against multiple smaller PDFs packing into a single
// call that exceeds the 200K context window.
function splitDocumentsByPages(
  documents: Document[],
  pageBudget: number,
): Document[][] {
  const sorted = [...documents].sort((a, b) => b.pages - a.pages);
  const batches: Array<{ docs: Document[]; pages: number }> = [];

  for (const doc of sorted) {
    let placed = false;
    for (const batch of batches) {
      if (batch.pages + doc.pages <= pageBudget) {
        batch.docs.push(doc);
        batch.pages += doc.pages;
        placed = true;
        break;
      }
    }
    if (!placed) {
      batches.push({ docs: [doc], pages: doc.pages });
    }
  }

  return batches.map((b) => b.docs);
}

// ============================================================================
// Rate-limit retry helper (same as before)
// ============================================================================

async function callWithRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let totalWaitedSec = 0;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isRateLimit =
        err instanceof Anthropic_.APIError && err.status === 429;
      if (!isRateLimit) throw err;
      if (attempt === MAX_ATTEMPTS) break;

      const retryAfterHeader =
        err instanceof Anthropic_.APIError
          ? (err.headers as Record<string, string> | undefined)?.["retry-after"]
          : undefined;
      const waitSec = parseRetryAfter(retryAfterHeader) ?? 60;

      if (totalWaitedSec + waitSec > MAX_RETRY_WAIT_SECONDS) {
        throw new Error(
          `Anthropic rate limit (429) exceeded. Required wait (${waitSec}s) ` +
            `would exceed our retry budget. Upgrading your Anthropic tier resolves this, ` +
            `see https://console.anthropic.com/settings/limits.`,
        );
      }
      totalWaitedSec += waitSec;
      await sleep(waitSec * 1000);
    }
  }
  throw lastErr ?? new Error("Anthropic call failed after retries.");
}

function parseRetryAfter(value: string | undefined): number | null {
  if (!value) return null;
  const asNum = parseInt(value, 10);
  if (Number.isFinite(asNum) && asNum > 0) return asNum;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export for callers that build progress UIs around finding counts.
export type { Finding, CostRange };
