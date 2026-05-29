// Structured-output schema for a Veroax disclosure analysis report.
// Mirrored as both a TypeScript type (for compile-time safety on the
// rendering side) and an Anthropic tool input_schema (for runtime
// structured output from Claude).

export type Severity = "critical" | "high" | "moderate" | "cosmetic";
export type Confidence = "high" | "medium" | "low";

export type CostRange = {
  low: number;
  high: number;
  description?: string;
};

export type Finding = {
  title: string;
  source: string;
  severity: Severity;
  confidence: Confidence;
  description: string;
  cost_estimate: CostRange;
  risk_if_ignored: string;
  recommended_action: string;
  // Verbatim quote pulled directly from the source document. Surfaced
  // in the PDF inside a "From the source document:" quote block so the
  // finding is auditable against the underlying disclosure. Keep this
  // SHORT, 1-3 sentences max; the full document is still available
  // for deeper reads. Null when no clean quote is available.
  source_quote?: string | null;
  // Set by lib/reports/quote-validator after the analyzer returns,
  // when the source_quote text could not be matched (substring nor
  // 70%+ token-overlap fuzzy match) against the concatenated
  // extracted text of the uploaded documents. When true, the
  // finding was DEMOTED from "critical" to "high" severity and the
  // dashboard renders a "needs review" badge. Absent / false on
  // findings that passed validation or had no quote to check.
  quote_match_failed?: boolean | null;
  // Plain-language "what is this thing." Different from description in
  // that what_it_is explains the THING in lay terms ("the inspector's
  // panel was painted shut, so the branch wire material couldn't be
  // verified"), while description states the observation. Renders as
  // its own paragraph in the new finding card layout.
  what_it_is?: string | null;
  // Why the buyer should care, consequences, insurance/lender impact,
  // safety risk. Renders as "Why it matters" paragraph.
  why_it_matters?: string | null;
  // Concrete next step the buyer/agent should take to resolve the
  // unknown or remediate the issue. Renders as "Next step" paragraph.
  next_step?: string | null;
  // Out-of-pocket cost to investigate / evaluate the finding (vs.
  // cost_estimate which is the remediation cost if confirmed). For
  // example: aluminum wiring evaluation is $300-$600 to investigate,
  // but $500-$4,500 per circuit to remediate. The investigate cost is
  // what the buyer might spend during contingency; the remediation
  // cost is the post-confirmation negotiation lever. Optional.
  immediate_out_of_pocket?: CostRange | null;
  // Who pays this bill if the repair gets done?
  //   - "owner": the buyer-occupant of this specific unit/property
  //   - "hoa": the HOA / condo association from reserves or assessments
  //   - "shared": cost falls on both (e.g., common-area work with a
  //     supplemental in-unit component)
  // Drives two important behaviors:
  //   (1) The grand-total / critical-high-total in cost_summary count
  //       ONLY owner + shared findings. HOA-paid items are reported
  //       separately so the buyer's effective out-of-pocket isn't
  //       inflated by association capital projects.
  //   (2) HOA-paid findings can't be auto-Critical solely from cost.
  //       They may still be Critical from active hazard or lender/
  //       insurance blockability, but the dollar threshold doesn't
  //       apply because the buyer never writes that check.
  // Null/absent on older reports, render code treats "missing" as
  // "owner" so the legacy behavior stays put for existing report_data.
  cost_responsibility?: "owner" | "hoa" | "shared" | null;
  // When the finding's source document was added to the report AFTER
  // the original analysis (via /api/reports/[id]/update), this is the
  // ISO date that document was added. NULL or absent for findings
  // sourced from documents in the original upload. Drives the
  // "added in update" badge in the agent's summary view.
  from_doc_added_at?: string | null;
  // Optional: when this finding was upgraded to Critical because it
  // matches one of the always-CRITICAL rules in the analyzer's system
  // prompt (FPE panels, aluminum wiring, polybutylene, etc.), this is
  // a short identifier for the rule that fired. Surfaced as a small
  // badge on the dashboard so agents can sanity-check WHY something
  // is flagged critical. Null/absent when no always-Critical rule
  // applies, most findings won't have this.
  triggered_rule?: string | null;
};

