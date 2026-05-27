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
    // Optional companion note that renders after the MLS number on
    // the cover and property snapshot. Populated by the listing-data
    // reconciliation step when the property has cancelled prior MLS
    // numbers: "current; prior MLS 82039496 and 82044514 cancelled".
    // Null when there's only one MLS number in the property's history.
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
  };
  document_inventory: {
    documents_provided: Array<{ name: string; type: string; pages?: number }>;
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
    // 1-2 sentence flag rendered above the relist ladder when the
    // three reconciled sources (package MLS print-out, agent's
    // listing URL, live web search) disagreed on price / MLS# /
    // status / list date. Tells the buyer "the package's static MLS
    // sheet doesn't match the live listing." Null when the sources
    // agreed.
    listing_divergence_note?: string | null;
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
        },
      },
      document_inventory: {
        type: "array",
        description: "List of documents reviewed in this pass.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", description: "e.g., TDS, SPQ, AVID, NHD, HOA, Inspection" },
            pages: { type: "integer" },
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
              },
              required: ["name", "type"],
            },
          },
          documents_missing: {
            type: "array",
            items: { type: "string" },
            description: "Standard CA disclosures that are NOT in this package",
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
