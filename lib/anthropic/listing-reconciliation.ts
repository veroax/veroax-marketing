// Listing-data reconciliation: compares three sources of listing
// information and reconstructs the property's relist history.
//
// Background: California disclosure packages typically include a
// static MLS print-out as one of the source PDFs. That print-out is
// a snapshot from whenever the package was assembled, often weeks
// before the agent runs the analysis. In the meantime listings get
// cancelled and re-listed at different prices. A recent run shipped
// with the wrong list price because the static MLS print-out showed
// the old listing and the agent's Zillow URL showed a current re-list
// at a different price.
//
// This module takes the three sources we have and reconciles them:
//   (a) MLS print-out PDF in the disclosure package, text already
//       extracted at finalize time and stored in reports.listing_text.
//   (b) Listing URL the agent supplied on the upload form (Zillow,
//       Redfin, Realtor.com, Compass, etc.), stored in
//       reports.listing_url.
//   (c) Fresh live web search keyed on the property's address +
//       APN + any prior MLS numbers discovered from (a) or (b).
//
// Authority order: (c) > (b) > (a). The package's MLS print-out is
// historical reference, NEVER the current truth (by construction it
// can't be more recent than the package's assembly date). The
// listing URL is more current than the package but can itself be
// stale (the agent might have entered a Zillow URL weeks ago that
// has since changed). The live web search is the freshest signal we
// have at analysis time.
//
// Divergence handling: when the three sources disagree on MLS
// number, list price, status, or DOM, the reconciliation surfaces
// a `has_divergence` flag and produces a relist ladder describing
// the seller's pricing trajectory. The agent sees the ladder on
// the report detail page and in the report's Market Context section.

import type Anthropic_ from "@anthropic-ai/sdk";
import { getAnthropicClient, ANALYSIS_MODEL } from "./client";

// Per-source observation, what one source said about the listing.
// All fields nullable because not every source surfaces every field;
// the Zillow URL might give us list_price + DOM but not MLS#, and
// the package's MLS print-out might have all four.
export type ListingSourceObservation = {
  source: "package_mls" | "listing_url" | "live_search";
  // Human-readable label of where this observation came from. For
  // package_mls: "MLS print-out included in disclosure package
  // (file 25._MLS_print_out.pdf)". For listing_url: the URL itself.
  // For live_search: which sites the web_search visited.
  source_label: string;
  mls_number: string | null;
  list_price: number | null;
  // Match the strings the listing sites use. Normalize at render
  // time when we render to the buyer.
  status: "active" | "pending" | "contingent" | "cancelled" | "withdrawn" | "sold" | "expired" | "unknown" | null;
  list_date: string | null; // ISO YYYY-MM-DD
  days_on_market: number | null;
  // Free-form notes the source provided that don't fit the structured
  // fields. Example: "the Zillow page shows 'recently sold for $1.4M
  // on 4/3/2026' in the price-history widget."
  notes: string | null;
  // ISO timestamp this source was fetched / scraped / extracted.
  observed_at: string;
};

// One step in the seller's relist history. The ladder reconstructs
// the listing's evolution from the union of all three sources.
export type RelistEvent = {
  date: string | null; // ISO YYYY-MM-DD
  mls_number: string | null;
  list_price: number | null;
  status: "listed" | "price_change" | "cancelled" | "withdrawn" | "pending" | "sold";
  // 1-2 sentence narrative the agent + buyer can read directly.
  // Example: "Listed 3/19 at $1,178,000 (MLS 82039496); cancelled
  // 4/24."
  narrative: string;
};

