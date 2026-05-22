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
  // applies — most findings won't have this.
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
  overall_rating: {
    label: "Excellent" | "Good" | "Acceptable" | "Significant Concerns" | "Walk Away";
    summary: string;
    contingency_advice: string;
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
// Focused-pass schema — used by per-document-group analysis calls in the
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
};

export const FOCUSED_TOOL_SCHEMA = {
  name: "submit_focused_analysis",
  description:
    "Submit findings from analyzing one group of documents in a disclosure package. " +
    "A separate synthesis step will combine your findings with focused analyses of " +
    "other document groups to produce the final 14-section buyer report. Call this " +
    "tool exactly once. Populate only the fields relevant to the documents you were " +
    "given — leave others as empty arrays or null.",
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
              "OPTIONAL — when this finding's severity was upgraded to Critical because it matches an always-CRITICAL rule (FPE_panel, aluminum_wiring, polybutylene, knob_and_tube, active_mold, lead_paint_pre1978_w_children, ABS_recall_era, kitec_plumbing, asbestos_friable, underground_oil_tank, unpermitted_living_area, active_water_intrusion, structural_crack_load_bearing), set this to the short rule identifier. Leave null otherwise. Used for transparency so agents can see which rule fired.",
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
          summary: { type: "string" },
          contingency_advice: { type: "string" },
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
              "OPTIONAL — when this finding's severity was upgraded to Critical because it matches an always-CRITICAL rule (FPE_panel, aluminum_wiring, polybutylene, knob_and_tube, active_mold, lead_paint_pre1978_w_children, ABS_recall_era, kitec_plumbing, asbestos_friable, underground_oil_tank, unpermitted_living_area, active_water_intrusion, structural_crack_load_bearing), set this to the short rule identifier. Leave null otherwise. Used for transparency so agents can see which rule fired.",
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
