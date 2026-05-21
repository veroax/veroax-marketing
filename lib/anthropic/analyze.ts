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
} from "./schema";
import { type PassGroup } from "@/lib/pdf/classify";

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
// ============================================================================

// Per-pass document-token budget. Stays well below Sonnet's 200K
// context, leaving room for system prompt, tool schema, and reasoning.
const PASS_TOKEN_BUDGET = 175_000;
const MAX_RETRY_WAIT_SECONDS = 150;
const MAX_ATTEMPTS = 3;

export type Document = {
  filename: string;
  text: string;
  pages: number;
  tokens: number;
};

export type AnalyzeInput = {
  groups: Record<PassGroup, Document[]>;
  propertyAddressHint?: string | null;
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
      const subBatches = splitDocumentsForBudget(docs, PASS_TOKEN_BUDGET);

      const subResults = await Promise.all(
        subBatches.map(async (batch, i) => {
          await input.onPassStarted?.(group, i + 1, subBatches.length);
          const r = await analyzeFocusedPass(batch, group, input.propertyAddressHint);
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

  // Synthesis pass.
  await input.onSynthesisStarted?.();
  const synthesis = await synthesizeReport(
    passResults.map((p) => p.analysis),
    input.propertyAddressHint,
  );
  await input.onSynthesisCompleted?.(synthesis.usage);

  const totalInput =
    passResults.reduce((sum, p) => sum + p.input_tokens, 0) +
    synthesis.usage.input_tokens;
  const totalOutput =
    passResults.reduce((sum, p) => sum + p.output_tokens, 0) +
    synthesis.usage.output_tokens;

  return {
    report: synthesis.report,
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

3. SEVERITY RATING is weighted by (a) cost to remediate and (b) active hazard. Use this rubric strictly:
   - CRITICAL: $15,000+ to remediate, OR active hazard, OR lender/insurance-blocking. Examples: unpermitted living-area conversion, active roof leak, FPE Stab-Lok panel, foundation settlement, mold.
   - HIGH: $5,000-$15,000 OR significant future risk. Examples: aging HVAC, sewer lateral repair, electrical panel replacement, retaining-wall issues.
   - MODERATE: $1,000-$5,000 OR 1-5 year horizon. Examples: water heater near end of life, deferred exterior paint.
   - COSMETIC: <$1,000 OR purely aesthetic.

4. CONFIDENCE reflects directness of evidence:
   - HIGH: the document explicitly states the issue.
   - MEDIUM: the document implies the issue but doesn't state it directly.
   - LOW: inferred from indirect evidence (age, regional norms, missing information).

5. COST ESTIMATES should reflect California regional pricing. Default to Bay Area / Silicon Valley when location is unclear (most expensive labor market in the state, so a safer over-estimate).

6. CALL THE submit_focused_analysis TOOL EXACTLY ONCE with your structured analysis. Do not produce any other text output.`;

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

Treat CC&Rs/Bylaws boilerplate as low-priority — only flag genuinely consequential restrictions. Findings should be about the HOA's financial/operational health and rules that affect occupancy.`,

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
  propertyAddressHint?: string | null,
): Promise<{
  analysis: FocusedAnalysis;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const client = getAnthropicClient();
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  for (const doc of documents) {
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
        `Pages: ${doc.pages}\n\n` +
        `${body}\n\n` +
        `===== END DOCUMENT (${doc.filename}) =====`,
    });
  }

  content.push({
    type: "text",
    text:
      `Analyze the documents above and submit your findings via the ` +
      `submit_focused_analysis tool.` +
      (propertyAddressHint
        ? `\n\nProperty address hint from the agent: ${propertyAddressHint}`
        : ""),
  });

  const systemPrompt = `${FOCUSED_SYSTEM_BASE}\n\n${FOCUSED_GROUP_INSTRUCTIONS[group]}`;

  const response = await callWithRateLimitRetry(() =>
    client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 12000,
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
// Synthesis pass
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

async function synthesizeReport(
  focusedResults: FocusedAnalysis[],
  propertyAddressHint?: string | null,
): Promise<{
  report: ReportData;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const client = getAnthropicClient();

  // Build a structured JSON description of the focused-pass outputs.
  const payload = {
    property_address_hint: propertyAddressHint ?? null,
    focused_passes: focusedResults,
  };

  const response = await callWithRateLimitRetry(() =>
    client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 16000,
      system: SYNTHESIS_SYSTEM,
      tools: [REPORT_TOOL_SCHEMA],
      tool_choice: { type: "tool", name: REPORT_TOOL_SCHEMA.name },
      messages: [
        {
          role: "user",
          content: `Synthesize the focused-pass outputs below into the final 14-section disclosure report.\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    }),
  );

  const toolUse = response.content.find(
    (c): c is Anthropic.Messages.ToolUseBlock => c.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error(
      `Synthesis pass did not return a tool_use block. stop_reason=${response.stop_reason}`,
    );
  }

  return {
    report: toolUse.input as ReportData,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

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