export type ReportData = {
  property_snapshot: {
    address: string | null;
    property_type: string | null;
    year_built: number | null;
    square_feet: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    list_price: number | null;
    days_on_market: number | null;
    market_region: string | null;
    // -- Optional extensions populated by the analyzer when the
    // source documents carry the data. Older reports rendered before
    // these fields existed simply have null and the PDF cover skips
    // their rows.
    // ----------------------------------------------------------------
    apn?: string | null;
    mls_number?: string | null;
    // Optional historical note about prior cancelled MLS numbers,
    // e.g., "current; prior MLS 82039496 and 82044514 cancelled".
    // Populated by the listing-data reconciliation step. NOT
    // rendered on the cover or Property Snapshot per the founder
    // spec (one MLS number on the document); preserved on the
    // ReportData in case a future UI surface (override workflow,
    // admin audit view) wants to display it. The full relist
    // history renders in Market Context's "Listing history"
    // subsection.
    mls_status_note?: string | null;
    list_date?: string | null;
    list_status?: "active" | "pending" | "sold" | "withdrawn" | "unknown" | null;
    zestimate?: number | null;
    parking?: string | null;
    hoa_dues_monthly?: number | null;
    hoa_last_increase_date?: string | null;
    hoa_last_increase_amount?: number | null;
    // Regional pricing reference used for cost estimates throughout
    // the report. Default to "California Bay Area / Silicon Valley"
    // when the analyzer can't infer a better signal. Surfaced on the
    // PDF cover so the agent / client know which market drove the
    // numbers.
    cost_reference_market?: string | null;
    // Unit identifier (e.g., "Unit 102", "#3B") for multi-unit
    // properties. Pulled from the TDS / disclosure cover or the
    // listing. Null for SFRs.
    unit_number?: string | null;
    // Floor number for stacked condos / townhomes. Null for SFRs and
    // for condos where the floor isn't documented. Drives the
    // "is this finding about a feature this unit physically has?"
    // post-process filter, e.g., roof or top-floor balcony findings
    // don't apply to a ground-floor unit.
    floor?: number | null;
    // Physical features the BUYER'S SPECIFIC UNIT has, populated
    // when the analyzer can determine them from the documents. Used
    // for the unit-feature applicability filter: a finding about a
    // balcony defect gets dropped if "balcony" isn't here. Free-form
    // lowercase strings; canonical tokens include: balcony, patio,
    // private_yard, garage_stall_assigned, in_unit_laundry,
    // top_floor, ground_floor, fireplace, in_unit_hvac. Add more as
    // the analyzer encounters them, order doesn't matter.
    unit_features?: string[] | null;
    // ADU status pulled from the seller's TDS / SPQ disclosures.
    // Free-form string capturing existence + permit status + utilities
    // when available, e.g., "Unpermitted (seller-disclosed on TDS C.4:
    // 'previous owner added ADU no permit'); no separate utilities".
    // Null when no ADU is disclosed. Renders in the property-snapshot
    // facts table and feeds the executive summary.
    adu_status?: string | null;
    // Solar status with vendor, ownership, and title-encumbrance
    // detail when available, e.g., "Leased - Sunrun ($241/mo, ~2036
    // lease end, transferable, UCC-1 on title)". Null when no solar
    // is disclosed.
    solar_status?: string | null;
    // FEMA flood-zone information when an NHD or standalone Flood
    // Determination is present. Format: "<zone>; panel <id> effective
    // <date>", e.g., "Zone AE; panel 06081C 0309F effective
    // 4/5/2019". Null when no flood determination is in the package.
    fema_flood_zone?: string | null;
    // Compact one-line hazard-zone summary across all NHD findings.
    // Example: "IN FEMA Zone AE; IN Seismic Hazard Liquefaction Zone;
    // NOT in FHSZ; NOT in fault zone". Null when no hazard
    // disclosures.
    hazard_zone_summary?: string | null;
    // Seller names from the signed TDS / SPQ. Names matter for the
    // executive summary and for grounding cross-document checks
    // (signatures, dates). Format: "First Last and First Last", or
    // just one name when single-seller. Null when names aren't
    // legible / extracted.
    named_sellers?: string | null;
    // Listing team / agent identity from the AVID, MLS printout, or
    // disclosure cover. Format includes brokerage + DRE numbers when
    // available, e.g., "Bonafede Team at Compass (DRE 01189516 /
    // 01190142)". Null when not extracted.
    named_listing_team?: string | null;
    // Disclosure prep service when stamped on the package (most CA
    // packages are prepared via Disclosures.io, NWMLS, or similar).
    // Free-form string. Null when not stamped or not identifiable.
    disclosure_prep_service?: string | null;
    // Date the disclosure package was assembled (NOT the date of
    // individual forms; the package-level date stamped on the
    // cover). ISO YYYY-MM-DD when possible. Null when no cover date.
    package_date?: string | null;
  };
  document_inventory: {
    documents_provided: Array<{
      name: string;
      type: string;
      pages?: number;
      // "Provided" | "Stale (>12 months)" | "Partial" | "Provided
      // per coversheet" etc. Free-form so the analyzer can describe
      // nuance. Optional for backward compat with existing reports.
      status?: string | null;
      // Document date when the analyzer can pull it (signing date for
      // forms, report date for inspections, effective date for prelim
      // titles). ISO YYYY-MM-DD when possible. Optional.
      date?: string | null;
      // Per-doc analyzer commentary: who prepared it, what's notable,
      // what gaps to flag. Example: "TAPS Termite Report #57662,
      // dated 5/14/2026, Section I and II findings". Optional.
      notes?: string | null;
    }>;
    documents_missing: string[];
  };
  completeness_audit: {
    summary: string;
    issues: string[];
  };
  critical_findings: Finding[];
  moderate_findings: Finding[];
  cosmetic_findings: Finding[];
  permit_compliance: {
    summary: string;
    findings: Finding[];
  };
  hoa: {
    applicable: boolean;
    summary: string;
    concerns: string[];
    // Optional financial / governance KV facts surfaced by the HOA
    // analyzer pass. Powers the new HOA section's compact fact table
    // (Master policy carrier, Reserves range, Operating account,
    // Special assessment status, Capital projects approved, Rental
    // restriction, Age restriction, Reserve study cadence, etc.). The
    // analyzer populates whatever it could pull from the HOA package;
    // missing fields just don't render. Free-form key/value strings so
    // we can add new facts without a schema migration.
    facts?: Array<{ label: string; value: string }> | null;
    // "Reserve health, our read", a 2-3 sentence editorial paragraph
    // about whether reserves are adequate, what the current path is
    // (assessments planned, dues trajectory), and how that compares
    // to typical CA HOAs of this age + unit count. Renders as its own
    // titled paragraph below the facts table.
    reserve_health_read?: string | null;
    // "Watch items", a 1-2 sentence prose flag for HOA items the
    // buyer should monitor through close (mid-project contractor
    // switches, unit-by-unit water-intrusion patterns, etc.). NOT a
    // hard finding, it's a heads-up for the agent's diligence list.
    watch_items?: string | null;
  };
  environmental: {
    summary: string;
    hazards: Array<{ name: string; severity: Severity; notes: string }>;
  };
  cost_summary: {
    critical_high_total: CostRange;
    moderate_total: CostRange;
    grand_total: CostRange;
    line_items: Array<{
      category: string;
      items: Array<{ label: string; cost: CostRange }>;
    }>;
  };
  negotiation: {
    summary: string;
    leverage_points: string[];
  };
  insurance_lender_risk: {
    summary: string;
    insurance_concerns: string[];
    lender_concerns: string[];
  };
  outstanding_questions: string[];
  // Cross-document consistency findings. The Cowork skill's
  // Section 3 is its most differentiated content: discrepancies
  // BETWEEN documents in the same package (TDS says one county,
  // title shows another; TDS Section III references an attached
  // AVID but no AVID is included; HOA minutes record a special
  // assessment that the balance sheet doesn't reflect; the MLS
  // print public-remarks say "third floor" but every live
  // listing says "second floor"; etc.). Each item names the
  // documents in tension and explains why the discrepancy
  // matters for the buyer.
  //
  // Optional: when empty (legacy reports, or a single-document
  // package with nothing to cross-check) the section is skipped.
  cross_document_findings?: Array<{
    title: string;
    description: string;
    // Source documents in tension, e.g.,
    // ["TDS (3/19/2026)", "Preliminary Title Report"]. At minimum
    // 2 entries because by definition the finding is a
    // disagreement between two or more sources.
    source_docs: string[];
    // Action the buyer / agent should take to resolve the
    // discrepancy before contract, e.g., "Have the listing agent
    // correct the TDS county field and re-execute" or "Request
    // the executed AVID before removing the disclosure
    // contingency." Optional, render when present.
    recommended_action?: string | null;
    // Severity classification, drives the badge color on the
    // dashboard / public report. "critical" means the
    // discrepancy could materially affect the buyer's decision
    // or closing readiness; "moderate" means it should be
    // corrected before contract but is unlikely to block;
    // "informational" means it's a scrivener-level note. Defaults
    // to "moderate" when the analyzer didn't pick one.
    severity?: "critical" | "moderate" | "informational" | null;
  }> | null;
  // Numbered checklist of specialists the buyer should engage during
  // their contingency period to close the largest unknowns in the
  // disclosure package. Renders as a clean numbered table with
  // Specialist / Reason / Approx. cost columns. Optional, when
  // empty (e.g., legacy reports) the section is skipped.
  inspection_follow_ups?: Array<{
    specialist: string;
    reason: string;
    approx_cost: string;
  }> | null;
  // Market context for the unit's sub-segment. Renders as a section
  // with median pricing for the segment, days-on-market, mortgage
  // rate environment, monthly carrying cost calculation, and the
  // within-complex + adjacent-building comparables. Optional.
  market_context?: {
    summary: string;
    monthly_carrying_cost?: string | null;
    mortgage_rate_range?: string | null;
    median_price?: string | null;
    median_dom?: number | null;
    comparable_units?: Array<{
      label: string; // e.g., "947 Catkin Ct, 658 sqft 1BR/1BA"
      status: string; // e.g., "Sold $435,000", "Listed $468,000"
      note?: string | null;
    }> | null;
    // Seller's pricing trajectory across the listing's history,
    // reconstructed by the listing-data reconciliation step.
    // Renders as a "Listing History" subsection when populated AND
    // when there are at least 2 events. Each event is a 1-2 sentence
    // narrative the buyer can read directly. Optional, null when
    // there's only a single current listing with no relist history.
    relist_ladder?: Array<{
      date: string | null;
      mls_number: string | null;
      list_price: number | null;
      status:
        | "listed"
        | "price_change"
        | "cancelled"
        | "withdrawn"
        | "pending"
        | "sold";
      narrative: string;
    }> | null;
    // Legacy "sources disagreed" warning. Kept on ReportData for
    // backwards compatibility with already-saved reports; NOT
    // rendered on new PDF output. New reports use
    // listing_history_insight + listing_history_talking_point
    // below instead, framed as negotiation signal rather than as a
    // fix-this-warning.
    listing_divergence_note?: string | null;
    // Buyer-facing 2-3 sentence summary of what the listing's
    // history tells us (price reductions over time, multiple
    // listings, same listing agent across cancellations).
    // Populated by the listing-data reconciliation step when the
    // relist ladder has 2+ events or shows meaningful pattern.
    // Renders as a neutral indigo Listing History callout in
    // Market Context (NOT an amber warning). Null when the
    // listing's history is clean (single listing, no notable
    // changes).
    listing_history_insight?: string | null;
    // Agent-facing 3-5 sentence talking point for the client
    // conversation. Renders below listing_history_insight in a
    // "For your client conversation" sub-callout, and is also
    // pulled into the Negotiation Leverage section by the
    // synthesizer when present.
    listing_history_talking_point?: string | null;
    // True when the same listing agent string appears across 2+
    // listings in the property's history. Used by the renderer to
    // emphasize the agent-talking-point callout when this pattern
    // is detected, and by the synthesizer to fold the insight into
    // negotiation leverage.
    same_listing_agent_pattern?: boolean | null;
  } | null;
  // Title & vesting summary from the preliminary title report. Captures
  // how the unit is vested (sole, joint, tenants-in-common, percentages),
  // liens of note (first deed, second, PACE/HERO), and recorded matters
  // touching the project (HOA settlements, easements). Renders as its
  // own narrative section. Optional.
  title_vesting?: {
    vesting_summary: string;
    liens_summary?: string | null;
    recorded_matters?: string | null;
  } | null;
  overall_rating: {
    label: "Excellent" | "Good" | "Acceptable" | "Significant Concerns" | "Walk Away";
    summary: string;
    contingency_advice: string;
    // Optional "Why this rating" narrative, 2-4 sentences explaining
    // the rating drivers and the major conditions that need to hold
    // for the rating to remain valid. Renders below the rating pill
    // in the new layout.
    why_this_rating?: string | null;
    // Conditions that must hold for the rating to remain valid (e.g.,
    // "no aluminum wiring confirmed in the unit", "no widespread ABS
    // failure across the complex"). Renders as a short paragraph.
    conditions_on_which_this_depends?: string | null;
  };
  // Populated only when this analysis was produced as an UPDATE to an
  // earlier report (i.e., the agent added documents). Surfaces a
  // human-readable note like:
  //   "Updated Mar 14 2026: 4 finding(s) drawn from 2 document(s)
  //    added since the original Feb 28 2026 analysis."
  // Null for original (never-updated) reports.
  update_note?: string | null;
};

