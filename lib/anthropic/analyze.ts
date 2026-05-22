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
import { type PassGroup } from "@/lib/pdf/classify";
import {
  selectMarketReference,
  formatMarketReferenceForPrompt,
} from "@/lib/cost-reference/california-markets";

// ============================================================================
// Multi-pass disclosure analysis
//
// Single-pass analysis can't handle a typical CA disclosure package
// (~400K-800K tokens of text) within Sonnet's 200K context window.
// This module breaks the work into focused passes per document group
// — each pass small enough to fit context — then synthesizes the
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
//   seller_disclosures: PDF  — TDS check-boxes, SPQ side-by-side
//                              seller-vs-agent responses, AVID notes,
//                              and prelim title layout all carry
//                              meaning that linearized text loses.
//                              Claude sees the documents as a human
//                              would.
//   inspections:        PDF  — Inspection-report severity icons,
//                              annotated photos, and side-by-side
//                              checklists. Same reasoning.
//   hoa:                TEXT — CC&Rs, Bylaws, budgets, reserve
//                              studies, meeting minutes. Long and
//                              dry; the text alone is sufficient
//                              and the per-page cost matters here
//                              because HOA packages routinely run
//                              500+ pages.
//   hazards:            TEXT — NHD forms and earthquake-fault zone
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
//   60 pages × 2000 tokens = 120K + 50K overhead = 170K → 10K headroom.
//
// MAX_PAGES_PER_CHUNK in lib/pdf/split.ts stays at 90 — that's the
// per-document Claude limit (model-level PDF rendering cap), which is
// separate from how many docs we PACK into a single call. The packer
// below (splitDocumentsByPages) caps total packed pages per call here.
const PDF_PASS_PAGE_BUDGET = 60;

// Per-group mode. PDF mode sends native PDF attachments to Claude
// (preserves check-boxes, signatures, side-by-side seller/agent
// disclosure tables, severity icons in inspection reports — the
// stuff that drives the most consequential findings). Text mode
// sends extracted strings (cheaper, fine for layout-irrelevant
// long-form documents like HOA CC&Rs and reserve studies).
const GROUP_MODE: Record<PassGroup, "pdf" | "text"> = {
  seller_disclosures: "pdf",
  inspections: "pdf",
  hoa: "text",
  hazards: "text",
};

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
  // Filenames added in this update — used to tag finding sources.
  addedFilenames: string[];
};

export type AnalyzeInput = {
  groups: Record<PassGroup, Document[]>;
  propertyAddressHint?: string | null;
  updateContext?: UpdateContext | null;
  onPassStarted?: (group: PassGroup, subIndex: number, subTotal: number) => Promise<void>;
  onPassCompleted?: (
    group: PassGroup,
    subIndex: number,
    subTotal: number,
    usage: { input_tokens: number; output_tokens: number },
  ) => Promise<void>;
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

  // For each group that has documents, run focused pass(es). Groups can
  // run in parallel.
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
          const r = await analyzeFocusedPass(
            batch,
            group,
            mode,
            input.propertyAddressHint,
            input.updateContext ?? null,
          );
          await input.onPassCompleted?.(group, i + 1, subBatches.length, r.usage);
          return {
            group,
            sub_index: i + 1,
            sub_total: subBatches.length,
            document_count: batch.length,
            analysis: r.analysis,
            input_tokens: r.usage.input_tokens,
            output_tokens: r.usage.output_tokens,
          };
        }),
      );
      return subResults;
    });

  const all = (await Promise.all(groupPromises)).flat();
  passResults.push(...all);

  // Synthesis pass — deterministic code, not a Claude call.
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
    model: ANALYSIS_MODEL,
  };
}

// ============================================================================
// Focused per-group pass
// ============================================================================

