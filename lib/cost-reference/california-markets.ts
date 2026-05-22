// =============================================================================
// California regional cost reference for the disclosure analyzer
// =============================================================================
//
// Purpose: ground Claude's repair-cost estimates in defensible
// California regional baselines so the numbers the agent hands to
// their client are realistic for the property's actual market —
// not a generic "Bay Area default" applied to a Fresno listing or
// vice versa.
//
// REFRESH CADENCE: BIWEEKLY (target). Labor and material prices in
// California move enough quarter-over-quarter that quarterly is
// borderline-too-slow, biweekly catches material spikes (lumber,
// copper, drywall) close to when they happen. The actual refresh
// is a manual code-update step today; long-term these tables
// should live in the database with an admin UI for tuning.
//
// SOURCES (per region, see source_notes):
//   - CSLB licensee surveys (California Contractors State License
//     Board public data)
//   - RSMeans California residential repair cost index
//     (current-year compendium)
//   - HomeAdvisor / Angi published regional ranges
//   - Local agent panel feedback for Bay Area, LA, San Diego markets
//
// IMPORTANT: these are BASELINES for typical scope. Finding-specific
// scope drives the actual estimate. A "sewer lateral" line at
// $15,000 doesn't mean every sewer-related finding gets that
// number — it means a typical full-length residential replacement
// in the region. A spot repair is cheaper, a deep trenchless run
// up a steep lot is more.
//
// FUTURE: move into a `cost_references` Supabase table with
// admin-only RLS so designated admins can update prices through the
// app instead of editing this file + redeploying. Deferred until
// the analyzer has enough run volume to justify the tooling.

// Last refresh of the entire table:
export const COST_REFERENCE_LAST_REFRESHED = "2026-05-21";

export type Range = { low: number; high: number };

export type MarketReference = {
  slug: string;
  label: string;
  last_updated: string;
  source_notes: string;
  labor_indices: {
    contractor_hourly: Range;
    electrician_hourly: Range;
    plumber_hourly: Range;
  };
  common_repairs: Record<string, Range>;
};

// Common-repair keys are stable across regions so the prompt
// formatter can iterate uniformly. Order matters for readability
// in the prompt; this is the order the rows appear when injected.
const COMMON_REPAIR_KEYS = [
  "full_roof_replacement",
  "sewer_lateral",
  "electrical_panel_replacement",
  "hvac_replacement",
  "water_heater_replacement",
  "foundation_pier",
  "retaining_wall",
  "mold_remediation",
  "asbestos_abatement",
  "lead_paint_remediation",
  "structural_repair",
  "exterior_repaint",
  "kitchen_remodel",
  "bathroom_remodel",
  "deck_replacement",
] as const;

