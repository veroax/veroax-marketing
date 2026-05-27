// Live regional cost-reference fetch via Claude's web_search tool.
//
// Run at the start of each disclosure analysis, scoped to the
// subject property's California market. Replaces (when successful)
// the hardcoded biweekly-refresh table in
// lib/cost-reference/california-markets.ts with current-data ranges
// for the property's actual region.
//
// This matches the cowork disclosure-analyzer skill's pattern of
// "build a regional cost reference library via web search at the
// start of each run, scoped to the property's market." Without
// this, all veroax reports anchored on a hardcoded table that the
// founder has to manually refresh, which drifts within weeks.
//
// Failure-tolerant: if web_search is unavailable, the call hits a
// hard outer timeout, or Claude can't converge on a structured
// answer, this returns null and the analyzer falls back to the
// hardcoded reference. The analysis is NEVER blocked on this.

import type Anthropic_ from "@anthropic-ai/sdk";
import { getAnthropicClient, ANALYSIS_MODEL } from "./client";

// Shape we return. The caller injects this as a prompt block in
// place of the hardcoded reference. Keep close to the cowork format
// so the focused-pass instructions don't need group-specific
// branches.
export type LiveCostReference = {
  region_label: string;
  fetched_at: string; // ISO timestamp
  // Pre-formatted block ready to inject into the focused-pass system
  // prompt. Markdown-ish, with explicit labor indices and a table of
  // common repair line items.
  prompt_block: string;
  // Source URLs Claude actually visited via web_search. Useful for
  // debugging which sites the analysis grounded against, and for an
  // admin audit trail.
  sources: string[];
};

// Tool schema for Claude's submit_cost_reference output. Mirrors
// the MarketReference shape from california-markets.ts so the
// caller can format it the same way.
const COST_REFERENCE_TOOL = {
  name: "submit_cost_reference",
  description:
    "Submit the regional cost reference for the subject property's California market. Call ONCE when web_search research is complete.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["region_label", "labor_indices", "common_repairs"],
    properties: {
      region_label: {
        type: "string",
        description:
          "Human-readable region label, e.g., 'California Bay Area / Peninsula' or 'California Greater Los Angeles / Westside'.",
      },
      labor_indices: {
        type: "object",
        additionalProperties: false,
        required: ["contractor_hourly", "electrician_hourly", "plumber_hourly"],
        properties: {
          contractor_hourly: rangeSchema(),
          electrician_hourly: rangeSchema(),
          plumber_hourly: rangeSchema(),
        },
      },
      common_repairs: {
        type: "object",
        additionalProperties: false,
        description:
          "Typical California regional ranges for each repair line item, scoped to the region above. Use current 2026 pricing.",
        properties: {
          full_roof_replacement: rangeSchema(),
          sewer_lateral: rangeSchema(),
          electrical_panel_replacement: rangeSchema(),
          hvac_replacement: rangeSchema(),
          water_heater_replacement: rangeSchema(),
          foundation_pier: rangeSchema(),
          retaining_wall: rangeSchema(),
          mold_remediation: rangeSchema(),
          asbestos_abatement: rangeSchema(),
          lead_paint_remediation: rangeSchema(),
          structural_repair: rangeSchema(),
          exterior_repaint: rangeSchema(),
          kitchen_remodel: rangeSchema(),
          bathroom_remodel: rangeSchema(),
          deck_replacement: rangeSchema(),
        },
      },
      source_notes: {
        type: "string",
        description:
          "1-2 sentence note citing which sources you used (e.g., 'HomeAdvisor 2026 CA regional data + RSMeans index + Angi quotes for San Mateo County').",
      },
    },
  },
} as const;

function rangeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["low", "high"],
    properties: {
      low: { type: "number" },
      high: { type: "number" },
    },
  };
}

type RawSubmission = {
  region_label: string;
  labor_indices: {
    contractor_hourly: { low: number; high: number };
    electrician_hourly: { low: number; high: number };
    plumber_hourly: { low: number; high: number };
  };
  common_repairs: Record<string, { low: number; high: number }>;
  source_notes?: string;
};

const COST_REFERENCE_SYSTEM = `You are the regional cost-reference researcher for Veroax, an AI-powered disclosure analysis tool for California real estate transactions.

Your job is to gather CURRENT 2026 California regional repair costs for the property's specific market using web search, then submit them via the submit_cost_reference tool. You have access to the web_search tool, use it.

What to research:
1. Identify the property's California region from the user message (Bay Area / Peninsula, Bay Area / East, Sacramento Valley, Central Valley, Greater LA, San Diego Coastal, Central Coast, North Coast, etc.).
2. Search for CURRENT 2026 regional ranges for: contractor hourly, electrician hourly, plumber hourly labor; plus the common-repair line items in the tool schema (full roof replacement, sewer lateral, electrical panel replacement, HVAC, water heater, foundation pier, retaining wall, mold remediation, asbestos abatement, lead paint, structural repair, exterior repaint, kitchen remodel, bathroom remodel, deck replacement).
3. Use sources like HomeAdvisor, Angi, RSMeans residential cost index, regional contractor surveys, CSLB publications.

ANTI-HALLUCINATION RULES:
- All ranges MUST come from web_search results you actually obtained in this session. Do not write numbers from memory.
- If web_search returns no current regional data for a specific line item, use the broader California state range and note it. Do NOT fabricate.
- region_label MUST describe the actual region your data came from, not a default.

Quality bar:
- Numbers should be defensible for a 2026 California buyer. Ranges, not point estimates.
- 0 made-up ranges beats 15 plausible inventions.
- Prefer recent (within 12 months) sources.

Call the submit_cost_reference tool EXACTLY ONCE when your research is complete. Do not emit any other text output.`;