const FOCUSED_SYSTEM_BASE = `You are Veroax, an AI-powered disclosure analysis assistant for real estate transactions in California.

You are part of a multi-pass analysis pipeline. Your job is to extract structured findings from a SUBSET of a buyer's disclosure package — the documents shown below. Another agent will combine your findings with those from other document groups (seller disclosures, inspection reports, HOA, hazards) into a final 14-section buyer report.

CRITICAL RULES:

1. GROUND EVERY FINDING IN THE DOCUMENTS PROVIDED. If a piece of information isn't in the documents you were given, do not invent it. Use null or empty arrays as appropriate. Mark findings with low confidence when the source is ambiguous.

2. SOURCE EVERY FINDING. Every Finding must cite which document (filename) and approximate page or section. Citations like "from the disclosures" are not acceptable.

3. SEVERITY RATING is weighted by (a) cost to remediate and (b) active hazard and (c) lender/insurance-blockability. Use this rubric strictly:

   - CRITICAL: any of (i) $15,000+ to remediate, (ii) active hazard, (iii) lender/insurance-blocking. THE FOLLOWING ITEMS ARE ALWAYS CRITICAL when present, regardless of remediation cost, because they routinely block insurance or conventional lending and are textbook closing-blockers in California real estate transactions:
     · Aluminum branch wiring (NM-type aluminum, common in 1965-1972 builds) — insurers and conventional lenders often refuse to bind/fund unless remediated via COPALUM or AlumiConn pigtails throughout
     · Federal Pacific Stab-Lok panels (and Zinsco/Sylvania panels) — known fire hazard; insurers commonly refuse to bind
     · Polybutylene supply plumbing (grey, white, or blue plastic with metal crimp rings) — class-action settlement subject; coverage commonly refused
     · ABS drain piping subject to the 1984-1990 class action (recall-era ABS) — defective material; many insurers exclude
     · Kitec plumbing (yellow brass fittings, PEX-AL-PEX) — class-action subject; insurer concern
     · Knob-and-tube wiring with active circuits — insurance commonly refuses
     · Active roof leak, ongoing water intrusion, or active foundation settlement
     · Visible mold growth or moisture-saturated areas
     · Visible structural cracks > 1/4 inch in load-bearing walls or foundation
     · Asbestos in friable condition (vermiculite insulation, deteriorating popcorn ceiling)
     · Lead-based paint in homes pre-1978 with children under 6 occupying or expected to occupy
     · Galvanized supply piping with documented active leaks or failures
     · Underground oil/fuel storage tank without documented decommissioning
     · Unpermitted living-area conversion, ADU, or addition affecting appraisal/financing
     For these items specifically, do NOT downgrade to High based on low remediation cost. The cost is irrelevant — the issue is lender/insurance blockability and the buyer cannot close without addressing it.

   When you mark a finding Critical SOLELY because it matched one of the always-Critical items above, populate the optional "triggered_rule" field with the corresponding short identifier so the agent can see which rule fired. Identifiers: aluminum_wiring, FPE_panel, polybutylene, ABS_recall_era, kitec_plumbing, knob_and_tube, active_water_intrusion, active_mold, structural_crack_load_bearing, asbestos_friable, lead_paint_pre1978_w_children, galvanized_active_failure, underground_oil_tank, unpermitted_living_area. Leave "triggered_rule" null when the Critical rating came from cost/hazard/lender criteria rather than a named always-Critical rule.

   - HIGH: $5,000-$15,000 OR significant future risk that's NOT on the always-Critical list above. Examples: aging HVAC (15+ years), sewer lateral repair, full electrical panel replacement (non-FPE), retaining-wall issues, deferred chimney repair.
   - MODERATE: $1,000-$5,000 OR 1-5 year horizon. Examples: water heater near end of life, deferred exterior paint, minor plumbing fixtures, dated GFCI status.
   - COSMETIC: <$1,000 OR purely aesthetic. Examples: minor drywall cracks, dated finishes, worn carpet, minor exterior touch-up.

4. CONFIDENCE reflects directness of evidence:
   - HIGH: the document explicitly states the issue.
   - MEDIUM: the document implies the issue but doesn't state it directly.
   - LOW: inferred from indirect evidence (age, regional norms, missing information).

5. COST ESTIMATES should reflect California regional pricing. Default to Bay Area / Silicon Valley when location is unclear (most expensive labor market in the state, so a safer over-estimate). ALWAYS populate property_facts.cost_reference_market with the regional reference you assumed for your numbers — e.g., "California Bay Area / Silicon Valley", "California Greater Los Angeles", "California Sacramento Valley". Agents need to see which market drove the cost estimates so they can sanity-check them against local labor.

   SCOPE THE COST ESTIMATE TO THE BUYER'S UNIT. The buyer is purchasing ONE specific address — not an interest in the building, the HOA, or the neighborhood. Cost estimates must reflect what THAT BUYER will pay (or in the case of HOA-paid items, what the buyer is exposed to). For condos, townhomes, and PUDs:
   - In-unit repairs (interior plumbing, interior electrical past the meter, in-unit HVAC, in-unit appliances, in-unit fixtures, balcony exclusive-use where the CC&Rs assign maintenance to the owner): cost_responsibility = "owner". Full cost goes in cost_estimate; counts toward the buyer's repair exposure.
   - Common-area / building-envelope repairs paid from HOA reserves or assessments (full-building roof replacement, exterior building paint, common-area plumbing risers, common boiler, elevator, lobby, common parking lot, exterior of building, structural / load-bearing common elements, common-area landscaping): cost_responsibility = "hoa". cost_estimate may show the FULL project cost (so the buyer understands the scope), but DO NOT include this dollar amount when computing the buyer's repair exposure narrative — the buyer doesn't write that check. The buyer's exposure to HOA-paid work is via reserve health, dues increases, and special-assessment risk, which belongs in the HOA section, NOT in the per-unit cost summary.
   - When CC&Rs are ambiguous about responsibility, use cost_responsibility = "shared" and explain in the description.

6. OBVIOUS-FACT FILTER. Do NOT surface a finding whose content the buyer already knew from the listing or a 30-second walkthrough. Findings must reveal something the buyer would NOT have learned from the MLS sheet or a tour. Skip:
   - Unit configuration descriptions ("1 bedroom 1 bath condominium", "2-story SFR", "single-family residence on a corner lot") — these are the listing
   - Bare property facts ("home has a kitchen", "property is in California", "the unit has a balcony") — the buyer can see the home
   - Generic disclaimer recitations ("this property is sold as-is per the contract", "buyer to verify all dimensions") — boilerplate
   - HOA boilerplate that doesn't materially change anything ("HOA has CC&Rs", "common area exists")
   A finding earns a slot in the report ONLY when it surfaces a defect, a material risk, a financial concern, a regulatory issue, a non-obvious restriction, or an inconsistency between documents. Be ruthless: if the title would make the reader say "yeah, I knew that," cut it.

7. PROPERTY SNAPSHOT FIELDS — populate property_facts richly when this document group is the source of the information. Pull from the most likely document:
   - apn (Assessor's Parcel Number): typically in the prelim title report, escrow instructions, or county tax bill (usually formatted like "123-45-678" in California).
   - mls_number: from any MLS printout, listing sheet, or BAREIS/CRMLS export.
   - list_date (ISO YYYY-MM-DD): the original listing date from the MLS printout.
   - list_status: from the MLS printout. One of "active", "pending", "sold", "withdrawn", "unknown".
   - zestimate: only if explicitly shown in the listing materials (don't invent).
   - parking: from the MLS printout or seller disclosures — describe naturally (e.g., "2-car attached garage", "1-car carport plus driveway", "street parking only").
   - hoa_dues_monthly: from HOA financial docs or the listing — the CURRENT monthly dues.
   - hoa_last_increase_date / hoa_last_increase_amount: from HOA budgets or meeting minutes — when did the dues last go up and by how much.
   Leave any of these null when the documents in your group don't contain the information.

8. CALL THE submit_focused_analysis TOOL EXACTLY ONCE with your structured analysis. Do not produce any other text output.`;

