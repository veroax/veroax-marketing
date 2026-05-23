import Anthropic_ from "@anthropic-ai/sdk";
import { getAnthropicClient, ANALYSIS_MODEL } from "./client";
import type { ReportData } from "./schema";

// Live market-context fetch using Claude's web_search tool. Runs in
// parallel with the focused-analysis passes — by the time synthesis
// stitches everything together this returns a market_context object
// with current mortgage rates, regional median pricing, and
// comparable sales the analyzer couldn't extract from the disclosure
// PDFs alone.
//
// Failure-tolerant: any error in the search/synthesis returns null
// and the synthesizer falls back to whatever individual focused
// passes produced (usually nothing). Latency is ~10-30 seconds with
// web_search enabled; cost is approximately $0.10-0.50 per call
// depending on how many searches Claude runs.

export type MarketContext = NonNullable<ReportData["market_context"]>;

type MarketContextInput = {
  propertyAddress: string | null;
  marketRegion: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  listPrice: number | null;
};

// Anthropic's structured-output tool schema for the market_context
// section. Mirrors the shape on ReportData.market_context.
const MARKET_CONTEXT_TOOL = {
  name: "submit_market_context",
  description:
    "Submit the live market context for the buyer's unit. Call this tool exactly once with the data you've gathered from web search. Leave any field null when search results don't reliably support the value — better to omit than to fabricate.",
  input_schema: {
    type: "object" as const,
    required: ["summary"],
    properties: {
      summary: {
        type: "string",
        description:
          "2-3 sentence narrative placing this unit in its sub-segment of the local market — e.g., '1-bedroom condos in the Sierra Crest area are currently listing at a tighter price spread than two-bed plans because the buyer pool is investor-heavy.'",
      },
      monthly_carrying_cost: {
        type: ["string", "null"],
        description:
          "Estimated monthly carrying cost at the list price: PITI + HOA. Show the calculation context briefly. Example: '$3,500-$3,650/month at 20% down, 6.625% rate, $540 HOA, $486 property tax at new reassessment.'",
      },
      mortgage_rate_range: {
        type: ["string", "null"],
        description:
          "Current 30-year fixed mortgage rate range in California, today. Example: '6.49% - 6.75% on a 30-year fixed in California across major lenders.' Source from current rate aggregators (Bankrate, NerdWallet, Mortgage News Daily).",
      },
      median_price: {
        type: ["string", "null"],
        description:
          "Median price for the unit's segment (e.g., 'median condo price $1,125,000 in Santa Clara County, May 2026'). Source from Redfin, Zillow, CAR market reports, or local MLS aggregates.",
      },
      median_dom: {
        type: ["integer", "null"],
        description: "Median days on market for the unit's segment.",
      },
      comparable_units: {
        type: ["array", "null"],
        description:
          "3-5 within-complex + adjacent-building comparable units. Each item is a label + status + optional note. Pull from Redfin/Zillow sold listings and current active listings near the subject. ONLY include comps you can actually source — do not invent.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                "Address + size descriptor. Example: '947 Catkin Ct, 658 sqft 1BR/1BA'.",
            },
            status: {
              type: "string",
              description:
                "Sale or listing status with price. Example: 'Sold $435,000' or 'Listed $468,000'.",
            },
            note: {
              type: ["string", "null"],
              description: "Optional context — sale date, condition, etc.",
            },
          },
          required: ["label", "status"],
        },
      },
    },
  },
};

const MARKET_CONTEXT_SYSTEM = `You are the market-context researcher for Veroax, an AI-powered disclosure analysis tool for California real estate transactions.

Your job is to gather LIVE market data for the buyer's unit using web search, then submit it via the submit_market_context tool. You have access to the web_search tool — use it.

What to search for:
1. Current 30-year fixed mortgage rates in California (Bankrate, NerdWallet, Mortgage News Daily today).
2. Median price + days-on-market for the unit's segment. Search like: "Santa Clara County 1-bedroom condo median price 2026" or "Bay Area condo sales May 2026".
3. Comparable sales — within the same complex + adjacent buildings. Search like: "945 Catkin Ct San Jose recent sales" or "Sierra Crest condo sold prices San Jose".
4. Calculate the monthly carrying cost at the list price assuming 20% down, the current 30-year fixed rate range, and the disclosed HOA dues + estimated property tax at the new reassessed value (1.25% of list price annually divided by 12).

Constraints:
- Source from CURRENT data — anything older than 90 days is stale.
- Do NOT fabricate numbers. If a search doesn't return a credible source, leave the field null.
- Do NOT include comps you can't actually find. 3-5 real comps beats 8 made-up ones.
- Keep the summary 2-3 sentences. It's a placement paragraph, not a market report.

Call the submit_market_context tool EXACTLY ONCE when your research is complete. Don't emit any other text output.`;