const MAX_TOOL_ITERATIONS = 5;
const PER_REQUEST_TIMEOUT_MS = 50_000;
const FETCH_HARD_TIMEOUT_MS = 180_000;
// Hosted web_search uses count below as the per-call cap on tool
// invocations Claude can make before it must call
// submit_cost_reference.
const WEB_SEARCH_MAX_USES = 6;

type FetchInput = {
  propertyAddressHint: string | null;
  marketRegion: string | null;
};

export async function fetchLiveCostReference(
  input: FetchInput,
): Promise<LiveCostReference | null> {
  if (!input.propertyAddressHint && !input.marketRegion) {
    // No regional hint at all, fall back to the hardcoded reference.
    // The hardcoded table covers California broadly; we don't add
    // value spending tokens on a web search with no scoping.
    return null;
  }

  const userPrompt = buildUserPrompt(input);

  try {
    const result = await Promise.race<LiveCostReference | null>([
      runFetch(userPrompt),
      new Promise<null>((resolve) =>
        setTimeout(() => {
          console.warn(
            `[cost-reference] hard outer timeout after ${FETCH_HARD_TIMEOUT_MS}ms; falling back to hardcoded reference`,
          );
          resolve(null);
        }, FETCH_HARD_TIMEOUT_MS),
      ),
    ]);
    return result;
  } catch (err) {
    console.error(
      "[cost-reference] fetch failed; falling back to hardcoded reference:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function buildUserPrompt(i: FetchInput): string {
  const lines: string[] = ["Property under analysis:"];
  if (i.propertyAddressHint) lines.push(`- Address: ${i.propertyAddressHint}`);
  if (i.marketRegion) lines.push(`- Market region: ${i.marketRegion}`);
  lines.push("");
  lines.push(
    "Build the regional cost reference for THIS property's California market. Web-search current 2026 ranges for labor and the common-repair line items in the tool schema, then submit via submit_cost_reference.",
  );
  return lines.join("\n");
}

async function runFetch(userPrompt: string): Promise<LiveCostReference | null> {
  const client = getAnthropicClient();
  const sources: string[] = [];

  const messages: Anthropic_.Messages.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await Promise.race([
      client.messages.create({
        model: ANALYSIS_MODEL,
        max_tokens: 4096,
        system: COST_REFERENCE_SYSTEM,
        tools: [
          {
            type: "web_search_20250305" as Anthropic_.Messages.WebSearchTool20250305["type"],
            name: "web_search",
            max_uses: WEB_SEARCH_MAX_USES,
          } as Anthropic_.Messages.WebSearchTool20250305,
          COST_REFERENCE_TOOL as unknown as Anthropic_.Messages.Tool,
        ],
        messages,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("cost-reference per-request timed out")),
          PER_REQUEST_TIMEOUT_MS,
        ),
      ),
    ]);

    // Collect any web_search source URLs Claude actually visited
    // along the way (these come back as server_tool_use blocks).
    for (const block of response.content) {
      if (
        block.type === "server_tool_use" &&
        block.name === "web_search" &&
        typeof (block as { input?: unknown }).input === "object"
      ) {
        const input = (block as { input: Record<string, unknown> }).input;
        const query = input.query;
        if (typeof query === "string") {
          sources.push(`web_search: ${query}`);
        }
      }
    }

    // Submission tool call ends the loop.
    for (const block of response.content) {
      if (
        block.type === "tool_use" &&
        block.name === "submit_cost_reference"
      ) {
        const raw = block.input as RawSubmission;
        return {
          region_label: raw.region_label,
          fetched_at: new Date().toISOString(),
          prompt_block: formatPromptBlock(raw),
          sources,
        };
      }
    }

    if (response.stop_reason === "end_turn") {
      return null;
    }

    messages.push({ role: "assistant", content: response.content });
    // Hosted tools (web_search) return their results inline as part
    // of the assistant message Claude consumed; we don't need to
    // hand-craft a tool_result block. Just continue the loop.
  }

  return null;
}

function formatPromptBlock(r: RawSubmission): string {
  const fmtRange = (label: string, range: { low: number; high: number }) =>
    `  ${label}: $${range.low.toLocaleString()} to $${range.high.toLocaleString()}`;

  const repairLines = Object.entries(r.common_repairs)
    .map(([k, v]) => fmtRange(k.replace(/_/g, " "), v))
    .join("\n");

  return [
    `LIVE REGIONAL PRICING REFERENCE (web-searched at run start, scoped to ${r.region_label}):`,
    "",
    "Labor indices (hourly):",
    fmtRange("contractor_hourly", r.labor_indices.contractor_hourly),
    fmtRange("electrician_hourly", r.labor_indices.electrician_hourly),
    fmtRange("plumber_hourly", r.labor_indices.plumber_hourly),
    "",
    "Common repair ranges:",
    repairLines,
    "",
    r.source_notes ? `Sourcing: ${r.source_notes}` : "",
    "Calibrate cost estimates against these. Scope-specific findings still drive the final number; these are the regional baselines.",
  ]
    .filter(Boolean)
    .join("\n");
}