// ============================================================================
// Focused-pass schema, used by per-document-group analysis calls in the
// multi-pass pipeline. Each focused pass returns a subset of fields the
// synthesis pass later merges into the full ReportData.
// ============================================================================

export type FocusedAnalysis = {
  property_facts?: Partial<ReportData["property_snapshot"]>;
  document_inventory: Array<{ name: string; type: string; pages?: number }>;
  completeness_issues: string[];
  findings: Finding[];
  cost_estimates: Array<{
    category: string;
    label: string;
    cost: CostRange;
  }>;
  hoa_facts?: {
    applicable: boolean;
    summary: string;
    concerns: string[];
  };
  environmental_hazards?: Array<{
    name: string;
    severity: Severity;
    notes: string;
  }>;
  permit_compliance?: {
    summary: string;
    findings: Finding[];
  };
  insurance_lender_notes?: string[];
  outstanding_questions: string[];
  // Cross-document consistency findings surfaced from THIS pass's
  // group of documents. The synthesizer concatenates these across
  // all passes, so each pass should only flag inconsistencies it
  // can see directly. Inter-group inconsistencies (e.g., TDS in
  // seller_disclosures vs Reserve Study in hoa) belong to a future
  // top-level consistency pass and should NOT be invented here.
  cross_document_findings?: Array<{
    title: string;
    description: string;
    source_docs: string[];
    recommended_action?: string | null;
    severity?: "critical" | "moderate" | "informational" | null;
  }>;
  // Optional rich sections, any pass can contribute these, but the
  // expected source is the seller_disclosures pass (which sees the MLS
  // printout, the TDS, and the prelim title report). The synthesizer
  // takes the first populated value across all passes.
  hoa_financial_facts?: Array<{ label: string; value: string }>;
  hoa_reserve_health_read?: string;
  hoa_watch_items?: string;
  inspection_follow_ups?: Array<{
    specialist: string;
    reason: string;
    approx_cost: string;
  }>;
  market_context?: {
    summary: string;
    monthly_carrying_cost?: string | null;
    mortgage_rate_range?: string | null;
    median_price?: string | null;
    median_dom?: number | null;
    comparable_units?: Array<{
      label: string;
      status: string;
      note?: string | null;
    }> | null;
  };
  title_vesting?: {
    vesting_summary: string;
    liens_summary?: string | null;
    recorded_matters?: string | null;
  };
  overall_rating_why?: string;
  overall_rating_conditions?: string;
};