export type ListingReconciliation = {
  // ISO timestamp this whole reconciliation ran.
  reconciled_at: string;
  // The three source observations. Any can be null when that source
  // was unavailable (e.g., agent didn't provide a listing URL).
  sources: {
    package_mls: ListingSourceObservation | null;
    listing_url: ListingSourceObservation | null;
    live_search: ListingSourceObservation | null;
  };
  // The reconciled "current truth" for the headline display, chosen
  // from the sources by authority. live_search wins, then
  // listing_url, then package_mls. Null when all three sources
  // failed.
  current: {
    source: "live_search" | "listing_url" | "package_mls";
    mls_number: string | null;
    list_price: number | null;
    status: ListingSourceObservation["status"];
    list_date: string | null;
    days_on_market: number | null;
  } | null;
  // Prior MLS numbers we observed across sources that are no longer
  // active. Used to render the "current; prior MLS X and Y
  // cancelled" suffix on the property snapshot.
  prior_mls_numbers: string[];
  // Reconstructed seller pricing trajectory across the listing's
  // history. Renders in the report's Market Context section when
  // there's more than one event (otherwise a single-line current
  // status is enough).
  relist_ladder: RelistEvent[];
  // True when the sources disagree on any of: MLS#, list_price,
  // status, list_date. The agent sees a banner on the report detail
  // page when this is true; the report's Market Context section
  // also renders the ladder.
  has_divergence: boolean;
  // 1-2 sentence summary of what the divergence looked like. Only
  // populated when has_divergence=true. Example: "The package's MLS
  // print-out shows $1,178,000 listed Mar 19 (MLS 82039496); Zillow
  // shows a current relist at $998,000 (MLS 82044514) effective
  // 5/22. The price has dropped roughly $180,000 since the package
  // was assembled."
  divergence_note: string | null;
  // Recommended default source for the report's headline price.
  // Always 'live_search' when source (c) succeeded; falls back
  // through (b) then (a) when prior sources fail. The agent can
  // override via the report detail page.
  recommended_source: "live_search" | "listing_url" | "package_mls" | null;
};

// Tool schema submitted by Claude at the end of the reconciliation
// call. Mirrors the ListingReconciliation type above.
const RECONCILE_TOOL = {
  name: "submit_listing_reconciliation",
  description:
    "Submit the final reconciled view of the property's listing data. Call ONCE when all three sources have been investigated.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["sources", "prior_mls_numbers", "relist_ladder", "has_divergence", "recommended_source"],
    properties: {
      sources: {
        type: "object",
        additionalProperties: false,
        properties: {
          package_mls: observationSchema(),
          listing_url: observationSchema(),
          live_search: observationSchema(),
        },
      },
      prior_mls_numbers: {
        type: "array",
        items: { type: "string" },
        description:
          "Distinct MLS numbers you observed across sources that are no longer active. Empty array when there are no prior MLS numbers.",
      },
      relist_ladder: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["status", "narrative"],
          properties: {
            date: { type: ["string", "null"] },
            mls_number: { type: ["string", "null"] },
            list_price: { type: ["number", "null"] },
            status: {
              type: "string",
              enum: ["listed", "price_change", "cancelled", "withdrawn", "pending", "sold"],
            },
            narrative: {
              type: "string",
              description:
                "1-2 sentence event description, e.g., 'Listed 3/19 at $1,178,000 (MLS 82039496); cancelled 4/24.'",
            },
          },
        },
        description:
          "Ordered events reconstructed from the three sources. Empty array when only the current listing is known.",
      },
      has_divergence: {
        type: "boolean",
        description:
          "True when the three sources disagree on MLS number, list price, status, or list date. False when they agree or only one source returned data.",
      },
      divergence_note: {
        type: ["string", "null"],
        description:
          "1-2 sentence summary of how the sources disagreed. Populate when has_divergence=true; null when sources agreed.",
      },
      recommended_source: {
        type: "string",
        enum: ["live_search", "listing_url", "package_mls"],
        description:
          "The source we recommend the report's headline price come from. Default to 'live_search' when it returned data, fall back to 'listing_url' then 'package_mls'.",
      },
    },
  },
} as const;

function observationSchema() {
  return {
    type: ["object", "null"],
    additionalProperties: false,
    required: ["source", "source_label", "observed_at"],
    properties: {
      source: {
        type: "string",
        enum: ["package_mls", "listing_url", "live_search"],
      },
      source_label: { type: "string" },
      mls_number: { type: ["string", "null"] },
      list_price: { type: ["number", "null"] },
      status: {
        type: ["string", "null"],
        enum: [
          "active",
          "pending",
          "contingent",
          "cancelled",
          "withdrawn",
          "sold",
          "expired",
          "unknown",
          null,
        ],
      },
      list_date: { type: ["string", "null"] },
      days_on_market: { type: ["number", "null"] },
      notes: { type: ["string", "null"] },
      observed_at: { type: "string" },
    },
  };
}

