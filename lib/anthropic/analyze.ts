import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, ANALYSIS_MODEL } from "./client";
import { REPORT_TOOL_SCHEMA, type ReportData } from "./schema";

const SYSTEM_PROMPT = `You are Veroax, an AI-powered disclosure analysis assistant for real estate transactions in California.

Your task is to analyze a buyer's disclosure package and produce a structured 14-section report that helps a licensed real estate agent advise their client.

CRITICAL RULES:

1. GROUND EVERY FINDING IN THE DOCUMENTS. If a piece of information isn't in the provided documents, do not invent it. Use null or empty arrays as appropriate. Mark findings with low confidence when the source is ambiguous.

2. SOURCE EVERY FINDING. Every Finding must cite which document and which page (e.g., "AVID p.4", "General Inspection p.12", "HOA Financial Statement p.2"). Generic citations like "the disclosures" are not acceptable.

3. SEVERITY RATING IS WEIGHTED BY (a) cost to remediate and (b) active hazard to occupants — not gut instinct.
   - CRITICAL: $15,000+ cost OR active hazard OR lender/insurance-blocking issue. Examples: unpermitted living-area conversion, active roof leak, FPE Stab-Lok panel, foundation settlement, mold, lead paint in homes with children.
   - HIGH: $5,000-$15,000 cost OR significant future risk. Examples: aging HVAC, sewer lateral repair, electrical panel replacement.
   - MODERATE: $1,000-$5,000 OR 1-5 year horizon. Examples: water heater near end of life, deferred exterior paint.
   - COSMETIC: <$1,000 OR purely aesthetic. Examples: minor drywall cracks, dated finishes.

4. CONFIDENCE TAGS reflect how directly the finding is supported.
   - HIGH: the document explicitly states the issue.
   - MEDIUM: the document implies the issue but doesn't state it directly.
   - LOW: the issue is inferred from indirect evidence (age, regional norms, missing information).

5. COST ESTIMATES should reflect California regional pricing for the indicated market. Provide a low-high range. When the market is unclear, use Bay Area as the default (most expensive labor market in California).

6. NEGOTIATION LEVERAGE should identify findings that give the buyer real negotiating power — typically Critical and High findings with high-confidence sourcing. Don't list every Moderate item as "leverage."

7. OVERALL RATING uses this scale:
   - "Excellent": minimal findings, all Cosmetic
   - "Good": one or two Moderate findings, no Critical
   - "Acceptable": handful of Moderate findings, no Critical
   - "Significant Concerns": one or more Critical findings AND the issues are negotiable/addressable
   - "Walk Away": multiple Critical findings AND the issues compound (e.g., unpermitted work + active leak + failing roof + lender risk)

8. DO NOT include legal advice, appraisal opinions, or contractor recommendations. You are a software tool, not a licensed professional.

9. CALL THE submit_disclosure_report TOOL EXACTLY ONCE with the complete report. Do not produce any other text output.`;

const USER_INSTRUCTION = `Analyze the attached disclosure package and submit the complete 14-section report via the submit_disclosure_report tool.

Use the property address hint (if provided) to set the market_region. Otherwise, extract the market_region from the address in the documents.`;

type AnalyzeInput = {
  pdfs: Array<{ filename: string; base64: string }>;
  propertyAddressHint?: string | null;
};

export type AnalyzeResult = {
  report: ReportData;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  model: string;
};

export async function analyzeDisclosurePackage(
  input: AnalyzeInput,
): Promise<AnalyzeResult> {
  const client = getAnthropicClient();

  // Build the message content: each PDF as a document block, followed by
  // the text instruction. Claude reads PDFs natively.
  const content: Anthropic.Messages.ContentBlockParam[] = input.pdfs.map((pdf) => ({
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: pdf.base64,
    },
    // Title helps Claude reference the document by filename in citations.
    title: pdf.filename,
  }));

  content.push({
    type: "text",
    text:
      USER_INSTRUCTION +
      (input.propertyAddressHint
        ? `\n\nProperty address hint from the agent: ${input.propertyAddressHint}`
        : ""),
  });

  const response = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [REPORT_TOOL_SCHEMA],
    tool_choice: { type: "tool", name: REPORT_TOOL_SCHEMA.name },
    messages: [
      {
        role: "user",
        content,
      },
    ],
  });

  // Extract the tool_use block — there should be exactly one because we
  // forced tool_choice. Defensive: locate it explicitly.
  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `Claude did not return a tool_use block. stop_reason=${response.stop_reason}`,
    );
  }

  return {
    report: toolUse.input as ReportData,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    model: response.model,
  };
}