export const FOCUSED_TOOL_SCHEMA = {
  name: "submit_focused_analysis",
  description:
    "Submit findings from analyzing one group of documents in a disclosure package. " +
    "A separate synthesis step will combine your findings with focused analyses of " +
    "other document groups to produce the final 14-section buyer report. Call this " +
    "tool exactly once. Populate only the fields relevant to the documents you were " +
    "given, leave others as empty arrays or null.",
  input_schema: {
    type: "object" as const,
    required: ["findings", "document_inventory", "completeness_issues", "outstanding_questions"],
    properties: {
      property_facts: {
        type: "object",
        description: "Property identification details extracted from these documents. Populate when this doc group is the most likely source (e.g., seller disclosures, prelim title).",
        properties: {
          address: { type: ["string", "null"] },
          property_type: { type: ["string", "null"] },
          year_built: { type: ["integer", "null"] },
          square_feet: { type: ["integer", "null"] },
          bedrooms: { type: ["integer", "null"] },
          bathrooms: { type: ["number", "null"] },
          list_price: { type: ["integer", "null"] },
          days_on_market: { type: ["integer", "null"] },
          market_region: { type: ["string", "null"] },
          apn: {
            type: ["string", "null"],
            description: "Assessor's Parcel Number from the prelim title report or county tax bill.",
          },
          mls_number: {
            type: ["string", "null"],
            description: "MLS listing number from the listing sheet or MLS printout.",
          },
          list_date: {
            type: ["string", "null"],
            description: "ISO date (YYYY-MM-DD) the listing went active, from the MLS printout.",
          },
          list_status: {
            type: ["string", "null"],
            enum: ["active", "pending", "sold", "withdrawn", "unknown", null],
            description: "Listing status from the MLS printout.",
          },
          zestimate: {
            type: ["integer", "null"],
            description: "Zillow Zestimate if explicitly noted in the listing materials.",
          },
          parking: {
            type: ["string", "null"],
            description: "e.g., '2-car attached garage', '1-car carport plus driveway'.",
          },
          hoa_dues_monthly: {
            type: ["integer", "null"],
            description: "Current monthly HOA dues in USD.",
          },
          hoa_last_increase_date: {
            type: ["string", "null"],
            description: "ISO date the HOA most recently raised dues, from HOA financial docs.",
          },
          hoa_last_increase_amount: {
            type: ["integer", "null"],
            description: "Dollar amount of the most recent HOA dues increase.",
          },
          cost_reference_market: {
            type: ["string", "null"],
            description: "Regional pricing reference assumed for repair-cost estimates. Default 'California Bay Area / Silicon Valley' if unclear.",
          },
          unit_number: {
            type: ["string", "null"],
            description: "Unit identifier for multi-unit properties (e.g., 'Unit 102', '#3B'). Null for SFRs.",
          },
          floor: {
            type: ["integer", "null"],
            description: "Floor number for stacked condos/townhomes. Null for SFRs and units where the floor isn't documented.",
          },
          unit_features: {
            type: ["array", "null"],
            items: { type: "string" },
            description: "Lowercase tokens describing physical features THIS specific unit has. Canonical tokens: balcony, patio, private_yard, garage_stall_assigned, in_unit_laundry, top_floor, ground_floor, fireplace, in_unit_hvac. Add more as needed. CRITICAL: only include a feature when you're confident this unit actually has it, the downstream filter drops findings about features missing from this list (so a 'balcony repair' finding gets dropped if 'balcony' isn't here, on a first-floor unit that doesn't have one).",
          },
          adu_status: {
            type: ["string", "null"],
            description:
              "ADU status when disclosed. Capture existence + permit status + separate utilities. Example: 'Unpermitted (seller-disclosed on TDS C.4: previous owner added ADU no permit); no separate utilities'. Pull verbatim where the form has explicit language; otherwise paraphrase the disclosure faithfully. Null when no ADU.",
          },
          solar_status: {
            type: ["string", "null"],
            description:
              "Solar status with vendor + ownership + title encumbrance detail. Example: 'Leased - Sunrun ($241/mo, ~2036 lease end, transferable, UCC-1 on title; original installer Vivint, acquired by Sunrun 2020)'. Pull from SPQ solar form, prelim title exceptions, and any Sunrun / SunPower / Tesla packet. Null when no solar.",
          },
          fema_flood_zone: {
            type: ["string", "null"],
            description:
              "FEMA flood zone with panel ID + effective date. Example: 'Zone AE; panel 06081C 0309F effective 4/5/2019'. Pull from the JCP NHD report or standalone Flood Determination form. Null when no flood determination in the package.",
          },
          hazard_zone_summary: {
            type: ["string", "null"],
            description:
              "One-line summary across all NHD findings. Format: 'IN <zone>; NOT IN <zone>; ...'. Example: 'IN FEMA Zone AE; IN Seismic Hazard Liquefaction Zone; NOT in FHSZ; NOT in fault zone'. Null when no hazard disclosures.",
          },
          named_sellers: {
            type: ["string", "null"],
            description:
              "Seller names from the signed TDS / SPQ. Format: 'First Last and First Last'. Null when names aren't legible.",
          },
          named_listing_team: {
            type: ["string", "null"],
            description:
              "Listing team or agent + brokerage + DRE numbers when available. Example: 'Bonafede Team at Compass (DRE 01189516 / 01190142)'. Pull from the AVID signature, MLS printout, or disclosure cover. Null when not extractable.",
          },
          disclosure_prep_service: {
            type: ["string", "null"],
            description:
              "Disclosure prep service stamped on the package (Disclosures.io, NWMLS, etc.). Null when not identifiable.",
          },
          package_date: {
            type: ["string", "null"],
            description:
              "Date the package was assembled, ISO YYYY-MM-DD when possible. NOT the date of individual forms inside, the package-level cover date. Null when no cover date.",
          },
        },
      },
      document_inventory: {
        type: "array",
        description:
          "List of documents reviewed in this pass. Populate notes RICHLY: per-doc commentary that mirrors how a real-estate professional would summarize the document for the buyer (preparer + date + report number for inspections; signing date + key disclosures for seller forms; effective date + key exceptions for prelim titles).",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", description: "e.g., TDS, SPQ, AVID, NHD, HOA, Inspection" },
            pages: { type: "integer" },
            status: {
              type: ["string", "null"],
              description:
                "Document status. 'Provided' for current documents. 'Stale (X months)' when the document is materially old (e.g., inspection >12 months before list date). 'Partial' when only part of the expected document is in the package. 'Provided per coversheet' when the cover references the doc but a separate filing wasn't found. Null when default 'Provided' is fine.",
            },
            date: {
              type: ["string", "null"],
              description: "Document date when extractable. Signing date for forms, report date for inspections. ISO YYYY-MM-DD when possible.",
            },
            notes: {
              type: ["string", "null"],
              description:
                "Per-doc analyzer commentary capturing preparer / report ID / dates / key contents. Example for an inspection: 'TAPS Termite Report #57662, dated 5/14/2026, Section I and II findings'. Example for a seller form: 'Signed by sellers Mayan Weiss and Michal Weiss on 5/16/2026; affirmatively discloses unpermitted ADU at C.4'. Example for a hazard form: 'JCP Report #3583333, dated 4/17/2026; confirms structure IS IN SFHA Zone AE on FEMA panel 06081C 0309F'.",
            },
          },
          required: ["name", "type"],
        },
      },
      completeness_issues: {
        type: "array",
        description: "Blank required sections, evasive answers, contradictions, or missing pages observed in this document group.",
        items: { type: "string" },
      },
      findings: {
        type: "array",
        description: "All findings discovered in these documents, mixed severities. Synthesis will sort and dedupe.",
        items: { $ref: "#/$defs/Finding" },
      },
      cost_estimates: {
        type: "array",
        description: "Repair / remediation cost estimates derived from these documents. Synthesis will combine across passes into the final cost summary.",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "e.g., 'Critical and high-priority repairs', 'Moderate repairs (1-5 yr)', 'HOA financial reserves'",
            },
            label: { type: "string" },
            cost: { $ref: "#/$defs/CostRange" },
          },
          required: ["category", "label", "cost"],
        },
      },
      hoa_facts: {
        type: "object",
        description: "Populate only when analyzing HOA documents.",
        properties: {
          applicable: { type: "boolean" },
          summary: { type: "string" },
          concerns: { type: "array", items: { type: "string" } },
        },
      },
      environmental_hazards: {
        type: "array",
        description: "Populate only when analyzing NHD / environmental documents.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            severity: {
              type: "string",
              enum: ["critical", "high", "moderate", "cosmetic"],
            },
            notes: { type: "string" },
          },
          required: ["name", "severity", "notes"],
        },
      },
      permit_compliance: {
        type: "object",
        description: "Populate when permit / code-compliance issues appear (most likely in seller disclosures or inspections).",
        properties: {
          summary: { type: "string" },
          findings: { type: "array", items: { $ref: "#/$defs/Finding" } },
        },
      },
      insurance_lender_notes: {
        type: "array",
        description: "Items that affect insurability or lending (e.g., FPE panel, active leak, unpermitted living-area conversion, fire-hazard zone).",
        items: { type: "string" },
      },
      outstanding_questions: {
        type: "array",
        description: "Questions for the seller or listing agent raised by these documents.",
        items: { type: "string" },
      },
      cross_document_findings: {
        type: "array",
        description:
          "Discrepancies BETWEEN documents in YOUR PASS'S DOCUMENT GROUP. Only flag inconsistencies you can directly observe from the documents handed to this pass. Examples valid for the seller_disclosures pass: TDS county field disagrees with SPQ; TDS Section III references an attached AVID that is not in the package; SPQ Section 10A discloses a 2023 water intrusion but the TDS Section II affirms 'no known plumbing defects.' Examples valid for the inspections pass: the home inspection narrative says 'aluminum branch wiring may be present' but the inspector's checklist marks 'copper only'; two inspections list different inspection dates for the same scope. Examples valid for the hoa pass: HOA minutes record an approved special assessment that the balance sheet does not reflect; reserve study age conflicts with what the minutes say. Do NOT invent cross-group inconsistencies (e.g., TDS vs Reserve Study) from inference, those belong to a downstream pass that sees all groups. Each item must populate source_docs with at least 2 entries naming the documents in tension.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Short noun-phrase title for the discrepancy. Examples: 'County misidentified on TDS and SPQ', 'AVID referenced but not attached', 'HOA capital obligation vs. cash position', 'Floor designation mismatch between listings and package MLS print'.",
            },
            description: {
              type: "string",
              description:
                "2-4 sentence paragraph explaining what each source says, what the discrepancy is, and why the buyer should care. Quote verbatim where the document references are short.",
            },
            source_docs: {
              type: "array",
              description:
                "Documents in tension, at least 2 entries, e.g., ['TDS (3/19/2026)', 'Preliminary Title Report']. Include dates / report numbers to disambiguate.",
              items: { type: "string" },
              minItems: 2,
            },
            recommended_action: {
              type: ["string", "null"],
              description:
                "Concrete remediation. Example: 'Have the listing agent correct the TDS county field and re-execute before removing the disclosure contingency.' Null when informational only.",
            },
            severity: {
              type: ["string", "null"],
              enum: ["critical", "moderate", "informational", null],
              description:
                "'critical' could materially affect closing readiness, 'moderate' should be corrected before contract but unlikely to block, 'informational' is a scrivener-level note. Defaults to 'moderate' when null.",
            },
          },
          required: ["title", "description", "source_docs"],
        },
      },
      hoa_financial_facts: {
        type: "array",
        description: "Populate when this pass is analyzing HOA financial data, see the analyzer rule on HOA fact extraction for the canonical label set.",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "string" },
          },
          required: ["label", "value"],
        },
      },
      hoa_reserve_health_read: {
        type: "string",
        description: "2-3 sentence 'our read' of reserve adequacy in plain language.",
      },
      hoa_watch_items: {
        type: "string",
        description: "1-2 sentence flag for HOA items the buyer should monitor through close.",
      },
      inspection_follow_ups: {
        type: "array",
        description: "Numbered checklist of specialists the buyer should engage during contingency to close the largest unknowns. Each item: specialist + reason + approximate cost.",
        items: {
          type: "object",
          properties: {
            specialist: { type: "string" },
            reason: { type: "string" },
            approx_cost: { type: "string" },
          },
          required: ["specialist", "reason", "approx_cost"],
        },
      },
      market_context: {
        type: "object",
        description: "Market context for the unit's sub-segment, median pricing, days on market, mortgage rate range, monthly carrying cost, and comparable units. Populate when the analyzer can ground these in the MLS printout, the listing materials, and current rate knowledge.",
        properties: {
          summary: { type: "string" },
          monthly_carrying_cost: { type: ["string", "null"] },
          mortgage_rate_range: { type: ["string", "null"] },
          median_price: { type: ["string", "null"] },
          median_dom: { type: ["integer", "null"] },
          comparable_units: {
            type: ["array", "null"],
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                status: { type: "string" },
                note: { type: ["string", "null"] },
              },
              required: ["label", "status"],
            },
          },
        },
      },
      title_vesting: {
        type: "object",
        description: "Title & vesting summary from the preliminary title report. Populate when this pass has access to the prelim.",
        properties: {
          vesting_summary: { type: "string" },
          liens_summary: { type: ["string", "null"] },
          recorded_matters: { type: ["string", "null"] },
        },
        required: ["vesting_summary"],
      },
      overall_rating_why: {
        type: "string",
        description: "2-4 sentence narrative explaining the rating drivers, what's the major upside, what kept it from being a higher tier.",
      },
      overall_rating_conditions: {
        type: "string",
        description: "Short paragraph listing the conditions that must hold for the rating to remain valid.",
      },
    },
    $defs: {
      Finding: {
        type: "object",
        properties: {
          title: { type: "string" },
          source: { type: "string", description: "e.g., 'AVID p.4', 'General Inspection p.12'" },
          severity: { type: "string", enum: ["critical", "high", "moderate", "cosmetic"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          description: { type: "string" },
          cost_estimate: { $ref: "#/$defs/CostRange" },
          risk_if_ignored: { type: "string" },
          recommended_action: { type: "string" },
          triggered_rule: {
            type: ["string", "null"],
            description:
              "OPTIONAL, when this finding's severity was upgraded to Critical because it matches an always-CRITICAL rule (FPE_panel, aluminum_wiring, polybutylene, knob_and_tube, active_mold, lead_paint_pre1978_w_children, ABS_recall_era, kitec_plumbing, asbestos_friable, underground_oil_tank, unpermitted_living_area, active_water_intrusion, structural_crack_load_bearing), set this to the short rule identifier. Leave null otherwise. Used for transparency so agents can see which rule fired.",
          },
          cost_responsibility: {
            type: ["string", "null"],
            enum: ["owner", "hoa", "shared", null],
            description:
              "Who actually pays this bill if the repair gets done. 'owner' = the buyer of this specific unit/property pays out of pocket; 'hoa' = the HOA/condo association covers it from reserves or assessments (the buyer never writes a check); 'shared' = both contribute. Default to 'owner' unless the source documents indicate the work is in a common area, on the building exterior, in shared mechanical systems, or otherwise the HOA's responsibility per the CC&Rs / governing docs. CRITICAL: if cost_responsibility = 'hoa' you must NOT mark the finding Critical based on the cost threshold alone, the dollar amount doesn't hit the buyer's pocket. The finding can still be Critical for an active hazard or insurance/lender blockability.",
          },
          source_quote: {
            type: ["string", "null"],
            description: "VERBATIM 1-3 sentence quote from the source document supporting this finding. Renders in a 'From the source document:' quote block on the PDF. Use ellipsis (…) for elided middle text. Don't paraphrase, the quote is what makes the finding auditable against the underlying document.",
          },
          what_it_is: {
            type: ["string", "null"],
            description: "Plain-language paragraph (2-4 sentences) describing the underlying THING. Lay terminology, no jargon. Example: 'The home inspector recorded the panel's branch material as both copper and aluminum, and could not fully view the bedroom subpanel because it was painted shut.'",
          },
          why_it_matters: {
            type: ["string", "null"],
            description: "Plain-language paragraph (2-4 sentences) on why the BUYER should care: safety risk, insurance/lender impact, financial exposure. Example: 'Aluminum branch wiring at 120V outlets is associated with elevated risk of overheating and fire when not properly terminated. Insurance carriers may decline or surcharge a unit with unremediated aluminum branch wiring.'",
          },
          next_step: {
            type: ["string", "null"],
            description: "Concrete, specific next action for the buyer or buyer's agent. Example: 'Have a licensed electrician open a representative number of outlets and switches to confirm whether aluminum is in branch circuits (concerning) or only in the service feeder (typical and benign). If branch is aluminum, get a written quote for COPALUM crimp or AlumiConn pigtail remediation.'",
          },
          immediate_out_of_pocket: {
            type: ["object", "null"],
            description: "Cost to INVESTIGATE the finding during the contingency window (separate from cost_estimate which is the remediation cost if confirmed). For an aluminum-wiring finding the immediate spend is ~$300-$600 for an electrician's evaluation; the remediation is $500-$4,500 per circuit if confirmed.",
            properties: {
              low: { type: "number" },
              high: { type: "number" },
              description: { type: "string" },
            },
          },
        },
        required: [
          "title",
          "source",
          "severity",
          "confidence",
          "description",
          "cost_estimate",
          "risk_if_ignored",
          "recommended_action",
        ],
      },
      CostRange: {
        type: "object",
        properties: {
          low: { type: "number" },
          high: { type: "number" },
          description: { type: "string" },
        },
        required: ["low", "high"],
      },
    },
  },
};

