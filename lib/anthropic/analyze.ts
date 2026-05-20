import type Anthropic from "@anthropic-ai/sdk";
import Anthropic_ from "@anthropic-ai/sdk";
import { getAnthropicClient, ANALYSIS_MODEL } from "./client";
import { REPORT_TOOL_SCHEMA, type ReportData } from "./schema";

// Total wait budget across all retry attempts. Set conservatively below the
// route's maxDuration so we still have time for the final analysis call
// itself to run (which typically takes 60-90s).
const MAX_RETRY_WAIT_SECONDS = 150;
const MAX_ATTEMPTS = 3;

/**
 * Runs the supplied function with retry-on-429 backoff. Honors Anthropic's
 * Retry-After header when present; otherwise falls back to a sensible
 * default. Other errors propagate immediately.
 *
 * Note: rate-limit errors caused by a single request exceeding the
 * tier's per-minute limit will NOT be saved by retries — the request
 * will fail again as soon as the window opens. The fix for that case is
 * an Anthropic tier upgrade.
 */
async function callWithRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let totalWaitedSec = 0;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      // Only retry rate-limit errors. Everything else fails fast.
      const isRateLimit =
        err instanceof Anthropic_.APIError && err.status === 429;
      if (!isRateLimit) throw err;
      if (attempt === MAX_ATTEMPTS) break;

      const retryAfterHeader =
        err instanceof Anthropic_.APIError
          ? (err.headers as Record<string, string> | undefined)?.["retry-after"]
          : undefined;
      const waitSec = parseRetryAfter(retryAfterHeader) ?? 60;

      // If honoring this wait would exceed our total budget, give up early
      // rather than burn the whole maxDuration on backoff.
      if (totalWaitedSec + waitSec > MAX_RETRY_WAIT_SECONDS) {
        throw new Error(
          `Anthropic rate limit (429) exceeded. Required wait (${waitSec}s) ` +
            `would exceed our retry budget. This usually means a single ` +
            `analysis request is larger than your tier's per-minute token ` +
            `limit. Upgrading your Anthropic tier resolves this — see ` +
            `https://console.anthropic.com/settings/limits.`,
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
  // Each PDF's text content, extracted server-side. We send text rather
  // than PDF document attachments because PDFs are ~1500 tokens per page
  // (image + OCR layer), which puts a typical 500-800 page CA disclosure
  // package well over Sonnet's 200K context window. Extracted text is
  // ~300 tokens per page, keeping us comfortably under.
  // Trade-off: we lose visual fidelity (form checkboxes, inspection
  // photos, signature pages). Most analysis-relevant content is still in
  // the text — narrative responses, findings, financials, legal terms.
  documents: Array<{ filename: string; text: string; pages: number }>;
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

  // Build the message content: one text block per document with clear
  // delimiters so Claude can cite by filename, followed by the
  // instruction text.
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  for (const doc of input.documents) {
    const body = doc.text
      ? doc.text
      : `[No text could be extracted from this PDF. It may be a scan without OCR. ` +
        `Use other documents in the package to inform findings; cite this file only ` +
        `when its filename or position in the package is itself informative.]`;
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
      USER_INSTRUCTION +
      (input.propertyAddressHint
        ? `\n\nProperty address hint from the agent: ${input.propertyAddressHint}`
        : ""),
  });

  const response = await callWithRateLimitRetry(() =>
    client.messages.create({
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
    }),
  );

  // Extract the tool_use block — there should be exactly one because we
  // forced tool_choice. Defensive: locate it explicitly.
  const toolUse = response.content.find(
    (c): c is Anthropic.Messages.ToolUseBlock => c.type === "tool_use",
  );
  if (!toolUse) {
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
