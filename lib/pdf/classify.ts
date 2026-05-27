// Document classifier, determines what kind of disclosure document a
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

// Tokenize a filename: split on anything that isn't a letter/digit so
// underscores, dots, dashes, and spaces all become word boundaries.
// We do this because regex \b treats _ as a word character, so a file
// named "6._NHD_Report.pdf" doesn't word-boundary-match \bnhd\b. Tokens
// solve that cleanly.
function tokens(filename: string): string[] {
  return filename
    .toLowerCase()
    .replace(/\.pdf$/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Order matters, first match wins. More specific patterns go first
// (e.g., "termite" matches inspections before generic "report" patterns).
const TYPE_RULES: Array<[DocumentType, (toks: string[], full: string) => boolean]> = [
  // Coversheets
  ["cover", (t) => t.includes("coversheet") || (t.includes("cover") && t.includes("sheet")) || t.includes("toc") || t.includes("index")],

  // Natural hazard / environmental
  [
    "hazards",
    (t, f) =>
      t.includes("nhd") ||
      /natural[\s_-]*hazard/i.test(f) ||
      /environmental[\s_-]*hazard/i.test(f) ||
      /flood[\s_-]*zone/i.test(f) ||
      /earthquake[\s_-]*zone/i.test(f) ||
      /fire[\s_-]*hazard/i.test(f),
  ],

  // Inspections (broad, anything inspection-related)
  [
    "inspections",
    (t, f) =>
      t.some((x) =>
        ["inspection", "inspections", "termite", "pest", "mold", "chimney", "hvac"].includes(x),
      ) ||
      /sewer[\s_-]*lateral/i.test(f) ||
      /roof[\s_-]*inspect/i.test(f) ||
      /wood[\s_-]*destroying/i.test(f),
  ],

  // HOA / condo association
  [
    "hoa",
    (t, f) =>
      t.some((x) =>
        ["hoa", "homeowner", "homeowners", "bylaws", "condo", "condominium", "ccr", "ccrs"].includes(x),
      ) ||
      /cc&r/i.test(f) ||
      /reserve[\s_-]*study/i.test(f),
  ],

  // Title / escrow
  [
    "title",
    (t, f) =>
      t.includes("prelim") ||
      t.includes("preliminary") ||
      t.includes("escrow") ||
      /title[\s_-]*report/i.test(f),
  ],

  // Seller disclosures (broadest, checked last so more specific types win)
  [
    "seller_disclosures",
    (t, f) =>
      t.some((x) => ["disclosure", "disclosures", "tds", "spq", "avid"].includes(x)) ||
      /transfer[\s_-]*disclosure/i.test(f) ||
      /seller[\s_-]*property/i.test(f) ||
      /seller[\s_-]*questionnaire/i.test(f) ||
      /agent[\s_-]*visual/i.test(f),
  ],
];

export function classifyDocument(filename: string): DocumentType {
  const toks = tokens(filename);
  for (const [type, predicate] of TYPE_RULES) {
    if (predicate(toks, filename)) return type;
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
// title don't need their own focused pass, they're folded into the
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