const RECONCILE_SYSTEM = `You are the listing-data reconciliation researcher for Veroax, an AI-powered disclosure analysis tool for California real estate transactions.

Your job is to reconcile up to three sources of listing data for a single property and submit your findings via the submit_listing_reconciliation tool. You have web_search access; use it.

THE THREE SOURCES (provided in the user message):
  (a) PACKAGE_MLS: the MLS print-out PDF that the listing agent included inside the disclosure package. You will see its extracted text. This is a HISTORICAL snapshot from whenever the package was assembled. It is NEVER the current truth, by definition it cannot be more recent than the package's assembly date.
  (b) LISTING_URL: a Zillow / Redfin / Realtor.com / Compass URL the buyer's agent entered on the upload form. Visit it via web_search. This is usually more current than (a) but can be stale (the agent might have entered the URL weeks ago and the listing has changed since).
  (c) LIVE_SEARCH: you do a fresh web search RIGHT NOW for the property's current MLS listing, keyed on the property's address + APN + any MLS numbers you discovered from (a) or (b). Look for the most recent listing for THIS exact property. Search like 'address mls listing 2026' or '<MLS#> status' or '<address> current listing zillow'. This is the freshest signal we have.

AUTHORITY ORDER:
  live_search > listing_url > package_mls

The package MLS print-out is HISTORICAL reference. The buyer needs to know the CURRENT listing, not what was true when the package was assembled.

FOR EACH SOURCE, capture: mls_number, list_price, status (active / pending / contingent / cancelled / withdrawn / sold / expired / unknown), list_date (ISO YYYY-MM-DD), days_on_market. Leave any field null when the source doesn't surface it; do not invent.

DIVERGENCE DETECTION:
- has_divergence = true when ANY of {mls_number, list_price, status, list_date} disagree across two or more sources.
- has_divergence = false when sources agree, OR when only one source returned data, OR when sources surface different fields but don't actually conflict (one source had MLS#, another had price, no overlap = no divergence).
- When divergence is real, populate divergence_note with a 1-2 sentence summary. Example: "The package's MLS print-out shows $1,178,000 listed Mar 19 (MLS 82039496); Zillow shows a current relist at $998,000 (MLS 82044514) effective 5/22. The price has dropped roughly $180,000 since the package was assembled."

RELIST LADDER RECONSTRUCTION:
- Build relist_ladder as an ordered list of events from the union of all three sources.
- A "listed" event marks a new MLS number going active at a price. A "cancelled" / "withdrawn" event marks an MLS number going inactive. A "price_change" event marks a list price change within the same MLS number.
- Use the listing sites' price-history widgets when web_search returns them, those are gold for this kind of reconstruction.
- Example: [{date: "2026-03-19", mls_number: "82039496", list_price: 1178000, status: "listed", narrative: "Listed 3/19 at $1,178,000 (MLS 82039496)."}, {date: "2026-04-24", mls_number: "82039496", status: "cancelled", narrative: "Cancelled 4/24."}, {date: "2026-04-24", mls_number: "82044514", list_price: 1138000, status: "listed", narrative: "Relisted 4/24 at $1,138,000 (MLS 82044514)."}]
- Empty array [] when there's only a single current listing and no relist history is reconstructable.

PRIOR MLS NUMBERS:
- prior_mls_numbers = the distinct MLS numbers you saw that are no longer the active listing. Used to render 'current; prior MLS X and Y cancelled' on the property snapshot.
- Do not include the current live MLS in this list.

RECOMMENDED SOURCE (founder rule, do NOT deviate):

CASE A, sources agree (has_divergence = false):
- 'listing_url' when source (b) returned data. Even though (c) is technically fresher, when all sources agree on price/MLS/status, the agent has been working from the Zillow listing they entered on the upload form and that's the report's natural anchor.
- 'live_search' when (b) is null but (c) returned data.
- 'package_mls' only when (b) and (c) both failed.

CASE B, sources disagree (has_divergence = true):
- 'live_search' when source (c) returned a credible result. The freshest signal wins when there's actual conflict.
- 'listing_url' when (c) failed but (b) is intact.
- 'package_mls' only when (c) and (b) both failed. The agent should be warned in this case via divergence_note.

ANTI-HALLUCINATION RULES:
- All MLS numbers, prices, and dates MUST come from a source you actually consulted in this session (the package text, the listing_url page, or a web_search result). Do NOT write numbers from memory.
- If a source didn't surface a field, leave it null. Empty fields are correct; invented fields are catastrophic.
- If web_search returns no useful results for the live_search source, set sources.live_search = null and pick recommended_source = 'listing_url'.

Call submit_listing_reconciliation EXACTLY ONCE when your investigation is complete. Do not emit any other text.`;