// JSON Schema for Claude's tool-use mechanism. Claude will fill this in
// based on the disclosure PDFs and we extract it directly from the
// tool_use block in the response.
export const REPORT_TOOL_SCHEMA = {
  name: "submit_disclosure_report",
  description:
    "Submit the complete 14-section disclosure analysis report. Call this exactly once when your analysis is complete. Every field must be populated; use null/empty arrays only when the source documents genuinely contain no information for that field.",
  input_schema: {
    type: "object" as const,
    required: [
      "property_snapshot",
      "document_inventory",
      "completeness_audit",
      "critical_findings",
      "moderate_findings",
      "cosmetic_findings",
      "permit_compliance",
      "hoa",
      "environmental",
      "cost_summary",
      "negotiation",
      "insurance_lender_risk",
      "outstanding_questions",
      "overall_rating",
    ],
    properties: {
      property_snapshot: {
        type: "object",
        properties: {
          address: { type: ["string", "null"] },
          property_type: {
            type: ["string", "null"],
            description: "e.g., SFR, Condo, Townhome, Multi-family",
          },
          year_built: { type: ["integer", "null"] },
          square_feet: { type: ["integer", "null"] },
          bedrooms: { type: ["integer", "null"] },
          bathrooms: { type: ["number", "null"] },
          list_price: { type: ["integer", "null"] },
          days_on_market: { type: ["integer", "null"] },
          market_region: {
            type: ["string", "null"],
            description:
              "e.g., 'South Bay / Silicon Valley', 'East Bay', 'LA Westside'",
          },
          apn: { type: ["string", "null"] },
          mls_number: { type: ["string", "null"] },
          list_date: { type: ["string", "null"] },
          list_status: {
            type: ["string", "null"],
            enum: ["active", "pending", "sold", "withdrawn", "unknown", null],
          },
          zestimate: { type: ["integer", "null"] },
          parking: { type: ["string", "null"] },
          hoa_dues_monthly: { type: ["integer", "null"] },
          hoa_last_increase_date: { type: ["string", "null"] },
          hoa_last_increase_amount: { type: ["integer", "null"] },
          cost_reference_market: { type: ["string", "null"] },
          unit_number: { type: ["string", "null"] },
          floor: { type: ["integer", "null"] },
          unit_features: {
            type: ["array", "null"],
            items: { type: "string" },
          },
          adu_status: {
            type: ["string", "null"],
            description:
              "ADU status with permit + utilities detail when disclosed. Example: 'Unpermitted (seller-disclosed on TDS C.4 previous owner added ADU no permit); no separate utilities'. Null when no ADU.",
          },
          solar_status: {
            type: ["string", "null"],
            description:
              "Solar status with vendor + ownership + title encumbrance. Example: 'Leased - Sunrun ($241/mo, ~2036 lease end, transferable, UCC-1 on title)'. Null when no solar.",
          },
          fema_flood_zone: {
            type: ["string", "null"],
            description:
              "FEMA flood zone + panel ID + effective date. Example: 'Zone AE; panel 06081C 0309F effective 4/5/2019'. Null when no flood determination.",
          },
          hazard_zone_summary: {
            type: ["string", "null"],
            description:
              "One-line hazard-zone summary. Example: 'IN FEMA Zone AE; IN Seismic Hazard Liquefaction Zone; NOT in FHSZ; NOT in fault zone'. Null when no hazard disclosures.",
          },
          named_sellers: {
            type: ["string", "null"],
            description: "Seller names from signed TDS / SPQ.",
          },
          named_listing_team: {
            type: ["string", "null"],
            description: "Listing team / agent + brokerage + DRE numbers.",
          },
          disclosure_prep_service: {
            type: ["string", "null"],
            description: "Package prep service (Disclosures.io, NWMLS, etc.).",
          },
          package_date: {
            type: ["string", "null"],
            description: "Package assembly date (ISO when possible).",
          },
        },
        required: [
          "address",
          "property_type",
          "year_built",
          "square_feet",
          "bedrooms",
          "bathrooms",
          "list_price",
          "days_on_market",
          "market_region",
        ],
      },
      document_inventory: {
        type: "object",
        properties: {
          documents_provided: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: {
                  type: "string",
                  description: "e.g., TDS, SPQ, AVID, NHD, HOA, Inspection, Other",
                },
                pages: { type: "integer" },
                status: {
                  type: ["string", "null"],
                  description:
                    "Document status. 'Provided' / 'Stale (X months)' / 'Partial' / 'Provided per coversheet'.",
                },
                date: {
                  type: ["string", "null"],
                  description:
                    "Document date when extractable, ISO when possible.",
                },
                notes: {
                  type: ["string", "null"],
                  description:
                    "Per-doc commentary: preparer / report ID / dates / key contents. Example: 'TAPS Termite Report #57662, dated 5/14/2026, Section I and II findings'.",
                },
              },
              required: ["name", "type"],
            },
          },
          documents_missing: {
            type: "array",
            items: { type: "string" },
            description:
              "Standard CA disclosures NOT in the package. Each entry should explain WHY it's missing in line when material (e.g., 'HOA Reserve Study (CA Civ Code 5550 requires every 3 years; not in package)' rather than just 'HOA Reserve Study').",
          },
        },
        required: ["documents_provided", "documents_missing"],
      },
      completeness_audit: {
        type: "object",
        properties: {
          summary: { type: "string" },
          issues: {
            type: "array",
            items: { type: "string" },
            description:
              "Blank required sections, evasive answers, contradictions between docs",
          },
        },
        required: ["summary", "issues"],
      },
      critical_findings: { type: "array", items: { $ref: "#/$defs/Finding" } },
      moderate_findings: { type: "array", items: { $ref: "#/$defs/Finding" } },
      cosmetic_findings: { type: "array", items: { $ref: "#/$defs/Finding" } },
      permit_compliance: {
        type: "object",
        properties: {
          summary: { type: "string" },
          findings: { type: "array", items: { $ref: "#/$defs/Finding" } },
        },
        required: ["summary", "findings"],
      },
      hoa: {
        type: "object",
        properties: {
          applicable: { type: "boolean" },
          summary: { type: "string" },
          concerns: { type: "array", items: { type: "string" } },
          facts: {
            type: ["array", "null"],
            description:
              "Compact KV facts from the HOA package, Master policy carrier + phone, Master policy premium, Operating account range, Reserves range, Dues, Special assessment status, Capital projects approved, Litigation, Collections, Rental restriction, Age restriction, Reserve study cadence, etc. Free-form label/value pairs so we can add more without a schema change.",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["label", "value"],
            },
          },
          reserve_health_read: {
            type: ["string", "null"],
            description:
              "2-3 sentence editorial paragraph on whether reserves are adequate, the current dues trajectory, and how this HOA compares to typical CA HOAs of the same age + unit count.",
          },
          watch_items: {
            type: ["string", "null"],
            description:
              "1-2 sentence prose flag for HOA items the buyer should monitor through close (mid-project contractor switches, unit-by-unit water-intrusion patterns, etc.). Not a hard finding, a heads-up for the diligence list.",
          },
        },
        required: ["applicable", "summary", "concerns"],
      },
      environmental: {
        type: "object",
        properties: {
          summary: { type: "string" },
          hazards: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                severity: {
                  type: "string",
                  enum: ["critical", "high", "moderate", "cosmetic"],
                },
                notes: { type: "string" },
              },
              required: ["name", "severity", "notes"],
            },
          },
        },
        required: ["summary", "hazards"],
      },
      cost_summary: {
        type: "object",
        properties: {
          critical_high_total: { $ref: "#/$defs/CostRange" },
          moderate_total: { $ref: "#/$defs/CostRange" },
          grand_total: { $ref: "#/$defs/CostRange" },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      cost: { $ref: "#/$defs/CostRange" },
                    },
                    required: ["label", "cost"],
                  },
                },
              },
              required: ["category", "items"],
            },
          },
        },
        required: [
          "critical_high_total",
          "moderate_total",
          "grand_total",
          "line_items",
        ],
      },
      negotiation: {
        type: "object",
        properties: {
          summary: { type: "string" },
          leverage_points: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "leverage_points"],
      },
      insurance_lender_risk: {
        type: "object",
        properties: {
          summary: { type: "string" },
          insurance_concerns: { type: "array", items: { type: "string" } },
          lender_concerns: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "insurance_concerns", "lender_concerns"],
      },
      outstanding_questions: {
        type: "array",
        items: { type: "string" },
      },
      cross_document_findings: {
        type: ["array", "null"],
        description:
          "Discrepancies BETWEEN documents in the same disclosure package. Each item names the documents in tension and explains why the discrepancy matters. ONLY include findings where two or more source documents disagree, where a document references an attachment that is not in the package, or where the package contradicts itself in a way the buyer should know about. Examples of valid cross-document findings: (1) TDS describes the property as in Santa Clara County, but the preliminary title report and NHD both show San Mateo County. (2) TDS Section III checks 'See attached AVID,' but no standalone AVID form is included in the package. (3) HOA minutes record an approved $154,280 elevator special assessment, but the HOA balance sheet shows only $40,891 in total assets. (4) The MLS print public-remarks describe 'third floor' but every live listing for the property says 'second floor.' (5) Seller's TDS Section II checks 'no known defects in plumbing,' but the home inspection notes an active leak at the kitchen sink supply. Do NOT use this field for single-source findings, those belong in critical_findings or moderate_findings. Each item must populate source_docs with at least two entries.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Short noun-phrase title for the discrepancy. Examples: 'County misidentified on TDS and SPQ', 'AVID referenced but not attached', 'HOA capital obligation vs. cash position', 'Floor designation mismatch between listings and package MLS print'.",
            },
            description: {
              type: "string",
              description:
                "2-4 sentence paragraph explaining what each source says, what the discrepancy is, and why the buyer should care. Quote the disagreeing language verbatim where the document references are short. Example: 'Both the Real Estate Transfer Disclosure Statement and the Seller Property Questionnaire describe the property as situated in the COUNTY OF Santa Clara. The MLS print, the JCP Natural Hazard Disclosure report, the Preliminary Title report, the original 1972 CC&Rs, and the live Zillow listing all confirm the property is in San Mateo County. Menlo Park is in San Mateo County. This is a scrivener error that should be corrected on the listing-side disclosures before contract, since the county appears in the legal description used for service of notice.'",
            },
            source_docs: {
              type: "array",
              description:
                "Source documents in tension, e.g., ['TDS (3/19/2026)', 'Preliminary Title Report']. Minimum 2 entries because by definition the finding is a disagreement between two or more sources. Include dates / report numbers when known to disambiguate.",
              items: { type: "string" },
              minItems: 2,
            },
            recommended_action: {
              type: ["string", "null"],
              description:
                "Concrete action the buyer or buyer's agent should take to resolve the discrepancy before contract. Example: 'Have the listing agent correct the TDS county field and re-execute before removing the disclosure contingency.' Null when there's no clear remediation, the discrepancy is informational only.",
            },
            severity: {
              type: ["string", "null"],
              enum: ["critical", "moderate", "informational", null],
              description:
                "'critical' = discrepancy could materially affect closing readiness or the buyer's decision (e.g., title-county mismatch, missing referenced disclosure). 'moderate' = should be corrected before contract but unlikely to block. 'informational' = scrivener-level note for the record. Defaults to 'moderate' when null.",
            },
          },
          required: ["title", "description", "source_docs"],
        },
      },
      inspection_follow_ups: {
        type: ["array", "null"],
        description:
          "Numbered checklist of specialists the buyer should engage during their contingency period to close the largest unknowns. Each item is a specialist + reason + approximate cost. Example: {specialist: 'Licensed electrician', reason: 'Verify aluminum vs. copper branch wiring; quote remediation if confirmed', approx_cost: '$300-$600'}.",
        items: {
          type: "object",
          properties: {
            specialist: { type: "string" },
            reason: { type: "string" },
            approx_cost: { type: "string" },
          },
          required: ["specialist", "reason", "approx_cost"],
        },
      },
      market_context: {
        type: ["object", "null"],
        description:
          "Market context for the unit's sub-segment: median pricing, days on market, mortgage rate environment, monthly carrying cost, and comparable units. Optional, populate when the documents + analyzer's knowledge are sufficient.",
        properties: {
          summary: {
            type: "string",
            description: "2-3 sentence narrative of the market context for this specific unit type/size/location.",
          },
          monthly_carrying_cost: {
            type: ["string", "null"],
            description: "Calculated monthly carrying cost at the list price including PITI + HOA. Example: '$3,500-$3,650 before insurance' for a $467K purchase with 20% down at 6.625%.",
          },
          mortgage_rate_range: {
            type: ["string", "null"],
            description: "Current mortgage rate range for the buyer's likely loan profile.",
          },
          median_price: {
            type: ["string", "null"],
            description: "Median price for the unit's segment in the local market.",
          },
          median_dom: {
            type: ["integer", "null"],
            description: "Median days on market for the segment.",
          },
          comparable_units: {
            type: ["array", "null"],
            description: "Within-complex + adjacent-building comparables. Each item is a label, status, and optional note.",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                status: { type: "string" },
                note: { type: ["string", "null"] },
              },
              required: ["label", "status"],
            },
          },
        },
        required: ["summary"],
      },
      title_vesting: {
        type: ["object", "null"],
        description:
          "Title & vesting summary from the preliminary title report. Captures how the unit is vested, liens of note, and recorded matters touching the project. Optional, populate when the prelim title document is in the package.",
        properties: {
          vesting_summary: {
            type: "string",
            description: "Narrative of how the unit is vested (sole, joint, tenants-in-common with percentages, trust, LLC, etc.) and the property estate type (e.g., 'condominium in fee, comprised of Unit X of Tract Y').",
          },
          liens_summary: {
            type: ["string", "null"],
            description: "Liens of note from the prelim, first deed of trust (lender + original principal), second mortgages, PACE/HERO, mechanic's liens, notices of default.",
          },
          recorded_matters: {
            type: ["string", "null"],
            description: "Recorded matters touching the project, prior litigation settlements, easements (Comcast, PG&E), CC&R recording details, etc.",
          },
        },
        required: ["vesting_summary"],
      },
      overall_rating: {
        type: "object",
        properties: {
          label: {
            type: "string",
            enum: [
              "Excellent",
              "Good",
              "Acceptable",
              "Significant Concerns",
              "Walk Away",
            ],
          },
          summary: {
            type: "string",
            description: "One-line summary that renders inside the rating pill. Example: 'A workable file with a small number of follow-ups before contingency removal.'",
          },
          contingency_advice: { type: "string" },
          why_this_rating: {
            type: ["string", "null"],
            description: "2-4 sentence narrative explaining the rating drivers. What's the major upside? What kept it from being a higher tier?",
          },
          conditions_on_which_this_depends: {
            type: ["string", "null"],
            description: "Short paragraph listing the major conditions that must hold for the rating to remain valid (e.g., 'no aluminum branch wiring confirmed in the unit', 'no widespread ABS failure across the complex', 'Section I termite clearance completed by seller').",
          },
        },
        required: ["label", "summary", "contingency_advice"],
      },
    },
    $defs: {
      Finding: {
        type: "object",
        properties: {
          title: { type: "string" },
          source: {
            type: "string",
            description: "e.g., 'AVID p.4', 'General Inspection p.12'",
          },
          severity: {
            type: "string",
            enum: ["critical", "high", "moderate", "cosmetic"],
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          description: { type: "string" },
          cost_estimate: { $ref: "#/$defs/CostRange" },
          risk_if_ignored: { type: "string" },
          recommended_action: { type: "string" },
          triggered_rule: {
            type: ["string", "null"],
            description:
              "OPTIONAL, when this finding's severity was upgraded to Critical because it matches an always-CRITICAL rule (FPE_panel, aluminum_wiring, polybutylene, knob_and_tube, active_mold, lead_paint_pre1978_w_children, ABS_recall_era, kitec_plumbing, asbestos_friable, underground_oil_tank, unpermitted_living_area, active_water_intrusion, structural_crack_load_bearing), set this to the short rule identifier. Leave null otherwise. Used for transparency so agents can see which rule fired.",
          },
          cost_responsibility: {
            type: ["string", "null"],
            enum: ["owner", "hoa", "shared", null],
            description:
              "Who actually pays this bill if the repair gets done. 'owner' = the buyer of this specific unit/property pays out of pocket; 'hoa' = the HOA/condo association covers it from reserves or assessments (the buyer never writes a check); 'shared' = both contribute. Default to 'owner' unless the source documents indicate the work is in a common area, on the building exterior, in shared mechanical systems, or otherwise the HOA's responsibility per the CC&Rs / governing docs. CRITICAL: if cost_responsibility = 'hoa' you must NOT mark the finding Critical based on the cost threshold alone, the dollar amount doesn't hit the buyer's pocket. The finding can still be Critical for an active hazard or insurance/lender blockability.",
          },
          source_quote: {
            type: ["string", "null"],
            description: "VERBATIM 1-3 sentence quote from the source document supporting this finding. Renders in a 'From the source document:' quote block on the PDF. Use ellipsis (…) for elided middle text. Don't paraphrase, the quote is what makes the finding auditable against the underlying document.",
          },
          what_it_is: {
            type: ["string", "null"],
            description: "Plain-language paragraph (2-4 sentences) describing the underlying THING. Lay terminology, no jargon. Example: 'The home inspector recorded the panel's branch material as both copper and aluminum, and could not fully view the bedroom subpanel because it was painted shut.'",
          },
          why_it_matters: {
            type: ["string", "null"],
            description: "Plain-language paragraph (2-4 sentences) on why the BUYER should care: safety risk, insurance/lender impact, financial exposure. Example: 'Aluminum branch wiring at 120V outlets is associated with elevated risk of overheating and fire when not properly terminated. Insurance carriers may decline or surcharge a unit with unremediated aluminum branch wiring.'",
          },
          next_step: {
            type: ["string", "null"],
            description: "Concrete, specific next action for the buyer or buyer's agent. Example: 'Have a licensed electrician open a representative number of outlets and switches to confirm whether aluminum is in branch circuits (concerning) or only in the service feeder (typical and benign). If branch is aluminum, get a written quote for COPALUM crimp or AlumiConn pigtail remediation.'",
          },
          immediate_out_of_pocket: {
            type: ["object", "null"],
            description: "Cost to INVESTIGATE the finding during the contingency window (separate from cost_estimate which is the remediation cost if confirmed). For an aluminum-wiring finding the immediate spend is ~$300-$600 for an electrician's evaluation; the remediation is $500-$4,500 per circuit if confirmed.",
            properties: {
              low: { type: "number" },
              high: { type: "number" },
              description: { type: "string" },
            },
          },
        },
        required: [
          "title",
          "source",
          "severity",
          "confidence",
          "description",
          "cost_estimate",
          "risk_if_ignored",
          "recommended_action",
        ],
      },
      CostRange: {
        type: "object",
        properties: {
          low: { type: "number" },
          high: { type: "number" },
          description: { type: "string" },
        },
        required: ["low", "high"],
      },
    },
  },
};
