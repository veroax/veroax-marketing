// Single source of truth for the per-Claude-call page budget AND the
// per-group transport mode (PDF attachment vs. extracted text).
//
// Previously these two constants lived twice: once in
// lib/server/performAnalysis.ts (named PDF_PER_CALL_PAGE_BUDGET +
// GROUP_TRANSPORT) and once in lib/anthropic/analyze.ts (named
// PDF_PASS_PAGE_BUDGET + GROUP_MODE) with comments warning that they
// "must stay in sync." That kind of drift hazard is exactly the
// situation a shared module solves. This file is now the canonical
// definition; both callers import from here.
//
// Note the names: we use the analyze.ts spellings (PDF_PASS_PAGE_BUDGET,
// GROUP_MODE) as canonical here since they're more accurate, the value
// is a per-pass cap, not a per-call cap, and "mode" is what the analyzer
// actually keys on. performAnalysis.ts now re-exports them under its
// old names for backwards compatibility within that file.

import type { PassGroup } from "@/lib/pdf/classify";

// Claude's PDF attachment input is metered roughly at ~1,500 tokens
// per page (vs. ~300 tokens for extracted text). A 100-page PDF
// alone is ~150K tokens; with the analyzer's prompt + the structured
// schema instruction we sit comfortably under the 200K context.
// Older uploads sometimes have larger MAX_PAGES_PER_CHUNK so the
// pre-analyzer splitter in performAnalysis re-splits anything bigger
// than this into <=60-page sub-documents before reaching Claude.
export const PDF_PASS_PAGE_BUDGET = 60;

// Per-group mode. PDF mode sends native PDF attachments to Claude
// (preserves check-boxes, signatures, side-by-side seller/agent
// disclosure tables, severity icons in inspection reports, the
// stuff that drives the most consequential findings). Text mode
// sends extracted strings (cheaper, fine for layout-irrelevant
// long-form documents like HOA CC&Rs and reserve studies).
export const GROUP_MODE: Record<PassGroup, "pdf" | "text"> = {
  seller_disclosures: "pdf",
  inspections: "pdf",
  hoa: "text",
  hazards: "text",
};
