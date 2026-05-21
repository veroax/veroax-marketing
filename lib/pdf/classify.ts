// Document classifier — determines what kind of disclosure document a
// PDF represents based on its filename. Used by the multi-pass analyzer
// to route each document to the right focused analysis pass.
//
// Disclosures.io and similar tools name files predictably (numbered
// prefix + category name), so filename matching covers the bulk of
// real-world packages. Anything that doesn't match falls into "other"
// and is analyzed with the seller-disclosures pass (broadest scope).

export type DocumentType =
  | "seller_disclosures" // TDS, SPQ, AVID, general disclosures
  | "inspections"        // property/home inspection, termite, mold, sewer
  | "hoa"                // HOA package, CC&Rs, bylaws, financials, reserve study
  | "title"              // preliminary title report, prelim, escrow
  | "hazards"            // NHD, natural hazard disclosures, environmental
  | "cover"              // coversheet, table of contents, index
  | "other";             // anything unrecognized

// Order matters — first match wins. More specific patterns go first
// (e.g., "termite" matches inspections before generic "report" patterns).
const PATTERNS: Array<[DocumentType, RegExp]> = [
  ["cover", /coversheet|cover[\s_-]*sheet|table.of.contents|^[0-9]+[\s_.-]*(toc|index)\.pdf$/i],
  ["hazards", /\bnhd\b|natural[\s_-]*hazard|environmental[\s_-]*hazard|flood[\s_-]*zone|earthquake[\s_-]*zone|fire[\s_-]*hazard/i],
  ["inspections", /\binspection|home[\s_-]*inspection|property[\s_-]*inspection|termite|pest|mold|sewer[\s_-]*lateral|roof[\s_-]*inspect|chimney|hvac|wood[\s_-]*destroying/i],
  ["hoa", /\bhoa\b|homeowner|cc[&]?r|cc&r|bylaws|condo[\s_-]*assoc|reserve[\s_-]*study|condominium|hoa[\s_-]*docs|hoa[\s_-]*disclosure/i],
  ["title", /prelim|preliminary[\s_-]*report|preliminary[\s_-]*title|\btitle[\s_-]*report|escrow[\s_-]*instructions/i],
  ["seller_disclosures", /disclosure|\btds\b|\bspq\b|\bavid\b|transfer[\s_-]*disclosure|seller[\s_-]*property|seller[\s_-]*questionnaire|agent[\s_-]*visual/i],
];

export function classifyDocument(filename: string): DocumentType {
  for (const [type, pattern] of PATTERNS) {
    if (pattern.test(filename)) return type;
  }
  return "other";
}

// Friendlier names for status messages / audit logs.
export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  seller_disclosures: "Seller disclosures",
  inspections: "Inspection reports",
  hoa: "HOA package",
  title: "Title & escrow",
  hazards: "Natural hazards",
  cover: "Coversheet",
  other: "Other",
};

// Pass-group key (multiple types collapsed for analysis). Cover and
// title don't need their own focused pass — they're folded into the
// seller-disclosures pass since the content overlaps with what the
// agent context naturally needs.
export type PassGroup =
  | "seller_disclosures"
  | "inspections"
  | "hoa"
  | "hazards";

export function passGroupFor(type: DocumentType): PassGroup {
  switch (type) {
    case "inspections":
      return "inspections";
    case "hoa":
      return "hoa";
    case "hazards":
      return "hazards";
    case "seller_disclosures":
    case "title":
    case "cover":
    case "other":
    default:
      return "seller_disclosures";
  }
}