export const CALIFORNIA_MARKETS: Record<string, MarketReference> = {
  // ===========================================================================
  // Bay Area — Silicon Valley (Santa Clara, San Mateo, southern Alameda)
  // ===========================================================================
  // Highest labor market in the state. South Bay rates anchor here;
  // mid-Peninsula trends slightly higher on premium-home work.
  bay_area_silicon_valley: {
    slug: "bay_area_silicon_valley",
    label: "Bay Area / Silicon Valley",
    last_updated: "2026-05-21",
    source_notes:
      "CSLB rate surveys + RSMeans CA index + Santa Clara / San Mateo contractor quotes. Highest labor market in CA.",
    labor_indices: {
      contractor_hourly: { low: 165, high: 280 },
      electrician_hourly: { low: 140, high: 220 },
      plumber_hourly: { low: 135, high: 215 },
    },
    common_repairs: {
      full_roof_replacement: { low: 22000, high: 42000 },
      sewer_lateral: { low: 12000, high: 28000 },
      electrical_panel_replacement: { low: 4500, high: 9500 },
      hvac_replacement: { low: 14000, high: 28000 },
      water_heater_replacement: { low: 2200, high: 5500 },
      foundation_pier: { low: 18000, high: 50000 },
      retaining_wall: { low: 12000, high: 45000 },
      mold_remediation: { low: 4500, high: 22000 },
      asbestos_abatement: { low: 3500, high: 18000 },
      lead_paint_remediation: { low: 8000, high: 30000 },
      structural_repair: { low: 15000, high: 75000 },
      exterior_repaint: { low: 9000, high: 22000 },
      kitchen_remodel: { low: 55000, high: 175000 },
      bathroom_remodel: { low: 28000, high: 75000 },
      deck_replacement: { low: 18000, high: 55000 },
    },
  },

  // ===========================================================================
  // Bay Area — East Bay (Oakland, Berkeley, Hayward, Pleasanton, Walnut Creek)
  // ===========================================================================
  bay_area_east: {
    slug: "bay_area_east",
    label: "Bay Area / East Bay",
    last_updated: "2026-05-21",
    source_notes:
      "Alameda + Contra Costa contractor surveys, RSMeans regional. ~10-15% below Silicon Valley on labor; comparable material costs.",
    labor_indices: {
      contractor_hourly: { low: 145, high: 250 },
      electrician_hourly: { low: 125, high: 200 },
      plumber_hourly: { low: 120, high: 195 },
    },
    common_repairs: {
      full_roof_replacement: { low: 18000, high: 38000 },
      sewer_lateral: { low: 10000, high: 24000 },
      electrical_panel_replacement: { low: 4000, high: 8500 },
      hvac_replacement: { low: 12000, high: 24000 },
      water_heater_replacement: { low: 1900, high: 4800 },
      foundation_pier: { low: 15000, high: 45000 },
      retaining_wall: { low: 10000, high: 38000 },
      mold_remediation: { low: 4000, high: 20000 },
      asbestos_abatement: { low: 3200, high: 16000 },
      lead_paint_remediation: { low: 7000, high: 26000 },
      structural_repair: { low: 12000, high: 65000 },
      exterior_repaint: { low: 7500, high: 19000 },
      kitchen_remodel: { low: 45000, high: 150000 },
      bathroom_remodel: { low: 22000, high: 65000 },
      deck_replacement: { low: 14000, high: 45000 },
    },
  },

  // ===========================================================================
  // Sacramento Valley (Sacramento, Roseville, Folsom, Elk Grove, Davis)
  // ===========================================================================
  sacramento_valley: {
    slug: "sacramento_valley",
    label: "Sacramento Valley",
    last_updated: "2026-05-21",
    source_notes:
      "Sacramento County contractor panel + HomeAdvisor regional + RSMeans. Mid-CA labor market; cheaper than Bay Area, pricier than Central Valley.",
    labor_indices: {
      contractor_hourly: { low: 110, high: 195 },
      electrician_hourly: { low: 95, high: 160 },
      plumber_hourly: { low: 90, high: 155 },
    },
    common_repairs: {
      full_roof_replacement: { low: 13000, high: 28000 },
      sewer_lateral: { low: 7000, high: 16000 },
      electrical_panel_replacement: { low: 3000, high: 6500 },
      hvac_replacement: { low: 9000, high: 18000 },
      water_heater_replacement: { low: 1500, high: 3800 },
      foundation_pier: { low: 11000, high: 32000 },
      retaining_wall: { low: 7000, high: 26000 },
      mold_remediation: { low: 3000, high: 14000 },
      asbestos_abatement: { low: 2500, high: 12000 },
      lead_paint_remediation: { low: 5000, high: 18000 },
      structural_repair: { low: 9000, high: 45000 },
      exterior_repaint: { low: 5500, high: 14000 },
      kitchen_remodel: { low: 30000, high: 95000 },
      bathroom_remodel: { low: 15000, high: 45000 },
      deck_replacement: { low: 9000, high: 28000 },
    },
  },

  // ===========================================================================
  // Central Valley (Fresno, Bakersfield, Stockton, Modesto, Visalia)
  // ===========================================================================
  central_valley: {
    slug: "central_valley",
    label: "Central Valley",
    last_updated: "2026-05-21",
    source_notes:
      "Fresno / Bakersfield contractor surveys. CA's most affordable labor market — typically 30-40% below Silicon Valley rates.",
    labor_indices: {
      contractor_hourly: { low: 95, high: 165 },
      electrician_hourly: { low: 80, high: 140 },
      plumber_hourly: { low: 80, high: 135 },
    },
    common_repairs: {
      full_roof_replacement: { low: 10000, high: 22000 },
      sewer_lateral: { low: 5500, high: 13000 },
      electrical_panel_replacement: { low: 2500, high: 5500 },
      hvac_replacement: { low: 7500, high: 15000 },
      water_heater_replacement: { low: 1300, high: 3200 },
      foundation_pier: { low: 9000, high: 26000 },
      retaining_wall: { low: 5500, high: 20000 },
      mold_remediation: { low: 2500, high: 11000 },
      asbestos_abatement: { low: 2000, high: 9500 },
      lead_paint_remediation: { low: 4000, high: 14000 },
      structural_repair: { low: 7000, high: 35000 },
      exterior_repaint: { low: 4500, high: 11000 },
      kitchen_remodel: { low: 22000, high: 75000 },
      bathroom_remodel: { low: 11000, high: 35000 },
      deck_replacement: { low: 7000, high: 22000 },
    },
  },

  // ===========================================================================
  // Greater LA — Westside (Santa Monica, Beverly Hills, West LA, Manhattan Beach)
  // ===========================================================================
  greater_la_westside: {
    slug: "greater_la_westside",
    label: "Greater LA / Westside",
    last_updated: "2026-05-21",
    source_notes:
      "LA County westside contractor quotes + RSMeans. Comparable to Silicon Valley on premium work; specialty trade rates can run higher.",
    labor_indices: {
      contractor_hourly: { low: 160, high: 280 },
      electrician_hourly: { low: 140, high: 220 },
      plumber_hourly: { low: 135, high: 215 },
    },
    common_repairs: {
      full_roof_replacement: { low: 22000, high: 45000 },
      sewer_lateral: { low: 11000, high: 26000 },
      electrical_panel_replacement: { low: 4500, high: 9500 },
      hvac_replacement: { low: 14000, high: 28000 },
      water_heater_replacement: { low: 2200, high: 5500 },
      foundation_pier: { low: 17000, high: 48000 },
      retaining_wall: { low: 11000, high: 42000 },
      mold_remediation: { low: 4500, high: 22000 },
      asbestos_abatement: { low: 3500, high: 18000 },
      lead_paint_remediation: { low: 8000, high: 28000 },
      structural_repair: { low: 14000, high: 70000 },
      exterior_repaint: { low: 8500, high: 22000 },
      kitchen_remodel: { low: 52000, high: 175000 },
      bathroom_remodel: { low: 26000, high: 72000 },
      deck_replacement: { low: 16000, high: 50000 },
    },
  },

  // ===========================================================================
  // Greater LA — Inland (San Fernando Valley, Pasadena, Glendale, Burbank, Inland Empire)
  // ===========================================================================
  greater_la_inland: {
    slug: "greater_la_inland",
    label: "Greater LA / Inland",
    last_updated: "2026-05-21",
    source_notes:
      "San Bernardino + Riverside + LA inland contractor panel. ~15-20% below LA Westside on labor.",
    labor_indices: {
      contractor_hourly: { low: 130, high: 220 },
      electrician_hourly: { low: 115, high: 180 },
      plumber_hourly: { low: 110, high: 175 },
    },
    common_repairs: {
      full_roof_replacement: { low: 15000, high: 32000 },
      sewer_lateral: { low: 8500, high: 20000 },
      electrical_panel_replacement: { low: 3500, high: 7500 },
      hvac_replacement: { low: 10000, high: 22000 },
      water_heater_replacement: { low: 1700, high: 4500 },
      foundation_pier: { low: 13000, high: 38000 },
      retaining_wall: { low: 8500, high: 32000 },
      mold_remediation: { low: 3500, high: 17000 },
      asbestos_abatement: { low: 2800, high: 14000 },
      lead_paint_remediation: { low: 6000, high: 22000 },
      structural_repair: { low: 10000, high: 55000 },
      exterior_repaint: { low: 6500, high: 16000 },
      kitchen_remodel: { low: 35000, high: 110000 },
      bathroom_remodel: { low: 18000, high: 52000 },
      deck_replacement: { low: 11000, high: 35000 },
    },
  },

  // ===========================================================================
  // San Diego — Coastal (La Jolla, Del Mar, Encinitas, downtown SD, Coronado)
  // ===========================================================================
  san_diego_coastal: {
    slug: "san_diego_coastal",
    label: "San Diego / Coastal",
    last_updated: "2026-05-21",
    source_notes:
      "San Diego County coastal contractor panel + RSMeans. Coastal premium on labor; salt-air-related work (windows, exterior coatings) costs more.",
    labor_indices: {
      contractor_hourly: { low: 145, high: 245 },
      electrician_hourly: { low: 125, high: 200 },
      plumber_hourly: { low: 120, high: 195 },
    },
    common_repairs: {
      full_roof_replacement: { low: 17000, high: 36000 },
      sewer_lateral: { low: 9500, high: 22000 },
      electrical_panel_replacement: { low: 4000, high: 8500 },
      hvac_replacement: { low: 11000, high: 23000 },
      water_heater_replacement: { low: 1900, high: 4800 },
      foundation_pier: { low: 14000, high: 42000 },
      retaining_wall: { low: 10000, high: 38000 },
      mold_remediation: { low: 4000, high: 19000 },
      asbestos_abatement: { low: 3200, high: 16000 },
      lead_paint_remediation: { low: 7000, high: 25000 },
      structural_repair: { low: 12000, high: 60000 },
      exterior_repaint: { low: 7500, high: 19000 },
      kitchen_remodel: { low: 42000, high: 135000 },
      bathroom_remodel: { low: 22000, high: 62000 },
      deck_replacement: { low: 13000, high: 42000 },
    },
  },

  // ===========================================================================
  // Central Coast (Santa Cruz, Monterey, Carmel, San Luis Obispo, Santa Barbara)
  // ===========================================================================
  central_coast: {
    slug: "central_coast",
    label: "Central Coast",
    last_updated: "2026-05-21",
    source_notes:
      "Santa Cruz + Monterey + Santa Barbara contractor surveys. Tight skilled-trades supply; rates trend higher than population suggests.",
    labor_indices: {
      contractor_hourly: { low: 140, high: 235 },
      electrician_hourly: { low: 120, high: 195 },
      plumber_hourly: { low: 115, high: 190 },
    },
    common_repairs: {
      full_roof_replacement: { low: 17000, high: 35000 },
      sewer_lateral: { low: 9500, high: 22000 },
      electrical_panel_replacement: { low: 4000, high: 8500 },
      hvac_replacement: { low: 11000, high: 22000 },
      water_heater_replacement: { low: 1900, high: 4800 },
      foundation_pier: { low: 14000, high: 40000 },
      retaining_wall: { low: 9500, high: 35000 },
      mold_remediation: { low: 4000, high: 19000 },
      asbestos_abatement: { low: 3200, high: 16000 },
      lead_paint_remediation: { low: 6500, high: 24000 },
      structural_repair: { low: 11000, high: 58000 },
      exterior_repaint: { low: 7000, high: 18000 },
      kitchen_remodel: { low: 40000, high: 130000 },
      bathroom_remodel: { low: 20000, high: 58000 },
      deck_replacement: { low: 12000, high: 40000 },
    },
  },

  // ===========================================================================
  // North Coast / North Bay (Marin, Sonoma, Napa, Mendocino, Humboldt)
  // ===========================================================================
  north_coast: {
    slug: "north_coast",
    label: "North Coast / North Bay",
    last_updated: "2026-05-21",
    source_notes:
      "Marin + Sonoma + Napa contractor panel. Marin trends Bay-Area-premium; further north (Mendocino, Humboldt) softens 10-15%.",
    labor_indices: {
      contractor_hourly: { low: 150, high: 260 },
      electrician_hourly: { low: 130, high: 205 },
      plumber_hourly: { low: 125, high: 200 },
    },
    common_repairs: {
      full_roof_replacement: { low: 19000, high: 38000 },
      sewer_lateral: { low: 10500, high: 24000 },
      electrical_panel_replacement: { low: 4200, high: 9000 },
      hvac_replacement: { low: 12000, high: 25000 },
      water_heater_replacement: { low: 2000, high: 5000 },
      foundation_pier: { low: 16000, high: 45000 },
      retaining_wall: { low: 10500, high: 40000 },
      mold_remediation: { low: 4200, high: 20000 },
      asbestos_abatement: { low: 3400, high: 17000 },
      lead_paint_remediation: { low: 7500, high: 27000 },
      structural_repair: { low: 13000, high: 65000 },
      exterior_repaint: { low: 8000, high: 20000 },
      kitchen_remodel: { low: 48000, high: 155000 },
      bathroom_remodel: { low: 24000, high: 68000 },
      deck_replacement: { low: 15000, high: 48000 },
    },
  },
};

