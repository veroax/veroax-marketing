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
// Code-based synthesis — combines focused-pass outputs into ReportData.
// Replaces the Claude-driven synthesis that was hanging in production.
// ============================================================================

function synthesizeReportInCode(
  focused: FocusedAnalysis[],
  propertyAddressHint: string | null,
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

  const criticalFindings = allFindings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  const moderateFindings = allFindings.filter((f) => f.severity === "moderate");
  const cosmeticFindings = allFindings.filter((f) => f.severity === "cosmetic");

  // Cost summary: aggregate cost ranges from finding estimates plus the
  // explicit cost_estimates each pass produced.
  const criticalHighCosts = criticalFindings.map((f) => f.cost_estimate).filter(Boolean);
  const moderateCosts = moderateFindings.map((f) => f.cost_estimate).filter(Boolean);
  const critHighTotal = sumCostRanges(criticalHighCosts);
  const moderateTotal = sumCostRanges(moderateCosts);
  const grandTotal: CostRange = {
    low: critHighTotal.low + moderateTotal.low,
    high: critHighTotal.high + moderateTotal.high,
  };

  // Line items grouped by category.
  const lineItemsByCategory = new Map<string, Array<{ label: string; cost: CostRange }>>();
  // Findings → line items
  for (const f of criticalFindings) {
    addLine(lineItemsByCategory, "Critical & high-priority repairs", f.title, f.cost_estimate);
  }
  for (const f of moderateFindings) {
    addLine(lineItemsByCategory, "Moderate repairs (1-5 year horizon)", f.title, f.cost_estimate);
  }
  // Cost estimates from focused passes → line items (use as-given category)
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

  // Document inventory — union, dedupe by name.
  const docByName = new Map<string, { name: string; type: string; pages?: number }>();
  for (const pass of focused) {
    for (const d of pass.document_inventory ?? []) {
      if (!docByName.has(d.name)) docByName.set(d.name, d);
    }
  }
  const documentInventory = {
    documents_provided: Array.from(docByName.values()),
    documents_missing: detectMissingDocuments(Array.from(docByName.values())),
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
    findings: permitFindings,
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

  // Outstanding questions — dedupe and combine.
  const outstandingQuestions = dedupeStrings(
    focused.flatMap((p) => p.outstanding_questions ?? []),
  );

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

  // Overall rating — rule-based on finding counts and severity.
  const overallRating = determineOverallRating({
    criticalCount: allFindings.filter((f) => f.severity === "critical").length,
    highCount: allFindings.filter((f) => f.severity === "high").length,
    moderateCount: moderateFindings.length,
    cosmeticCount: cosmeticFindings.length,
  });

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
  };
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
  return merged;
}

const STANDARD_CA_DISCLOSURE_TYPES = [
  "TDS",
  "SPQ",
  "AVID",
  "NHD",
  "Preliminary Title Report",
];

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