const MAX_TOOL_ITERATIONS = 8;
const PER_REQUEST_TIMEOUT_MS = 90_000;

export async function fetchMarketContext(
  input: MarketContextInput,
): Promise<MarketContext | null> {
  const userPrompt = buildUserPrompt(input);

  try {
    const result = await runWithWebSearch(userPrompt);
    return result;
  } catch (err) {
    // Market-context fetch is non-fatal — disclosure analysis must
    // proceed even when web search is unavailable. Log + return null.
    console.error(
      "[market-context] fetch failed; falling back to null:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function buildUserPrompt(i: MarketContextInput): string {
  const lines: string[] = ["Property under analysis:"];
  if (i.propertyAddress) lines.push(`- Address: ${i.propertyAddress}`);
  if (i.propertyType) lines.push(`- Type: ${i.propertyType}`);
  const bedBath: string[] = [];
  if (i.bedrooms != null) bedBath.push(`${i.bedrooms} bd`);
  if (i.bathrooms != null) bedBath.push(`${i.bathrooms} ba`);
  if (i.squareFeet != null) bedBath.push(`${i.squareFeet} sqft`);
  if (bedBath.length > 0) lines.push(`- Configuration: ${bedBath.join(" / ")}`);
  if (i.listPrice != null) lines.push(`- List price: $${i.listPrice.toLocaleString()}`);
  if (i.marketRegion) lines.push(`- Market region: ${i.marketRegion}`);
  lines.push("");
  lines.push(
    "Research the market context for this specific unit. Use web search to find current mortgage rates, the segment's median price and days-on-market, and at least 3 real comparable sales (within-complex or adjacent buildings). Then submit your findings via the submit_market_context tool.",
  );
  return lines.join("\n");
}

async function runWithWebSearch(
  userPrompt: string,
): Promise<MarketContext | null> {
  const client = getAnthropicClient();

  // Multi-turn loop: Claude may call web_search several times before
  // it has enough data to call submit_market_context. We iterate
  // up to MAX_TOOL_ITERATIONS, feeding tool_result blocks back each
  // turn. The loop exits when Claude calls submit_market_context.
  const messages: Anthropic_.Messages.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await Promise.race([
      client.messages.create({
        model: ANALYSIS_MODEL,
        max_tokens: 4096,
        system: MARKET_CONTEXT_SYSTEM,
        tools: [
          // Anthropic's hosted web_search tool. Renders as
          // {"type":"web_search_20250305","name":"web_search","max_uses":N}
          // in the API. Capped at 6 searches per call so we don't
          // burn an unbounded number of requests on one analysis.
          {
            type: "web_search_20250305" as Anthropic_.Messages.WebSearchTool20250305["type"],
            name: "web_search",
            max_uses: 6,
          } as Anthropic_.Messages.WebSearchTool20250305,
          MARKET_CONTEXT_TOOL as unknown as Anthropic_.Messages.Tool,
        ],
        messages,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("market-context fetch timed out")),
          PER_REQUEST_TIMEOUT_MS,
        ),
      ),
    ]);

    // Look for submit_market_context tool_use; if present we're done.
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "submit_market_context") {
        return block.input as MarketContext;
      }
    }

    // If Claude stopped without calling submit_market_context, exit.
    if (response.stop_reason === "end_turn") {
      return null;
    }

    // Otherwise feed Claude's response back as an assistant message
    // and let the next iteration continue. The web_search tool's
    // results are server-side and already attached to the assistant
    // turn; we just need to echo the turn back so Claude can read
    // its own prior tool calls.
    messages.push({ role: "assistant", content: response.content });
    // After a tool_use block we need to provide a user-turn with
    // tool_result blocks. The web_search tool is HOSTED on
    // Anthropic's side, so its results are auto-attached to the
    // assistant turn — we don't need to provide tool_result. We
    // just need a user turn to continue. An empty-content user
    // turn is invalid, so we provide a brief continuation note.
    messages.push({
      role: "user",
      content: "Continue your research and then call submit_market_context.",
    });
  }

  // Hit the iteration cap without a submit. Return null so the
  // synthesizer falls back gracefully.
  return null;
}