// =============================================================================
// selectMarketReference
// =============================================================================
//
// Free-form fuzzy-match a region/address hint to the best matching
// market entry. Returns Bay Area / Silicon Valley as the default
// when no signal — that's the most expensive market and biases
// over-estimates upward, which is safer for the buyer.

const DEFAULT_MARKET_SLUG = "bay_area_silicon_valley";

// Lower-cased substrings → market slug. Ordering matters: more
// specific matches first so e.g. "south bay" wins over plain "bay".
// The map is intentionally biased toward the city + county names
// agents actually type into the report-name field.
const HINT_PATTERNS: Array<[RegExp, string]> = [
  // Silicon Valley + Peninsula
  [/\b(silicon valley|south bay|santa clara|san jose|sunnyvale|mountain view|palo alto|menlo park|los altos|cupertino|los gatos|saratoga|campbell|milpitas|gilroy|morgan hill|san mateo|burlingame|hillsborough|atherton|woodside|portola valley|redwood city|foster city)\b/i, "bay_area_silicon_valley"],
  // East Bay
  [/\b(east bay|oakland|berkeley|emeryville|alameda|hayward|fremont|union city|newark|san leandro|castro valley|dublin|pleasanton|livermore|walnut creek|concord|martinez|lafayette|orinda|moraga|danville|alamo|san ramon|antioch|brentwood|pittsburg|richmond|el cerrito)\b/i, "bay_area_east"],
  // North Coast / North Bay
  [/\b(marin|sonoma|napa|sausalito|mill valley|tiburon|larkspur|kentfield|san anselmo|san rafael|novato|petaluma|santa rosa|sebastopol|healdsburg|st\.? helena|calistoga|mendocino|humboldt|fort bragg|ukiah|eureka|arcata)\b/i, "north_coast"],
  // Central Coast
  [/\b(central coast|santa cruz|capitola|aptos|monterey|pacific grove|carmel|pebble beach|salinas|seaside|big sur|cambria|morro bay|san luis obispo|pismo|paso robles|santa barbara|montecito|goleta|ojai|ventura|oxnard)\b/i, "central_coast"],
  // San Diego coastal
  [/\b(san diego|la jolla|del mar|encinitas|carlsbad|solana beach|cardiff|coronado|point loma|ocean beach|pacific beach|mission beach|rancho santa fe|oceanside)\b/i, "san_diego_coastal"],
  // LA Westside
  [/\b(la westside|west la|santa monica|beverly hills|brentwood|bel air|pacific palisades|malibu|hollywood|west hollywood|culver city|venice|marina del rey|playa vista|manhattan beach|hermosa beach|redondo beach|el segundo|palos verdes|rolling hills)\b/i, "greater_la_westside"],
  // LA Inland / Inland Empire / Valley
  [/\b(san fernando valley|sherman oaks|encino|tarzana|woodland hills|northridge|van nuys|burbank|glendale|pasadena|south pasadena|altadena|arcadia|monrovia|claremont|pomona|chino|ontario|riverside|moreno valley|corona|temecula|murrieta|san bernardino|fontana|rancho cucamonga|upland|redlands|long beach)\b/i, "greater_la_inland"],
  // Sacramento Valley
  [/\b(sacramento|elk grove|folsom|roseville|rocklin|granite bay|el dorado hills|davis|woodland|west sacramento|natomas|antelope|citrus heights|carmichael|fair oaks|orangevale|rancho cordova|lincoln|auburn|placerville)\b/i, "sacramento_valley"],
  // Central Valley
  [/\b(central valley|fresno|clovis|madera|visalia|tulare|bakersfield|kern|stockton|lodi|modesto|turlock|merced|atwater|chico|yuba|redding)\b/i, "central_valley"],
];