const MAX_TOOL_ITERATIONS = 6;
const PER_REQUEST_TIMEOUT_MS = 60_000;
const FETCH_HARD_TIMEOUT_MS = 240_000;
const WEB_SEARCH_MAX_USES = 8;

type FetchInput = {
  propertyAddress: string | null;
  apn: string | null;
  packageMlsText: string | null;
  listingUrl: string | null;
};

export async function reconcileListingData(
  input: FetchInput,
): Promise<ListingReconciliation | null> {
  // No package text AND no listing URL means we have nothing to
  // reconcile against. Skip; the focused passes' property_facts
  // remain the only source.
  if (!input.packageMlsText && !input.listingUrl && !input.propertyAddress) {
    return null;
  }

  const userPrompt = buildUserPrompt(input);

  try {
    const result = await Promise.race<ListingReconciliation | null>([
      runReconcile(userPrompt),
      new Promise<null>((resolve) =>
        setTimeout(() => {
          console.warn(
            `[listing-reconcile] hard outer timeout after ${FETCH_HARD_TIMEOUT_MS}ms; reconciliation skipped`,
          );
          resolve(null);
        }, FETCH_HARD_TIMEOUT_MS),
      ),
    ]);
    return result;
  } catch (err) {
    console.error(
      "[listing-reconcile] fetch failed; reconciliation skipped:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function buildUserPrompt(i: FetchInput): string {
  const lines: string[] = ["Reconcile listing data for this property:"];
  if (i.propertyAddress) lines.push(`- Address: ${i.propertyAddress}`);
  if (i.apn) lines.push(`- APN: ${i.apn}`);
  if (i.listingUrl) lines.push(`- Agent-provided listing URL: ${i.listingUrl}`);

  lines.push("");
  if (i.packageMlsText) {
    lines.push("===== SOURCE (a): PACKAGE MLS PRINT-OUT (historical) =====");
    lines.push("Extracted text from the MLS print-out PDF that was included");
    lines.push("inside the disclosure package. This is a snapshot from whenever");
    lines.push("the package was assembled; treat as historical reference, NOT");
    lines.push("the current truth.");
    lines.push("");
    lines.push(i.packageMlsText.slice(0, 30_000));
    lines.push("===== END SOURCE (a) =====");
    lines.push("");
  } else {
    lines.push("Source (a) PACKAGE_MLS: not available (no MLS print-out PDF was attached to the package). Set sources.package_mls = null.");
    lines.push("");
  }

  if (i.listingUrl) {
    lines.push(
      `Source (b) LISTING_URL: visit ${i.listingUrl} via web_search and extract MLS#, list price, status, list date, days on market, and any price-history events.`,
    );
  } else {
    lines.push(
      "Source (b) LISTING_URL: not available (the agent did not enter a URL on the upload form). Set sources.listing_url = null.",
    );
  }
  lines.push("");

  lines.push(
    "Source (c) LIVE_SEARCH: do a fresh web search RIGHT NOW for the current listing for THIS property. Key on the address" +
      (i.apn ? `, the APN ${i.apn}` : "") +
      ", and any prior MLS numbers you discover from sources (a) or (b). Try searches like '<address> current zillow listing 2026', '<MLS#> status', and '<address> redfin'. Look for the freshest signal.",
  );
  lines.push("");

  lines.push(
    "Then reconcile per the system prompt and submit via submit_listing_reconciliation.",
  );
  return lines.join("\n");
}

async function runReconcile(
  userPrompt: string,
): Promise<ListingReconciliation | null> {
  const client = getAnthropicClient();
  const messages: Anthropic_.Messages.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await Promise.race([
      client.messages.create({
        model: ANALYSIS_MODEL,
        max_tokens: 4096,
        system: RECONCILE_SYSTEM,
        tools: [
          {
            type: "web_search_20250305" as Anthropic_.Messages.WebSearchTool20250305["type"],
            name: "web_search",
            max_uses: WEB_SEARCH_MAX_USES,
          } as Anthropic_.Messages.WebSearchTool20250305,
          RECONCILE_TOOL as unknown as Anthropic_.Messages.Tool,
        ],
        messages,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("listing-reconcile per-request timed out")),
          PER_REQUEST_TIMEOUT_MS,
        ),
      ),
    ]);

    for (const block of response.content) {
      if (
        block.type === "tool_use" &&
        block.name === "submit_listing_reconciliation"
      ) {
        const raw = block.input as Omit<ListingReconciliation, "reconciled_at" | "current">;
        const reconciled_at = new Date().toISOString();
        return finalize({ ...raw, reconciled_at });
      }
    }

    if (response.stop_reason === "end_turn") {
      return null;
    }

    messages.push({ role: "assistant", content: response.content });
  }

  return null;
}