const FOCUSED_GROUP_INSTRUCTIONS: Record<PassGroup, string> = {
  seller_disclosures: `You are analyzing the SELLER DISCLOSURES group: typically the TDS (Transfer Disclosure Statement), SPQ (Seller Property Questionnaire), AVID (Agent Visual Inspection Disclosure), and any combined disclosure exports.

Focus on:
- Defects, repairs, leaks, or issues the seller affirmatively disclosed
- Items the seller marked "Yes" or "Unknown" or refused to answer on the questionnaire
- Permit issues, room additions, conversions disclosed by the seller
- Neighborhood/nuisance disclosures (flooding, drainage, prior fires, neighbor disputes)
- Items the agent flagged in the AVID visual inspection
- The property snapshot facts (address, year built, sq ft, etc.) usually appear here — populate property_facts

If a key disclosure section is blank or evasive, surface it in completeness_issues and add an outstanding_question for the agent to follow up on.`,

  inspections: `You are analyzing the INSPECTION REPORTS group: home/property inspections, termite/pest reports, mold inspections, sewer-lateral inspections, roof inspections.

Focus on:
- Every Critical and High finding the inspector called out
- Cost estimates the inspector provided (or that you can derive from regional pricing)
- Wood-destroying organism findings (active termite, conducive conditions)
- Active leaks, structural concerns, electrical/plumbing/HVAC issues
- Insurance/lender flags: FPE panels, knob-and-tube, polybutylene, ungrounded outlets
- Permit compliance issues observed during inspection

Be aggressive about marking insurance/lender-relevant items in insurance_lender_notes.`,

  hoa: `You are analyzing the HOA PACKAGE group: CC&Rs, Bylaws, Reserve Studies, Budgets, Financial Statements, Meeting Minutes, special-assessment notices.

Focus on:
- HOA financial health: reserve funding percentage, recent special assessments, pending special assessments
- Pending litigation against the HOA
- Rules that materially affect the buyer (rental restrictions, pet limits, architectural review)
- Recent dues increases or upcoming planned increases
- Major maintenance projects scheduled or deferred
- Insurance coverage gaps (e.g., earthquake not covered)
- Set hoa_facts.applicable=true and provide a summary

Treat CC&Rs/Bylaws boilerplate as low-priority — only flag genuinely consequential restrictions. Findings should be about the HOA's financial/operational health and rules that affect occupancy.

CRITICAL — COST RESPONSIBILITY FOR HOA FINDINGS:
Almost every cost-bearing finding sourced from HOA documents is HOA-paid, not owner-paid:
- Deferred building roof replacement → cost_responsibility = "hoa"
- Common-area plumbing or elevator capital project → cost_responsibility = "hoa"
- Exterior building paint cycle → cost_responsibility = "hoa"
- Reserve shortfall or planned special assessment → cost_responsibility = "hoa" on the project finding; the buyer's exposure (a future dues increase or pro-rata special assessment) belongs in hoa_facts.concerns
DO NOT mark a finding Critical because the HOA project costs $500K. The dollar figure shows the scope, but cost_responsibility="hoa" means it never lands on the buyer's repair-cost line. Severity for the BUYER reflects probability of a special assessment hitting them, the size of likely dues increases, and whether reserves are healthy enough to absorb the project — those are typically Moderate or High concerns, not Critical, unless reserves are dangerously underfunded relative to the imminent project (active hazard equivalent).

Items that ARE owner-paid even when sourced from HOA docs: balcony exclusive-use maintenance assigned to the unit owner per CC&Rs, in-unit fixtures the HOA explicitly disclaims, the buyer's pro-rata share of a special assessment ALREADY LEVIED. Tag those cost_responsibility = "owner" (or "shared" with explanation).`,

  hazards: `You are analyzing the NATURAL HAZARDS group: NHD reports, environmental disclosures, supplemental hazard documents.

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
): Promise<{
  analysis: FocusedAnalysis;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const client = getAnthropicClient();
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  for (const doc of documents) {
    // Stamp newer-than-original docs so Claude knows the temporal
    // context. We rely on the `addedAt` ISO date carried on each
    // Document for updates; original docs have it null/undefined.
    const isNewer =
      updateContext &&
      doc.addedAt &&
      doc.addedAt > updateContext.originalAnalysisDate;
    const noticeLine = isNewer
      ? ` (Added on ${doc.addedAt} — NEWER than the original analysis on ${updateContext!.originalAnalysisDate})`
      : "";

    if (mode === "pdf" && doc.pdfBase64) {
      // Native PDF attachment — Claude sees the document as a human
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
      // whatever reason — the analyzer can still ground in extracted
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
    ? `\n\nIMPORTANT — this is an UPDATE to an earlier analysis. The ` +
      `original analysis was run on ${updateContext.originalAnalysisDate}. ` +
      `The agent has added new document(s) (${updateContext.addedFilenames.join(", ")}) ` +
      `and re-requested analysis on the full combined package. ` +
      `Pay attention to whether any new document CONTRADICTS or SUPPLEMENTS ` +
      `earlier disclosures — surface that in your findings and notes.`
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

  // Regional cost reference: pick the best-match California market
  // for this report's property and inject the baseline labor + repair
  // ranges so Claude's cost estimates land in defensible territory
  // for the actual region (not a generic Bay Area default applied to
  // a Fresno listing). See lib/cost-reference/california-markets.ts
  // for sources + refresh cadence (biweekly target).
  const marketRef = selectMarketReference(propertyAddressHint ?? null);
  const marketBlock = formatMarketReferenceForPrompt(marketRef);

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
      // human review — the only source of variation is the documents
      // themselves.
      //
      // TODO(admin-settings): expose this value in a future admin
      // section of the app so an admin can tune the analyzer's
      // temperature without a code change. Default stays at 0
      // (deterministic). The admin path would let us experiment with
      // small non-zero values (0.1–0.2) for novel-form QA workflows
      // — surfacing alternate interpretations during human review —
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
// Code-based synthesis — combines focused-pass outputs into ReportData.
// Replaces the Claude-driven synthesis that was hanging in production.
// ============================================================================

function synthesizeReportInCode(
  focused: FocusedAnalysis[],
  propertyAddressHint: string | null,
  updateContext: UpdateContext | null,
): ReportData {
  // Aggregate findings (treat permit_compliance findings separately so
  // they end up in the permit section, not double-counted).
  const allFindings: Finding[] = [];
  const permitFindings: Finding[] = [];
  for (const f of focused) {
    if (Array.isArray(f.findings)) allFindings.push(...f.findings);
    if (Array.isArray(f.permit_compliance?.findings)) {
      permitFindings.push(...(f.permit_compliance!.findings ?? []));
    }
  }

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
  // language gets downgraded to High — the dollar amount drove its
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
  const filteredAllFindings = allFindings.filter((f) => !isObviousFactFinding(f));
  const filteredPermitFindings = permitFindings.filter(
    (f) => !isObviousFactFinding(f),
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

  const criticalFindings = sortFindings(
    filteredAllFindings.filter(
      (f) => f.severity === "critical" || f.severity === "high",
    ),
  );
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

  // Property snapshot — merge across passes preferring the first
  // populated value, with the agent's address hint taking top priority
  // when present.
  const property = mergeProperty(focused, propertyAddressHint);

  // Document inventory — union docs across passes, then consolidate any
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

  // Completeness audit — concat issues across passes.
  const completenessIssues = focused.flatMap((p) => p.completeness_issues ?? []);
  const completenessSummary =
    completenessIssues.length === 0
      ? "Disclosure package appears complete based on the documents reviewed."
      : `${completenessIssues.length} completeness issue${completenessIssues.length === 1 ? "" : "s"} identified across the disclosure package. Review each item before proceeding.`;

  // HOA — take the HOA pass's facts, fall back to "not applicable" if no
  // HOA pass populated it.
  const hoaSource = focused.find(
    (p) => p.hoa_facts && (p.hoa_facts.summary || p.hoa_facts.concerns?.length),
  );
  const hoa = hoaSource?.hoa_facts ?? {
    applicable: false,
    summary: "HOA documents not present or not applicable to this property.",
    concerns: [],
  };

  // Environmental — take the hazards pass's content.
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

  // Permit compliance — combine summaries and findings.
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

  // Insurance / lender risk — sort notes into the two buckets via
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
        // Default to both buckets for ambiguous items — better to
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

  // Outstanding questions — dedupe, normalize, cap to a handful.
  //
  // We were generating 20+ questions per report and the agent feedback
  // was clear: a wall of questions overwhelms the buyer and the goal is
  // to surface FACTS, then let them and the agent reach a conclusion.
  // The cap is a hard limit so the section reads like "here are the
  // questions worth asking" instead of an exhaustive interrogation.
  //
  // Ranking heuristics (we don't have semantic understanding here):
  //   1. Questions that mention a critical/high finding title get
  //      priority — those questions are directly tied to closing-
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

  // Negotiation leverage — high-confidence critical/high findings.
  const leveragePoints = criticalFindings
    .filter((f) => f.confidence === "high")
    .map((f) => `${f.title} — ${f.recommended_action}`);

  const negotiation = {
    summary:
      leveragePoints.length === 0
        ? "Limited negotiation leverage from the documented findings."
        : `${leveragePoints.length} high-confidence critical/high finding${leveragePoints.length === 1 ? "" : "s"} provide${leveragePoints.length === 1 ? "s" : ""} meaningful negotiation leverage.`,
    leverage_points: leveragePoints,
  };

  // Overall rating — rule-based on FILTERED finding counts so obvious-
  // fact junk and HOA-downgraded items don't tilt the rating.
  const overallRating = determineOverallRating({
    criticalCount: filteredAllFindings.filter((f) => f.severity === "critical")
      .length,
    highCount: filteredAllFindings.filter((f) => f.severity === "high").length,
    moderateCount: moderateFindings.length,
    cosmeticCount: cosmeticFindings.length,
  });

  // Human-readable update note. Counts filtered findings whose source
  // cited an added document — gives the agent (and the email/dashboard
  // summary) a one-liner explaining what this re-analysis actually
  // changed.
  const updateNote = composeUpdateNote(
    updateContext,
    filteredAllFindings.concat(filteredPermitFindings),
  );

  return {
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
    overall_rating: overallRating,
    update_note: updateNote,
  };
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

// Identify findings that just describe what the listing already says —
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
  // of the finding — short titles that are basically just the cliché.
  if (titleLower.length < 80) {
    for (const re of boilerplatePatterns) {
      if (re.test(titleLower)) return true;
    }
  }

  return false;
}

// Decide whether finding language indicates an active hazard, water
// intrusion, structural issue, or insurance/lender-blocking condition.
// Used to PROTECT a Critical finding from the auto-downgrade we apply
// when cost_responsibility="hoa" — if the HOA project addresses an
// active hazard (active leaks, mold, structural movement) we keep
// Critical because the issue, not the cost, is what makes it urgent.
function mentionsActiveHazardOrInsuranceBlock(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(active leak|active water|water intrusion|ongoing leak|mold growth|moisture[-\s]saturated|structural (crack|settlement|movement)|foundation settlement|active hazard|imminent failure|lender (will not|won't|refus)|insurer (will not|won't|refus)|cannot bind|coverage refused|not insurable|uninsurable)\b/.test(
    lower,
  );
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
    // Optional extensions — populated by whichever focused pass found
    // the source document (APN/title → seller_disclosures, MLS/list →
    // seller_disclosures or whatever pass got the MLS printout, etc.).
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
  // shows an empty value here — agents should always see which market
  // drove the cost estimates.
  if (!merged.cost_reference_market) {
    merged.cost_reference_market = "California Bay Area / Silicon Valley";
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
  const typesLower = provided.map((d) => (d.type ?? "").toLowerCase());
  const missing: string[] = [];
  for (const required of STANDARD_CA_DISCLOSURE_TYPES) {
    const reqLower = required.toLowerCase();
    if (!typesLower.some((t) => t.includes(reqLower) || reqLower.includes(t))) {
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

  // "Walk Away" — multiple compounding criticals.
  if (criticalCount >= 3) {
    return {
      label: "Walk Away",
      summary: `${criticalCount} critical findings compound to create significant transaction risk. The combination of issues may not be addressable within typical contingency periods, and lender or insurance complications are likely.`,
      contingency_advice:
        "Recommend an extended inspection contingency period before any waiver. Re-evaluate whether this property fits the buyer's risk tolerance and budget for repairs.",
    };
  }

  // "Significant Concerns" — one or more criticals, but addressable.
  if (criticalCount >= 1) {
    return {
      label: "Significant Concerns",
      summary: `${criticalCount} critical and ${highCount} high-severity finding${highCount === 1 ? "" : "s"} require immediate attention. ${moderateCount} additional moderate item${moderateCount === 1 ? "" : "s"} add to the work scope. All findings are negotiable but should be addressed before contingency removal.`,
      contingency_advice:
        "Do not remove inspection or loan contingencies until contractor bids are in hand on critical items and the lender has confirmed funding subject to any permit or condition requirements.",
    };
  }

  // "Acceptable" — meaningful but bounded.
  if (highCount >= 2 || moderateCount >= 4) {
    return {
      label: "Acceptable",
      summary: `No critical findings, but ${highCount} high-severity and ${moderateCount} moderate item${moderateCount === 1 ? "" : "s"} reflect typical aging-property maintenance. The work is bounded and routine.`,
      contingency_advice:
        "Standard contingency timelines should suffice. Consider price adjustment or seller credit for high-severity items.",
    };
  }

  // "Good" — minor findings.
  if (highCount >= 1 || moderateCount >= 1) {
    return {
      label: "Good",
      summary: `Minor findings only. No critical or major issues. ${highCount + moderateCount} item${highCount + moderateCount === 1 ? "" : "s"} represent normal homeowner maintenance.`,
      contingency_advice:
        "Proceed through standard contingencies. Findings can be addressed by the buyer post-close as routine maintenance.",
    };
  }

  // "Excellent" — nothing of consequence.
  return {
    label: "Excellent",
    summary:
      "No significant findings identified. The property appears well-maintained based on the disclosed documents.",
    contingency_advice:
      "Proceed with standard inspection contingencies as a verification step.",
  };
}

// ============================================================================
// Synthesis pass (legacy Claude-driven — kept for reference; not used)
// ============================================================================

const SYNTHESIS_SYSTEM = `You are Veroax, an AI-powered disclosure analysis assistant. You are the SYNTHESIS step in a multi-pass analysis pipeline.

You receive structured findings from several focused passes (seller disclosures, inspection reports, HOA package, natural hazards), each already analyzed by Claude in a separate call. Your job is to combine them into the final 14-section disclosure analysis report.

CRITICAL RULES:

1. PRESERVE EVERY FINDING from the focused passes. Do not silently drop findings. If two passes report the same issue, dedupe by combining them into one finding with both citations. Do not invent new findings — work with what the focused passes provided.

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

5. NEGOTIATION LEVERAGE should identify findings that give the buyer real negotiating power — typically Critical and High findings with high-confidence sourcing.

6. PROPERTY SNAPSHOT comes from any pass's property_facts. Prefer the most complete and consistent. If facts disagree across passes, surface the disagreement in completeness_audit.

7. HOA section comes from the HOA pass's hoa_facts. If no HOA pass ran, set hoa.applicable=false.

8. ENVIRONMENTAL section comes from the hazards pass's environmental_hazards.

9. PERMIT COMPLIANCE merges any pass's permit_compliance.

10. INSURANCE & LENDER RISK aggregates all insurance_lender_notes from all passes.

11. OUTSTANDING QUESTIONS deduped across all passes.

12. DOCUMENT INVENTORY combines document_inventory from all passes. documents_missing should list standard CA disclosures NOT seen in any pass.

CALL THE submit_disclosure_report TOOL EXACTLY ONCE with the complete merged report.`;

// (Legacy synthesizeReport removed — replaced by synthesizeReportInCode.
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
  // still keep it as its own batch — it will likely get truncated by
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
// dedicated batch and that batch only — the bin-packer can't shrink
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
            `would exceed our retry budget. Upgrading your Anthropic tier resolves this — ` +
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