export function selectMarketReference(
  hint: string | null | undefined,
): MarketReference {
  if (!hint || !hint.trim()) {
    return CALIFORNIA_MARKETS[DEFAULT_MARKET_SLUG];
  }
  const haystack = hint.toLowerCase();
  for (const [pattern, slug] of HINT_PATTERNS) {
    if (pattern.test(haystack)) {
      return CALIFORNIA_MARKETS[slug] ?? CALIFORNIA_MARKETS[DEFAULT_MARKET_SLUG];
    }
  }
  return CALIFORNIA_MARKETS[DEFAULT_MARKET_SLUG];
}

// =============================================================================
// formatMarketReferenceForPrompt
// =============================================================================
//
// Renders the selected market reference as a compact text block that
// the focused-pass system prompt can append. Numbers laid out as a
// readable table — Claude does fine with ASCII tables and they
// compress more cleanly into tokens than JSON.

export function formatMarketReferenceForPrompt(
  ref: MarketReference,
): string {
  const lines: string[] = [];
  lines.push(`REGIONAL PRICING REFERENCE — ${ref.label} (last refreshed ${ref.last_updated})`);
  lines.push(`Source notes: ${ref.source_notes}`);
  lines.push("");
  lines.push("Labor indices (USD per hour):");
  lines.push(`  General contractor: $${ref.labor_indices.contractor_hourly.low}–$${ref.labor_indices.contractor_hourly.high}`);
  lines.push(`  Electrician:        $${ref.labor_indices.electrician_hourly.low}–$${ref.labor_indices.electrician_hourly.high}`);
  lines.push(`  Plumber:            $${ref.labor_indices.plumber_hourly.low}–$${ref.labor_indices.plumber_hourly.high}`);
  lines.push("");
  lines.push("Common repair baselines (USD ranges for typical scope):");
  for (const key of COMMON_REPAIR_KEYS) {
    const r = ref.common_repairs[key];
    if (!r) continue;
    const label = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
    const low = r.low.toLocaleString();
    const high = r.high.toLocaleString();
    lines.push(`  ${label.padEnd(34, " ")} $${low}–$${high}`);
  }
  lines.push("");
  lines.push(
    "USE THESE AS CALIBRATION, NOT AS COPY-PASTE NUMBERS. Each finding has " +
      "its own scope (spot repair vs. full replacement, easy access vs. " +
      "difficult, single-story vs. multi-story). Anchor your estimate in " +
      "the relevant baseline range, then adjust for the specific scope in " +
      "the source documents. If a finding's scope is materially smaller or " +
      "larger than typical, your estimate should reflect that.",
  );
  return lines.join("\n");
}