// Compute the `current` block from the recommended source + the
// matching observation. Centralizes the authority-order logic so
// every consumer of ListingReconciliation sees the same answer.
//
// Server-side override of Claude's recommended_source: if Claude
// drifted from the founder rule, snap the recommendation back. The
// rule is:
//   - No divergence: prefer listing_url > live_search > package_mls
//   - With divergence: prefer live_search > listing_url > package_mls
// The Zillow / listing URL is the agent's working anchor; we only
// override it with the live web search when sources actually
// disagree.
function finalize(
  partial: Omit<ListingReconciliation, "current">,
): ListingReconciliation {
  const enforced = enforceRecommendation(partial);
  const final: Omit<ListingReconciliation, "current"> = {
    ...partial,
    recommended_source: enforced,
  };
  let observation: ListingSourceObservation | null = null;
  if (enforced === "live_search") observation = final.sources.live_search;
  else if (enforced === "listing_url") observation = final.sources.listing_url;
  else if (enforced === "package_mls") observation = final.sources.package_mls;

  const current = observation
    ? {
        source: enforced!,
        mls_number: observation.mls_number,
        list_price: observation.list_price,
        status: observation.status,
        list_date: observation.list_date,
        days_on_market: observation.days_on_market,
      }
    : null;

  return { ...final, current };
}

function enforceRecommendation(
  partial: Omit<ListingReconciliation, "current">,
): ListingReconciliation["recommended_source"] {
  const haveListingUrl = partial.sources.listing_url != null;
  const haveLiveSearch = partial.sources.live_search != null;
  const havePackageMls = partial.sources.package_mls != null;

  if (partial.has_divergence) {
    // Disagreement, freshest signal wins.
    if (haveLiveSearch) return "live_search";
    if (haveListingUrl) return "listing_url";
    if (havePackageMls) return "package_mls";
    return null;
  }
  // Sources agree, the agent's listing URL is the natural anchor.
  if (haveListingUrl) return "listing_url";
  if (haveLiveSearch) return "live_search";
  if (havePackageMls) return "package_mls";
  return null;
}

// Render helper: produces a short note like "current; prior MLS
// 82039496 and 82044514 cancelled" for the property-snapshot row.
// Returns null when there are no prior MLS numbers.
export function mlsStatusNoteFromReconciliation(
  r: ListingReconciliation | null,
): string | null {
  if (!r) return null;
  if (!r.prior_mls_numbers || r.prior_mls_numbers.length === 0) return null;
  if (r.prior_mls_numbers.length === 1) {
    return `current; prior MLS ${r.prior_mls_numbers[0]} cancelled`;
  }
  const last = r.prior_mls_numbers[r.prior_mls_numbers.length - 1];
  const rest = r.prior_mls_numbers.slice(0, -1).join(", ");
  return `current; prior MLS ${rest} and ${last} cancelled`;
}
