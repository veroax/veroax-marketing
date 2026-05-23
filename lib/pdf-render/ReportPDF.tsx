/* eslint-disable jsx-a11y/alt-text */

// Veroax disclosure analysis PDF — modeled on the Cowork output layout.
// React-PDF (works in Vercel serverless without Chrome).
//
// IMPORTANT layout rules learned the hard way:
//   - No "border*" properties. They crash React-PDF on certain
//     layouts. Use 1px View separators instead.
//   - No Text with backgroundColor. Wrap in View.
//   - No `gap`, `flexWrap`, `alignSelf: "flex-start"`, `wrap={false}`,
//     or `position: "absolute"` + `fixed` combinations.

import React from "react";
import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type {
  ReportData,
  Finding,
  CostRange,
  Severity,
} from "@/lib/anthropic/schema";
import { composeExecutiveNarrative } from "@/lib/reports/narrative";

// ============================================================================
// Color palette (matches Cowork disclosure analyzer)
// ============================================================================

// Severity colors follow a strict red-yellow-green traffic-light scheme:
//   critical → red (stop)
//   high     → red-orange (urgent)
//   moderate → amber (caution)
//   cosmetic → pale gray (de-emphasized; not a severity signal)
//   positive → green (good news / strengths)
// Structural chrome (section banners, cost-summary header bars, grand
// total bar) stays navy/slate for professionalism — only the severity
// language uses traffic-light colors.
const C = {
  navy: "#1B2A4A",
  slate: "#2E4057",
  accent: "#2E86AB",
  gold: "#C9A84C",
  critical: "#C0392B", // red — stop
  high: "#E67E22", // red-orange — urgent
  moderate: "#F39C12", // amber — caution (was blue #2980B9)
  cosmetic: "#9CA3AF", // pale gray — de-emphasized
  positive: "#27AE60", // green — go / strengths
  light: "#F4F7FA",
  rowAlt: "#EBF2FA",
  border: "#D0DCE8",
  text: "#1A1A2E",
  subtext: "#4A4A6A",
  white: "#FFFFFF",
  strengthsBg: "#EAF7EF", // light green (matches C.positive)
  concernsBg: "#FDECEA", // light red (matches C.critical)
} as const;

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  page: {
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: C.text,
    lineHeight: 1.4,
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
  },
  coverPage: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: C.text,
    lineHeight: 1.4,
    padding: 0,
    // Without flexDirection on the Page, children don't flex-grow to
    // fill the page height. The coverWrap (a single child) needs to
    // fill the page so the gold/brand accent bar runs top-to-bottom.
    flexDirection: "column",
  },
  // Cover layout — flexGrow:1 stretches the wrap to fill the full
  // page height so the accent bar runs edge-to-edge. We previously
  // had a minHeight here that crashed React-PDF; flex growth is the
  // safe equivalent.
  coverWrap: {
    flexDirection: "row",
    flexGrow: 1,
  },
  coverAccentBar: {
    width: 24,
    backgroundColor: C.gold,
  },
  coverInner: {
    flexGrow: 1,
    paddingTop: 56,
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  // Top row of the cover panel — holds the eyebrow text on the left
  // and the brokerage logo (when set) on the right. Renders as a
  // single row; the eyebrow grows to fill remaining width.
  coverTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  coverEyebrow: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.gold,
  },
  coverLogo: {
    maxWidth: 140,
    maxHeight: 48,
    // React-PDF Image scales to fit within these maxima while
    // preserving aspect ratio. Empty src never gets here (we
    // conditionally render).
  },
  coverTitle: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    // Explicit lineHeight + larger marginBottom prevents the wrapped
    // second line of a long address from visually colliding with the
    // coverSubtitle below. React-PDF's default lineHeight inheritance
    // can otherwise produce overlapping baselines at this font size.
    lineHeight: 1.15,
    marginBottom: 6,
  },
  coverSubtitle: {
    fontSize: 13,
    color: C.slate,
    lineHeight: 1.3,
    marginBottom: 10,
  },
  coverDivider: {
    height: 1,
    backgroundColor: C.border,
    marginTop: 10,
    marginBottom: 14,
  },
  // Key/value table
  kvRow: {
    flexDirection: "row",
  },
  kvRowAlt: {
    flexDirection: "row",
    backgroundColor: C.rowAlt,
  },
  kvLabel: {
    width: 130,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: C.slate,
  },
  kvValue: {
    // flexGrow allows the value to fill remaining row width.
    // flexShrink lets React-PDF shrink the cell BELOW its content's
    // intrinsic width (e.g., a long URL) so the text wraps instead of
    // pushing the row off the page. Without flexShrink the cell expands
    // and overflows the page edge.
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 9,
    color: C.text,
  },
  // Section heading — replaced the previous big navy banner with
  // simple typography matching the Cowork-skill style: "N. Title"
  // in dark navy at section-header weight. The big banner was
  // visually heavy and interrupted the reading flow on every section.
  // The doc's running header (running header at the very top of
  // every page) carries the navy chrome instead.
  sectionHeading: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginTop: 16,
    marginBottom: 8,
  },
  // Findings — Cowork-style cards. The card itself is a light tinted
  // panel (no left accent strip; tint is the only chrome) with a
  // bold title + severity pill at the top, then the verbatim source
  // quote in an italic block, then the narrative sections (What it
  // is / Why it matters / Next step) each labeled, then the cost
  // line and confidence at the bottom.
  findingCard: {
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: C.light,
  },
  findingHeader: {
    flexDirection: "row",
    marginBottom: 6,
  },
  findingTitle: {
    // flexShrink:1 prevents a long finding title from pushing the
    // severity badge off the right edge of the card.
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: C.critical,
    paddingRight: 8,
  },
  // Verbatim source quote block — italic body with a labeled lead-in.
  findingQuoteLabel: {
    fontSize: 9,
    color: C.subtext,
    fontStyle: "italic",
    marginBottom: 3,
  },
  findingQuote: {
    fontSize: 9.5,
    color: C.text,
    fontStyle: "italic",
    lineHeight: 1.55,
    marginBottom: 6,
    paddingLeft: 10,
  },
  // Source citation — small italic line below the quote.
  findingSourceCitation: {
    fontSize: 9,
    color: C.subtext,
    marginBottom: 10,
  },
  // Labels for the narrative paragraphs ("What it is:", "Why it
  // matters:", "Next step:"). Inline-bold lead-in to the paragraph
  // so the visual rhythm matches the Cowork sample where the label
  // is the same font weight as the paragraph but bold.
  findingNarrativeLabel: {
    fontFamily: "Helvetica-Bold",
  },
  findingNarrativePara: {
    fontSize: 10,
    color: C.text,
    lineHeight: 1.55,
    marginBottom: 8,
  },
  // Cost line + confidence row.
  findingCostLine: {
    fontSize: 10,
    color: C.text,
    lineHeight: 1.5,
    marginTop: 4,
    marginBottom: 4,
  },
  findingConfidence: {
    fontSize: 9,
    color: C.positive,
    marginTop: 4,
  },
  source: {
    fontSize: 8.5,
    color: C.subtext,
    fontStyle: "italic",
    marginBottom: 4,
  },
  // Property snapshot — compact inline summary instead of a tall
  // KvTable. Dot-separated facts on one line; supplemental "Analysis
  // date" line below in muted color so the reader sees the key facts
  // first.
  propertySnapshotInline: {
    fontSize: 10.5,
    color: C.text,
    lineHeight: 1.45,
    marginBottom: 4,
  },
  propertySnapshotMeta: {
    fontSize: 9,
    color: C.subtext,
    marginBottom: 4,
  },
  // Stacked label/value pair inside a FindingBlock. Replaces the
  // previous two-column KvTable for finding details where the values
  // (Risk if Ignored, Recommended Action) are sentence-length and were
  // overflowing the column.
  findingDetailRow: {
    marginTop: 6,
  },
  findingDetailLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.slate,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  findingDetailValue: {
    fontSize: 9,
    color: C.text,
    lineHeight: 1.45,
  },
  description: {
    // Bumped 9 → 9.5 to match the base body size — the FindingBlock
    // description and a body paragraph elsewhere are the same kind of
    // information, so they should set at the same size.
    fontSize: 9.5,
    marginBottom: 4,
    lineHeight: 1.5,
  },
  // Severity badge
  badgeBox: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: C.white,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  // Disclaimer block
  disclaimerHead: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 4,
  },
  disclaimer: {
    fontSize: 8,
    color: C.slate,
    marginBottom: 4,
    lineHeight: 1.4,
  },
  // Prepared-by panel
  // Headshot + name stack: when a headshot is set, this row lays out
  // the thumbnail to the left of the metadata stack. Without it, the
  // stack flows naturally because the row contains a single child.
  preparedByRow: {
    flexDirection: "row",
  },
  preparedByHeadshot: {
    width: 36,
    height: 36,
    // React-PDF doesn't reliably clip with borderRadius on Image, but
    // a small rounded thumb still reads as "agent photo" in context.
    // The settings preview shows a true circle on screen; on the PDF
    // it's a rounded square — acceptable trade-off.
    borderRadius: 4,
    marginRight: 8,
  },
  preparedByStack: {
    flexGrow: 1,
    flexShrink: 1,
  },
  preparedByTagline: {
    fontSize: 9,
    fontStyle: "italic",
    color: C.slate,
    marginTop: 1,
    marginBottom: 3,
  },
  preparedByLabel: {
    fontSize: 8,
    color: C.subtext,
    marginBottom: 2,
  },
  preparedByName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 1,
  },
  preparedByLine: {
    fontSize: 10,
    color: C.slate,
    marginBottom: 1,
  },
  preparedByMeta: {
    fontSize: 9,
    color: C.subtext,
  },
  // Subtle "Internal reference: ..." line shown below the address when
  // the agent gave the report a memorable label. Italicized + muted so
  // it never competes visually with the property address.
  coverInternalRef: {
    fontSize: 9,
    fontStyle: "italic",
    color: C.subtext,
    marginBottom: 4,
  },
  // "PREPARED FOR" panel — mirrors the "Prepared By" treatment but
  // emphasizes the client. Sits above the Prepared By panel when a
  // client name is supplied.
  preparedForLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.gold,
    marginBottom: 2,
  },
  preparedForName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 10,
  },
  // Sub-header within a section
  subHead: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginTop: 8,
    marginBottom: 4,
  },
  // -- Standard typography tokens --------------------------------------
  // These named styles replace what used to be 12+ inline { fontSize:
  // 9.5, marginBottom: 6 } objects scattered across sections. The
  // intent: one place to adjust paragraph rhythm; one shape to enforce
  // consistency across the Executive Summary, narrative sections, and
  // "no findings" empty states.
  //
  // Type scale (approximately 1.25 ratio, base 9.5):
  //   caption (8)   — disclaimers, badges, source attribution
  //   body    (9.5) — narrative paragraphs, finding descriptions
  //   subHead (10.5)— field group titles within sections
  //   section (13)  — section banner titles
  // Body paragraph rhythm tuned to feel closer to the on-screen
  // dashboard read — bigger leading + slightly more space between
  // paragraphs so the Executive Summary doesn't feel cramped. Agent
  // feedback was that the previous tighter rhythm looked dense
  // compared to the dashboard's leading-relaxed paragraphs.
  body: {
    fontSize: 10,
    marginBottom: 8,
    lineHeight: 1.55,
  },
  bodyTight: {
    fontSize: 10,
    marginBottom: 5,
    lineHeight: 1.5,
  },
  // Italicized empty-state message ("No critical findings identified.").
  // Used by every "no findings" branch so they read uniformly.
  emptyState: {
    fontSize: 9,
    fontStyle: "italic",
    color: C.subtext,
    marginBottom: 4,
  },
  // Numbered item inside a dual block (Strengths / Concerns lists).
  // Bumped from 9pt to 10pt with more leading + bottom margin so the
  // list reads cleanly instead of feeling stacked-tight.
  bulletNumbered: {
    fontSize: 10,
    marginBottom: 5,
    lineHeight: 1.45,
  },
  // Two-column dual block (Strengths/Concerns, etc.)
  // flexBasis: 0 was triggering layout coordinate crashes — use width instead.
  dualBlock: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 4,
  },
  // Letter width 612 - paddingHorizontal*2 (56*2=112) = 500 content area.
  // Two 240-wide columns + 20pt gap = 500. Exact widths avoid percentage
  // calc paths that crash React-PDF's layout engine.
  // Bumped vertical padding 10 → 14 so the cards have more breathing
  // room around the text — readability-driven, matches the dashboard's
  // ~20px padding feel.
  dualBlockLeft: {
    width: 240,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: C.strengthsBg,
  },
  dualBlockRight: {
    width: 240,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: C.concernsBg,
    marginLeft: 20,
  },
  // Header captions on the strengths/concerns cards. Bumped 9 → 9.5
  // and gave the bottom margin a bit more space so the heading reads
  // as its own block before the list begins.
  dualBlockHeaderGreen: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.positive,
    marginBottom: 8,
  },
  dualBlockHeaderRed: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.critical,
    marginBottom: 8,
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 3,
    fontSize: 9,
  },
  bulletDot: {
    width: 12,
    color: C.subtext,
  },
  bulletText: {
    flexGrow: 1,
    flexShrink: 1,
  },
  // Cost summary table
  costSectionHeader: {
    flexDirection: "row",
    backgroundColor: C.slate,
    marginTop: 10,
  },
  costSectionHeaderLabel: {
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  costSectionHeaderCost: {
    width: 140,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textAlign: "right",
  },
  costRow: {
    flexDirection: "row",
  },
  costRowAlt: {
    flexDirection: "row",
    backgroundColor: C.rowAlt,
  },
  costRowLabel: {
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 9,
    color: C.text,
  },
  costRowValue: {
    width: 140,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 9,
    color: C.text,
    textAlign: "right",
  },
  costSubtotalRow: {
    flexDirection: "row",
    backgroundColor: C.light,
  },
  costSubtotalLabel: {
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
  },
  costSubtotalValue: {
    width: 140,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textAlign: "right",
  },
  costGrandTotalRow: {
    flexDirection: "row",
    backgroundColor: C.navy,
    marginTop: 2,
  },
  costGrandTotalLabel: {
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  costGrandTotalValue: {
    width: 140,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textAlign: "right",
  },
  // Rating
  ratingBox: {
    marginTop: 8,
    padding: 14,
    backgroundColor: C.light,
  },
  ratingPillRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  ratingPillBox: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  ratingPillText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textTransform: "uppercase",
  },
  ratingSummary: {
    fontSize: 10,
    marginBottom: 6,
  },
  ratingContingency: {
    fontSize: 9,
    fontStyle: "italic",
    color: C.subtext,
  },
  // Page header (top of each body page).
  //
  // History note: I tried position:absolute + top/bottom to perfectly
  // anchor the header/footer to page edges. That combined with `fixed`
  // and content overflow produced a hard render crash from React-PDF:
  //   "unsupported number: -1.7793471615011557e+21"
  // — the layout engine emits an invalid coordinate during the
  // pagination pass when an absolute-positioned fixed element has to
  // be repeated on continuation pages whose content has flexed
  // unexpectedly. Reverted to flow positioning + `fixed`. Trade-off:
  // on auto-paginated continuation pages the footer may end up
  // wherever the previous page's flow ended (which can overlap
  // content). The cleaner fix is to split long sections into their
  // own forced-page-break BodyPages so no page ever overflows; that
  // restructuring is on the roadmap. In the meantime, "rendered with
  // a quirk" beats "doesn't render".
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    fontSize: 7.5,
    color: C.subtext,
  },
  pageHeaderSeparator: {
    height: 1,
    backgroundColor: C.accent,
    marginBottom: 12,
  },
  pageFooterWrap: {
    marginTop: 18,
  },
  pageFooterSeparator: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 6,
  },
  pageFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: C.subtext,
  },
  pageFooterExtra: {
    fontSize: 7.5,
    color: C.subtext,
    marginBottom: 1,
  },
});

// ============================================================================
// Public component
// ============================================================================

export type AgentBranding = {
  fullName?: string | null;
  brokerage?: string | null;
  dreLicense?: string | null;
  brokerageDre?: string | null;
  phone?: string | null;
  email?: string | null;
  // Branding additions from /dashboard/settings — all nullable; the
  // cover and footer render cleanly when any/all are absent.
  brokerageLogoUrl?: string | null;
  headshotUrl?: string | null;
  // Six-char hex (e.g. "#0F766E") that replaces the Veroax gold on
  // the cover accent bar, eyebrow text, and "PREPARED FOR" label.
  // Null = use the gold default.
  brandAccentHex?: string | null;
  // Short subtitle rendered under the agent name on the cover.
  tagline?: string | null;
  // Agent website URL — rendered as a separate footer line.
  websiteUrl?: string | null;
  // Multi-line office address — rendered under the DRE row in the
  // footer (whitespace-pre-line equivalent: we split on \n).
  officeAddress?: string | null;
};

export type OriginalFile = {
  name: string;
  pages: number;
  size_kb: number;
  // ISO timestamp when this file was uploaded. Drives the per-row
  // "Uploaded" column in the Document Inventory section. Optional so
  // legacy reports rendered without it still work — they render with
  // a "—" placeholder.
  uploaded_at?: string | null;
};

export function ReportPDF({
  report,
  property,
  agent,
  reportId,
  generatedAt,
  originalFiles,
  reportName,
  clientName,
}: {
  report: ReportData;
  property: string;
  agent: AgentBranding;
  reportId: string;
  generatedAt: Date;
  // Canonical list of files the agent uploaded, captured in /finalize
  // BEFORE any internal page-splitting. When present, the Document
  // Inventory section uses this list — the user sees exactly what they
  // uploaded, never the _part_N chunks Claude analyzed.
  originalFiles?: OriginalFile[] | null;
  // Agent's internal label for the report ("Smith family · 945 Catkin").
  // Shown as a subtle "Internal reference: ..." line under the address.
  // Never used as the address itself — the address always comes from
  // the disclosure documents.
  reportName?: string | null;
  // Buyer client's name, surfaced in the cover's "PREPARED FOR" panel.
  clientName?: string | null;
}) {
  const shortId = reportId.slice(0, 8);
  const analysisDate = generatedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const agentFooterLine = formatAgentFooter(agent);

  // Body page grouping. The heavy-hitter sections (Critical/High,
  // Moderate, Cosmetic, Cost Summary) each get their OWN BodyPage so
  // they can't overflow into a continuation page where the fixed
  // footer would overlap content. Short sections group together.
  //
  // Page count varies with how many of the conditionally-rendered
  // pages have content. The fixed page-number footer renders via
  // `<Text render={({pageNumber, totalPages}) => ...}>` so the
  // labeling adjusts automatically — no totalBodyPages constant
  // needed.
  return (
    <Document
      title={`Disclosure Analysis — ${property}`}
      author="Veroax"
      subject="AI-assisted disclosure analysis"
    >
      {/* ============ COVER PAGE ============ */}
      <Page size="LETTER" style={styles.coverPage}>
        <CoverPage
          property={property}
          report={report}
          agent={agent}
          analysisDate={analysisDate}
          shortId={shortId}
          reportName={reportName}
          clientName={clientName}
        />
      </Page>

      {/* ============ BODY PAGES ============ */}
      {/* Page 1: Property + Executive Summary + Document Inventory.
          All three are bounded by data shape (snapshot is one inline
          row, exec summary is 2-3 paragraphs, inventory is the
          uploaded-files list capped at the user's actual upload
          count). Comfortably fits one Letter page in practice. */}
      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        websiteUrl={agent.websiteUrl}
        officeAddress={agent.officeAddress}
      >
        <SectionPropertySnapshot report={report} analysisDate={analysisDate} />
        <SectionExecutiveSummary report={report} />
        <SectionDocumentInventory report={report} originalFiles={originalFiles} />
      </BodyPage>

      {/* Page 2: Critical/High findings alone. Heavy section. With
          the unit-feature filter pruning inapplicable findings the
          page is usually 3-8 entries; even a heavy run rarely needs
          to overflow. */}
      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        websiteUrl={agent.websiteUrl}
        officeAddress={agent.officeAddress}
      >
        <SectionCritical report={report} />
      </BodyPage>

      {/* Page 3: Moderate + Cosmetic. Both are usually short post-
          filter; grouping them keeps the doc from ballooning to
          mostly-empty pages. */}
      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        websiteUrl={agent.websiteUrl}
        officeAddress={agent.officeAddress}
      >
        <SectionModerate report={report} />
        <SectionCosmetic report={report} />
      </BodyPage>

      {/* Page 4: Cost Summary alone. Two subsections (buyer-pays
          and HOA-paid-informational) plus subtotals can run long if
          there are many line items. Own page so subtotal rows
          don't get orphaned. */}
      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        websiteUrl={agent.websiteUrl}
        officeAddress={agent.officeAddress}
      >
        <SectionCostSummary report={report} />
      </BodyPage>

      {/* Page 5: HOA + Permits + Insurance. Short narrative
          sections; permits findings render as FindingBlocks but
          usually 0-3 of them. */}
      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        websiteUrl={agent.websiteUrl}
        officeAddress={agent.officeAddress}
      >
        <SectionHoa report={report} />
        <SectionPermits report={report} />
        <SectionInsuranceLender report={report} />
      </BodyPage>

      {/* Page 6: Negotiation + Environmental + Questions + Rating.
          Closing pages — usually short. */}
      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        websiteUrl={agent.websiteUrl}
        officeAddress={agent.officeAddress}
      >
        <SectionNegotiation report={report} />
        <SectionEnvironmental report={report} />
        <SectionOutstanding report={report} />
        <SectionOverallRating report={report} />
      </BodyPage>
    </Document>
  );
}

function BodyPage({
  children,
  property,
  agentLine,
  websiteUrl,
  officeAddress,
}: {
  children: React.ReactNode;
  property: string;
  agentLine: string;
  // Optional extras rendered above the main agentLine row when the
  // agent has filled them in.
  websiteUrl?: string | null;
  officeAddress?: string | null;
}) {
  // Both the header and footer are wrapped in `<View fixed>` so they
  // repeat on every page including auto-paginated continuation pages.
  // Agent feedback was that long sections (Critical Findings, the Cost
  // Summary) were producing continuation pages with no header/footer
  // chrome — buyers would see a "page in the middle of nowhere."
  //
  // We intentionally do NOT use `position: absolute` to bottom-anchor
  // the footer. Past React-PDF versions in this codebase crashed with
  // layout-coordinate errors when absolute positioning combined with
  // flex columns. The trade-off: when a page's content is shorter than
  // the available space, the footer renders right after the content
  // rather than at the page bottom. That's a minor visual nit; the
  // important property — header/footer on EVERY page — holds.
  //
  // The renderFooter callback inside `<Text fixed render>` reads the
  // pageNumber so each continuation page renders the right label, not
  // a stale "Page 2 of 5" that was computed at the parent level.
  return (
    <Page size="LETTER" style={styles.page}>
      <View fixed style={styles.pageHeader}>
        <Text>{property}</Text>
        <Text>AI-Assisted Disclosure Analysis | Confidential</Text>
      </View>
      <View fixed style={styles.pageHeaderSeparator} />

      {children}

      <View fixed style={styles.pageFooterWrap}>
        <View style={styles.pageFooterSeparator} />
        {/* Extras stack above the agentLine + page-number row. Office
            address may be multi-line; split on \n so each line gets
            its own <Text> (React-PDF doesn't honor whitespace:
            pre-line). */}
        {officeAddress
          ? officeAddress.split(/\r?\n/).map((line, i) => (
              <Text key={`addr-${i}`} style={styles.pageFooterExtra}>
                {line}
              </Text>
            ))
          : null}
        {websiteUrl ? (
          <Text style={styles.pageFooterExtra}>{websiteUrl}</Text>
        ) : null}
        <View style={styles.pageFooter}>
          <Text>{agentLine || "Veroax disclosure analysis"}</Text>
          {/* render() receives the current pageNumber for the rendered
              page, including continuation pages from auto-pagination.
              Using the parent-computed `pageLabel` would freeze the
              wrong number when a section overflows onto a new page. */}
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </View>
    </Page>
  );
}

// ============================================================================
// Cover page
// ============================================================================

function CoverPage({
  property,
  report,
  agent,
  analysisDate,
  shortId,
  reportName,
  clientName,
}: {
  property: string;
  report: ReportData;
  agent: AgentBranding;
  analysisDate: string;
  shortId: string;
  reportName?: string | null;
  clientName?: string | null;
}) {
  const p = report.property_snapshot;
  const addressParts = property.split(",");
  const line1 = (addressParts[0] ?? property).trim();
  const line2 = addressParts.slice(1).join(",").trim();

  // Resolve the agent's chosen accent color, falling back to the
  // Veroax gold default. Used in three places below as an inline
  // override on the static StyleSheet entries.
  const accentColor = agent.brandAccentHex || C.gold;

  // Build the coverKv rows in a deliberate order:
  //   1. Identity        (property type with beds/baths/sqft, year built)
  //   2. Listing details (APN, MLS#, list price, days on market, Zestimate)
  //   3. HOA             (dues + last increase)
  //   4. Physical        (parking)
  //   5. Geographic      (market region)
  //   6. Cost reference  (which market drove the cost estimates)
  //   7. Meta            (analysis date, report ID)
  // Rows are conditionally added when data is present — a sparsely
  // populated snapshot just renders fewer rows. The existing KvTable
  // component handles the alternating-row stripes automatically.
  const coverKv: Array<[string, string]> = [];

  // --- 1. Identity ---------------------------------------------------
  if (p?.property_type) {
    const bedBath: string[] = [];
    if (p?.bedrooms != null) bedBath.push(`${p.bedrooms} bd`);
    if (p?.bathrooms != null) bedBath.push(`${p.bathrooms} ba`);
    if (p?.square_feet != null) {
      bedBath.push(`${p.square_feet.toLocaleString()} sqft`);
    }
    const typeValue =
      bedBath.length > 0
        ? `${p.property_type} (${bedBath.join(" / ")})`
        : p.property_type;
    coverKv.push(["Property Type", typeValue]);
  }
  if (p?.year_built) coverKv.push(["Year Built", String(p.year_built)]);

  // --- 2. Listing details -------------------------------------------
  if (p?.apn) coverKv.push(["APN", withSoftBreaks(p.apn)]);
  // MLS# only shown for live/pending listings — historical MLS# on a
  // sold/withdrawn record is noise for the buyer.
  if (
    p?.mls_number &&
    (p?.list_status === "active" || p?.list_status === "pending")
  ) {
    coverKv.push(["MLS#", withSoftBreaks(p.mls_number)]);
  }
  if (p?.list_price) {
    const showListDate = p?.list_status === "active" && p?.list_date;
    const listPriceValue = showListDate
      ? `${formatUSD(p.list_price)} — listed ${formatIsoDate(p.list_date!)}`
      : formatUSD(p.list_price);
    coverKv.push(["List Price", listPriceValue]);
  }
  if (p?.days_on_market != null) {
    const domValue = p?.list_date
      ? `${p.days_on_market} (listed ${formatIsoDate(p.list_date)})`
      : String(p.days_on_market);
    coverKv.push(["Days on Market", domValue]);
  }
  if (p?.zestimate) coverKv.push(["Zestimate", formatUSD(p.zestimate)]);

  // --- 3. HOA --------------------------------------------------------
  if (p?.hoa_dues_monthly != null) {
    let duesValue = `${formatUSD(p.hoa_dues_monthly)}/mo`;
    if (p?.hoa_last_increase_date && p?.hoa_last_increase_amount != null) {
      duesValue += ` (last raised ${formatIsoDate(p.hoa_last_increase_date)} +${formatUSD(p.hoa_last_increase_amount)})`;
    } else if (p?.hoa_last_increase_date) {
      duesValue += ` (last raised ${formatIsoDate(p.hoa_last_increase_date)})`;
    }
    coverKv.push(["HOA Dues", duesValue]);
  }

  // --- 4. Physical ---------------------------------------------------
  if (p?.parking) coverKv.push(["Parking", withSoftBreaks(p.parking)]);

  // --- 5. Geographic -------------------------------------------------
  if (p?.market_region) coverKv.push(["Market Region", p.market_region]);

  // --- 6. Cost reference --------------------------------------------
  // Always shown so the agent / client know which market drove the
  // repair-cost numbers. mergeProperty falls back to the Bay Area
  // default when the analyzer didn't supply one.
  coverKv.push([
    "Cost Reference",
    p?.cost_reference_market || "California Bay Area / Silicon Valley",
  ]);

  // --- 7. Meta -------------------------------------------------------
  coverKv.push(["Analysis Date", analysisDate]);
  coverKv.push(["Report ID", shortId]);

  return (
    <View style={styles.coverWrap}>
      <View style={[styles.coverAccentBar, { backgroundColor: accentColor }]} />
      <View style={styles.coverInner}>
        {/* Logo row: brokerage logo top-right of the cover. Renders
            only when set; layout collapses cleanly when absent
            because the row contains just the eyebrow + an empty
            spacer. */}
        <View style={styles.coverTopRow}>
          <Text style={[styles.coverEyebrow, { color: accentColor }]}>
            AI-ASSISTED DISCLOSURE ANALYSIS
          </Text>
          {agent.brokerageLogoUrl ? (
            <Image src={agent.brokerageLogoUrl} style={styles.coverLogo} />
          ) : null}
        </View>
        {/* withSoftBreaks injects zero-width spaces into long unbroken
            tokens so very long street names ("12345 SomeReallyLongHyphenated-
            Street") wrap inside the cover instead of forcing the layout
            to overflow off the right edge. */}
        <Text style={styles.coverTitle}>{withSoftBreaks(line1)}</Text>
        {line2 ? (
          <Text style={styles.coverSubtitle}>{withSoftBreaks(line2)}</Text>
        ) : null}
        {reportName ? (
          <Text style={styles.coverInternalRef}>
            Internal reference: {reportName}
          </Text>
        ) : null}

        <View style={styles.coverDivider} />

        <KvTable rows={coverKv} />

        <View style={styles.coverDivider} />

        <Text style={styles.disclaimerHead}>
          IMPORTANT, AI-GENERATED REPORT DISCLAIMER
        </Text>
        <Text style={styles.disclaimer}>
          This report was generated using artificial intelligence based on the
          disclosure documents provided. It is intended as a preliminary
          analytical aid to help buyers and their agents organize and prioritize
          key issues in a disclosure package.
        </Text>
        <Text style={styles.disclaimer}>
          This report is NOT a substitute for: (1) a thorough independent review
          of the actual disclosure documents by the buyer and their agent; (2)
          professional inspections by licensed contractors, engineers, and
          inspectors; (3) legal advice from a qualified California real estate
          attorney; or (4) lender review of the property and HOA.
        </Text>
        <Text style={styles.disclaimer}>
          AI systems can make errors, miss context, misread ambiguous text, and
          cannot physically inspect a property. All findings should be
          independently verified against the source documents before making any
          purchase decision. Cost estimates are ranges only; obtain licensed
          contractor bids before relying on them.
        </Text>
        <Text style={styles.disclaimer}>
          This report is confidential and prepared solely for the named buyer
          client. It does not constitute a warranty, guarantee, or professional
          opinion regarding the condition, value, or suitability of the
          property.
        </Text>

        <View style={styles.coverDivider} />

        {clientName ? (
          <View>
            <Text style={[styles.preparedForLabel, { color: accentColor }]}>
              PREPARED FOR
            </Text>
            <Text style={styles.preparedForName}>{clientName}</Text>
          </View>
        ) : null}

        <Text style={styles.preparedByLabel}>Prepared By</Text>
        {/* When a headshot is set, lay it out to the left of the
            name+meta stack. When absent, the stack flows naturally
            full-width as before. */}
        <View style={styles.preparedByRow}>
          {agent.headshotUrl ? (
            <Image src={agent.headshotUrl} style={styles.preparedByHeadshot} />
          ) : null}
          <View style={styles.preparedByStack}>
            {agent.fullName ? (
              <Text style={styles.preparedByName}>{agent.fullName}</Text>
            ) : null}
            {agent.tagline ? (
              <Text style={styles.preparedByTagline}>{agent.tagline}</Text>
            ) : null}
            {agent.brokerage ? (
              <Text style={styles.preparedByLine}>{agent.brokerage}</Text>
            ) : null}
            {agent.phone ? (
              <Text style={styles.preparedByMeta}>{agent.phone}</Text>
            ) : null}
            {agent.email ? (
              <Text style={styles.preparedByMeta}>{agent.email}</Text>
            ) : null}
            {(agent.dreLicense || agent.brokerageDre) && (
              <Text style={styles.preparedByMeta}>
                {agent.dreLicense ? `DRE #${agent.dreLicense}` : ""}
                {agent.dreLicense && agent.brokerageDre ? " / " : ""}
                {agent.brokerageDre ? `Brokerage DRE #${agent.brokerageDre}` : ""}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Reusable pieces
// ============================================================================

function SectionBanner({ number, title }: { number: number; title: string }) {
  // Typographic section heading — replaces the previous big navy
  // banner. Single line "N. Title" in dark navy. Wrapped in a
  // wrap={false} View with minPresenceAhead so a heading doesn't
  // orphan at the bottom of a page without its first paragraph.
  return (
    <View wrap={false} minPresenceAhead={120}>
      <Text style={styles.sectionHeading}>
        {number}. {title}
      </Text>
    </View>
  );
}

function KvTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <View>
      {rows.map(([label, value], i) => (
        <View key={label} style={i % 2 === 1 ? styles.kvRowAlt : styles.kvRow}>
          <Text style={styles.kvLabel}>{label}</Text>
          {/* Values may contain URLs, file names, or long unbroken
              strings (e.g. "polybutylene/PEX/cross-linked..."). Inject
              soft breaks so they wrap inside the cell instead of
              extending the cell past the page edge. */}
          <Text style={styles.kvValue}>{withSoftBreaks(value)}</Text>
        </View>
      ))}
    </View>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const bg = {
    critical: C.critical,
    high: C.high,
    moderate: C.moderate,
    cosmetic: C.cosmetic,
  }[severity];
  return (
    <View style={[styles.badgeBox, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{severity}</Text>
    </View>
  );
}

function FindingBlock({ finding, index }: { finding: Finding; index: number }) {
  // Cost handling matches the previous version: hide the cost row
  // when the buyer doesn't pay (HOA-paid or $0). cost_responsibility
  // is the new explicit flag; we keep the heuristic fallback for
  // legacy reports without it.
  const hasZeroCost =
    (finding.cost_estimate?.high ?? 0) === 0 &&
    (finding.cost_estimate?.low ?? 0) === 0;
  const hoaPaid =
    finding.cost_responsibility === "hoa" ||
    (finding.cost_responsibility == null && looksHoaPaid(finding));
  const showCostRow = !hasZeroCost && !hoaPaid;

  // Source quote, what_it_is, why_it_matters, next_step, and
  // immediate_out_of_pocket are the Cowork-style enrichments. When
  // they're populated, we render the richer card layout. When the
  // analyzer didn't fill them in (legacy reports), we fall back to
  // the existing description / risk / recommended_action fields so
  // nothing renders empty.
  const sourceQuote =
    typeof finding.source_quote === "string" && finding.source_quote.trim()
      ? finding.source_quote.trim()
      : null;
  const whatItIs =
    typeof finding.what_it_is === "string" && finding.what_it_is.trim()
      ? finding.what_it_is.trim()
      : finding.description?.trim() || null;
  const whyItMatters =
    typeof finding.why_it_matters === "string" && finding.why_it_matters.trim()
      ? finding.why_it_matters.trim()
      : finding.risk_if_ignored?.trim() || null;
  const nextStep =
    typeof finding.next_step === "string" && finding.next_step.trim()
      ? finding.next_step.trim()
      : finding.recommended_action?.trim() || null;
  const immediateOop =
    finding.immediate_out_of_pocket &&
    typeof finding.immediate_out_of_pocket === "object" &&
    ((finding.immediate_out_of_pocket as CostRange).low ||
      (finding.immediate_out_of_pocket as CostRange).high)
      ? (finding.immediate_out_of_pocket as CostRange)
      : null;

  return (
    <View style={styles.findingCard}>
      <View style={styles.findingHeader}>
        <Text style={styles.findingTitle}>
          {index}. {withSoftBreaks(finding.title)}
        </Text>
        <SeverityBadge severity={finding.severity} />
      </View>

      {/* Verbatim source quote — Cowork-style auditability anchor. */}
      {sourceQuote ? (
        <>
          <Text style={styles.findingQuoteLabel}>From the source document:</Text>
          <Text style={styles.findingQuote}>
            &ldquo;{withSoftBreaks(sourceQuote)}&rdquo;
          </Text>
        </>
      ) : null}
      <Text style={styles.findingSourceCitation}>
        Source: {withSoftBreaks(finding.source)}
      </Text>

      {/* Plain-language narrative sections, each with a bold inline
          label. Falls back to the legacy fields (description /
          risk_if_ignored / recommended_action) when the new fields
          aren't populated. */}
      {whatItIs ? (
        <Text style={styles.findingNarrativePara}>
          <Text style={styles.findingNarrativeLabel}>What it is: </Text>
          {withSoftBreaks(whatItIs)}
        </Text>
      ) : null}
      {whyItMatters ? (
        <Text style={styles.findingNarrativePara}>
          <Text style={styles.findingNarrativeLabel}>Why it matters: </Text>
          {withSoftBreaks(whyItMatters)}
        </Text>
      ) : null}
      {nextStep ? (
        <Text style={styles.findingNarrativePara}>
          <Text style={styles.findingNarrativeLabel}>Next step: </Text>
          {withSoftBreaks(nextStep)}
        </Text>
      ) : null}

      {/* Cost line: remediation cost (when buyer pays) + immediate
          out-of-pocket. HOA-paid items show a cost-responsibility
          note instead of dollars. */}
      {showCostRow ? (
        <Text style={styles.findingCostLine}>
          <Text style={styles.findingNarrativeLabel}>Cost range: </Text>
          {formatCostRange(finding.cost_estimate)}
          {immediateOop ? (
            <>
              {"    "}
              <Text style={styles.findingNarrativeLabel}>
                Immediate out-of-pocket:{" "}
              </Text>
              {formatCostRange(immediateOop)}
            </>
          ) : null}
        </Text>
      ) : null}
      {hoaPaid ? (
        <Text style={styles.findingCostLine}>
          <Text style={styles.findingNarrativeLabel}>
            Cost responsibility:{" "}
          </Text>
          HOA / association (paid from reserves or assessments — the
          buyer does not write this check directly).
        </Text>
      ) : null}

      <Text style={styles.findingConfidence}>
        Confidence:{" "}
        {finding.confidence.charAt(0).toUpperCase() +
          finding.confidence.slice(1)}
      </Text>
    </View>
  );
}

// Stacked label/value pair used inside FindingBlock. Label sits on its
// own line in small bold caps; value occupies the full row width below.
// No flex columns — full-width Text wraps naturally inside the card.
function FindingDetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.findingDetailRow}>
      <Text style={styles.findingDetailLabel}>{label}</Text>
      <Text style={styles.findingDetailValue}>{withSoftBreaks(value)}</Text>
    </View>
  );
}

// Heuristic for legacy reports without cost_responsibility: examines
// the source citation and finding title/description for HOA-pay
// signals. New analyses populate cost_responsibility explicitly and
// skip this path.
function looksHoaPaid(finding: Finding): boolean {
  const blob = [
    finding.source ?? "",
    finding.title ?? "",
    finding.description ?? "",
    finding.recommended_action ?? "",
  ]
    .join(" ")
    .toLowerCase();
  // Signals that the work is the HOA's responsibility / paid from
  // reserves / a common element. Tuned for condo / townhome / PUD
  // sources: reserve studies, association budgets, board minutes.
  return (
    /\b(reserve study|reserve fund|hoa reserve|association reserve|board minutes|hoa budget|association budget|special assessment|common area|common element|building exterior|exterior of (the )?building|building envelope|common roof|common[\s-]?area roof|elevator|lobby|common[\s-]?area plumbing|common boiler|common parking)\b/.test(
      blob,
    )
  );
}

function severityHexColor(severity: Severity): string {
  return {
    critical: C.critical,
    high: C.high,
    moderate: C.moderate,
    cosmetic: C.cosmetic,
  }[severity];
}

// ============================================================================
// Sections
// ============================================================================

function SectionPropertySnapshot({
  report,
  analysisDate,
}: {
  report: ReportData;
  analysisDate: string;
}) {
  const p = report.property_snapshot;

  // Property snapshot used to be a tall KvTable that duplicated almost
  // every field already on the cover (address, year built, beds/baths,
  // sqft, list price, market region — all shown on the cover KV). The
  // body version was eating 1/3 of page 2 for information the reader
  // had already seen. Now we render a compact inline summary strip: a
  // single line of dot-separated facts plus the analysis date. The
  // cover stays as the authoritative property identity panel.
  const parts: string[] = [];
  if (p?.property_type) parts.push(p.property_type);
  const bedBath: string[] = [];
  if (p?.bedrooms != null) bedBath.push(`${p.bedrooms} bd`);
  if (p?.bathrooms != null) bedBath.push(`${p.bathrooms} ba`);
  if (p?.square_feet != null) {
    bedBath.push(`${p.square_feet.toLocaleString()} sqft`);
  }
  if (bedBath.length > 0) parts.push(bedBath.join(" / "));
  if (p?.year_built) parts.push(`Built ${p.year_built}`);
  if (p?.days_on_market != null) parts.push(`${p.days_on_market} DOM`);
  if (p?.market_region) parts.push(p.market_region);

  return (
    <View>
      <SectionBanner number={1} title="Property Snapshot" />
      {parts.length > 0 ? (
        <Text style={styles.propertySnapshotInline}>
          {parts.join(" · ")}
        </Text>
      ) : null}
      <Text style={styles.propertySnapshotMeta}>
        Analysis date: <Text style={{ fontFamily: "Helvetica-Bold" }}>{analysisDate}</Text>
        {p?.cost_reference_market ? (
          <>
            {"  ·  "}Cost reference market:{" "}
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {p.cost_reference_market}
            </Text>
          </>
        ) : null}
      </Text>
    </View>
  );
}

function SectionExecutiveSummary({ report }: { report: ReportData }) {
  const critCount = report.critical_findings?.length ?? 0;
  const modCount = report.moderate_findings?.length ?? 0;
  const cosmCount = report.cosmetic_findings?.length ?? 0;

  const narrative = composeExecutiveNarrative(report);
  const { strengths, concerns } = composeStrengthsAndConcerns(report);

  return (
    <View>
      <SectionBanner number={2} title="Executive Summary" />
      {narrative.map((p, i) => (
        <Text key={i} style={styles.body}>
          {p}
        </Text>
      ))}

      <Text style={styles.body}>
        Finding totals across the disclosure package:{" "}
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{critCount}</Text>{" "}
        critical / high,{" "}
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{modCount}</Text>{" "}
        moderate,{" "}
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{cosmCount}</Text>{" "}
        cosmetic. See Section 14 for the full overall rating and contingency
        guidance.
      </Text>

      <View style={styles.dualBlock}>
        <View style={styles.dualBlockLeft}>
          <Text style={styles.dualBlockHeaderGreen}>THREE STRENGTHS</Text>
          {strengths.slice(0, 3).map((s, i) => (
            <Text key={i} style={styles.bulletNumbered}>
              {i + 1}. {s}
            </Text>
          ))}
        </View>
        <View style={styles.dualBlockRight}>
          <Text style={styles.dualBlockHeaderRed}>THREE KEY CONCERNS</Text>
          {concerns.slice(0, 3).map((c, i) => (
            <Text key={i} style={styles.bulletNumbered}>
              {i + 1}. {c}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

// composeExecutiveNarrative moved to lib/reports/narrative.ts so the
// PDF (Executive Summary on the cover) and the dashboard report page
// (Talking Points card) draw from the same single source of truth.
// Imported at the top of this file.

// Build the Strengths and Concerns lists for the dual-column block.
// Concerns surface the top critical/moderate items; Strengths describe
// what's notably absent or healthy in the package.
function composeStrengthsAndConcerns(report: ReportData): {
  strengths: string[];
  concerns: string[];
} {
  const critCount = report.critical_findings?.length ?? 0;
  const modCount = report.moderate_findings?.length ?? 0;
  const cosmCount = report.cosmetic_findings?.length ?? 0;

  // Concerns: prefer critical findings, fall back to moderate.
  const concerns: string[] = [];
  for (const f of report.critical_findings ?? []) {
    if (concerns.length >= 3) break;
    concerns.push(f.title);
  }
  if (concerns.length < 3) {
    for (const f of report.moderate_findings ?? []) {
      if (concerns.length >= 3) break;
      concerns.push(f.title);
    }
  }
  while (concerns.length < 3) {
    concerns.push("(No additional concerns identified)");
  }

  // Strengths: notable absences and good signals from the data.
  const strengths: string[] = [];
  if (critCount === 0) {
    strengths.push("No critical or high-severity findings identified");
  }
  if (report.hoa?.applicable && (report.hoa.concerns?.length ?? 0) === 0) {
    strengths.push("HOA review surfaced no material financial concerns");
  } else if (!report.hoa?.applicable) {
    strengths.push("No HOA review burden — property not subject to an HOA");
  }
  if ((report.environmental?.hazards?.length ?? 0) === 0) {
    strengths.push("No significant natural hazard zones disclosed");
  }
  if (
    (report.permit_compliance?.findings?.length ?? 0) === 0 &&
    (report.permit_compliance?.summary?.length ?? 0) === 0
  ) {
    strengths.push("No permit or code-compliance issues surfaced");
  }
  if (
    report.document_inventory?.documents_missing?.length === 0 &&
    (report.document_inventory?.documents_provided?.length ?? 0) > 0
  ) {
    strengths.push("Disclosure package is complete with no missing standard documents");
  }
  if (cosmCount > 0 && critCount === 0 && modCount === 0) {
    strengths.push("All identified findings are cosmetic and addressable post-close");
  }
  while (strengths.length < 3) {
    strengths.push("Standard contingency timelines should suffice for due diligence");
  }
  return { strengths: strengths.slice(0, 3), concerns: concerns.slice(0, 3) };
}

function SectionDocumentInventory({
  report,
  originalFiles,
}: {
  report: ReportData;
  originalFiles?: OriginalFile[] | null;
}) {
  const inv = report.document_inventory;

  // The user uploaded these files. This is the canonical inventory —
  // it's captured in /finalize before any internal page-splitting, so
  // it never shows the _part_N chunks Claude analyzed under the hood.
  const haveOriginals = (originalFiles?.length ?? 0) > 0;

  return (
    <View>
      <SectionBanner number={3} title="Document Inventory" />
      <Text style={styles.subHead}>Provided</Text>
      {haveOriginals ? (
        originalFiles!.map((f, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>·</Text>
            <Text style={styles.bulletText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{f.name}</Text>
              {f.pages ? ` — ${f.pages} pp` : ""}
              {f.size_kb ? ` (${formatSize(f.size_kb)})` : ""}
              {f.uploaded_at
                ? `  ·  Uploaded ${formatIsoDate(f.uploaded_at)}`
                : ""}
            </Text>
          </View>
        ))
      ) : inv?.documents_provided?.length ? (
        inv.documents_provided.map((d, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>·</Text>
            <Text style={styles.bulletText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{d.type}</Text>:{" "}
              {d.name}
              {d.pages ? ` (${d.pages} pp)` : ""}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyState}>
          No documents identified.
        </Text>
      )}
      <Text style={styles.subHead}>Standard CA Disclosures NOT in this package</Text>
      {inv?.documents_missing?.length ? (
        inv.documents_missing.map((d, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>·</Text>
            <Text style={styles.bulletText}>{d}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyState}>
          Package appears complete.
        </Text>
      )}
    </View>
  );
}

// Pretty-print a kilobyte count as KB or MB. Inventory rows are tighter
// when the size column doesn't grow past 6-7 characters.
function formatSize(sizeKb: number): string {
  if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(1)} MB`;
  return `${sizeKb} KB`;
}

function SectionCritical({ report }: { report: ReportData }) {
  return (
    <View>
      <SectionBanner number={4} title="Critical & High-Priority Findings" />
      {report.critical_findings?.length ? (
        report.critical_findings.map((f, i) => (
          <FindingBlock key={i} finding={f} index={i + 1} />
        ))
      ) : (
        <Text style={styles.emptyState}>
          No critical or high-priority findings identified.
        </Text>
      )}
    </View>
  );
}

function SectionModerate({ report }: { report: ReportData }) {
  return (
    <View>
      <SectionBanner number={5} title="Moderate Findings" />
      {report.moderate_findings?.length ? (
        report.moderate_findings.map((f, i) => (
          <FindingBlock key={i} finding={f} index={i + 1} />
        ))
      ) : (
        <Text style={styles.emptyState}>
          No moderate findings identified.
        </Text>
      )}
    </View>
  );
}

function SectionCosmetic({ report }: { report: ReportData }) {
  return (
    <View>
      <SectionBanner number={6} title="Cosmetic Findings" />
      {report.cosmetic_findings?.length ? (
        report.cosmetic_findings.map((f, i) => (
          <FindingBlock key={i} finding={f} index={i + 1} />
        ))
      ) : (
        <Text style={styles.emptyState}>
          No cosmetic findings identified.
        </Text>
      )}
    </View>
  );
}

function SectionCostSummary({ report }: { report: ReportData }) {
  const cs = report.cost_summary;
  // Split categories into buyer-pays vs HOA-paid based on the category
  // name. The synthesizer now puts HOA-paid line items under a labeled
  // "HOA-paid capital projects (informational)" category; everything
  // else is buyer-pays. Legacy reports without that category simply
  // render as one section.
  const isHoaCategory = (label: string) =>
    /hoa[-\s]?paid|hoa\s+capital|association[-\s]?paid|informational/i.test(
      label,
    );
  const allCats = cs?.line_items ?? [];
  const buyerCats = allCats.filter(
    (cat) => !isHoaCategory(cat.category) && cat.items?.length,
  );
  const hoaCats = allCats.filter(
    (cat) => isHoaCategory(cat.category) && cat.items?.length,
  );

  const buyerSubtotal = sumLineCosts(buyerCats.flatMap((c) => c.items));
  const hoaSubtotal = sumLineCosts(hoaCats.flatMap((c) => c.items));

  return (
    <View>
      <SectionBanner number={7} title="Repair Cost Summary" />
      <Text style={styles.body}>
        {`These numbers reflect what the BUYER of this specific unit is exposed to. HOA-paid capital projects are itemized separately below for context — they don't roll into the buyer total because the association pays them from reserves and assessments, not the buyer directly.`}
      </Text>

      {/* Buyer-pays categories */}
      {buyerCats.map((cat, ci) => (
        <View key={`buyer-${ci}`}>
          <View style={styles.costSectionHeader}>
            <Text style={styles.costSectionHeaderLabel}>{cat.category}</Text>
            <Text style={styles.costSectionHeaderCost}>Est. Cost Range</Text>
          </View>
          {cat.items.map((item, ii) => (
            <View
              key={ii}
              style={ii % 2 === 1 ? styles.costRowAlt : styles.costRow}
            >
              <Text style={styles.costRowLabel}>{item.label}</Text>
              <Text style={styles.costRowValue}>
                {formatCostRange(item.cost)}
              </Text>
            </View>
          ))}
          <View style={styles.costSubtotalRow}>
            <Text style={styles.costSubtotalLabel}>Subtotal</Text>
            <Text style={styles.costSubtotalValue}>
              {formatCostRange(sumLineCosts(cat.items))}
            </Text>
          </View>
        </View>
      ))}

      {/* Buyer grand total — headline number. */}
      <View style={styles.costGrandTotalRow}>
        <Text style={styles.costGrandTotalLabel}>
          TOTAL BUYER OUT-OF-POCKET EXPOSURE
        </Text>
        <Text style={styles.costGrandTotalValue}>
          {buyerCats.length === 0 && hoaCats.length > 0
            ? "—"
            : formatCostRange(buyerSubtotal)}
        </Text>
      </View>

      {/* HOA-paid section, rendered AFTER the buyer total so the layout
          reads as "what you owe" first and "what to be aware of"
          second. Visually de-emphasized via the subHead caption. */}
      {hoaCats.length > 0 ? (
        <View>
          <Text style={styles.subHead}>
            HOA-paid capital projects (informational only)
          </Text>
          <Text style={styles.body}>
            {`The figures below are the FULL project cost paid by the HOA from reserves or assessments. The buyer's exposure to these items is indirect — through dues increases or pro-rata share of a special assessment — and is covered in the HOA Financial & Governance Review section.`}
          </Text>
          {hoaCats.map((cat, ci) => (
            <View key={`hoa-${ci}`}>
              <View style={styles.costSectionHeader}>
                <Text style={styles.costSectionHeaderLabel}>{cat.category}</Text>
                <Text style={styles.costSectionHeaderCost}>Project Cost</Text>
              </View>
              {cat.items.map((item, ii) => (
                <View
                  key={ii}
                  style={ii % 2 === 1 ? styles.costRowAlt : styles.costRow}
                >
                  <Text style={styles.costRowLabel}>{item.label}</Text>
                  <Text style={styles.costRowValue}>
                    {formatCostRange(item.cost)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
          <View style={styles.costSubtotalRow}>
            <Text style={styles.costSubtotalLabel}>
              Total HOA-paid project cost
            </Text>
            <Text style={styles.costSubtotalValue}>
              {formatCostRange(hoaSubtotal)}
            </Text>
          </View>
        </View>
      ) : null}

      {buyerCats.length === 0 && hoaCats.length === 0 ? (
        <Text style={styles.emptyState}>
          No repair cost estimates available for this report.
        </Text>
      ) : null}
    </View>
  );
}

function SectionHoa({ report }: { report: ReportData }) {
  return (
    <View>
      <SectionBanner number={8} title="HOA Financial & Governance Review" />
      {!report.hoa?.applicable ? (
        <Text style={styles.emptyState}>
          HOA documents not present or not applicable to this property.
        </Text>
      ) : (
        <View>
          <Text style={styles.body}>
            {report.hoa.summary}
          </Text>
          {report.hoa.concerns?.length ? (
            <View>
              <Text style={styles.subHead}>Concerns</Text>
              {report.hoa.concerns.map((c, i) => (
                <View key={i} style={styles.bullet}>
                  <Text style={styles.bulletDot}>·</Text>
                  <Text style={styles.bulletText}>{c}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function SectionPermits({ report }: { report: ReportData }) {
  return (
    <View>
      <SectionBanner number={9} title="Permits, Alterations & Code Compliance" />
      <Text style={styles.body}>
        {report.permit_compliance?.summary ||
          "No permit-related issues surfaced in the documents reviewed."}
      </Text>
      {report.permit_compliance?.findings?.length
        ? report.permit_compliance.findings.map((f, i) => (
            <FindingBlock key={i} finding={f} index={i + 1} />
          ))
        : null}
    </View>
  );
}

function SectionInsuranceLender({ report }: { report: ReportData }) {
  const r = report.insurance_lender_risk;
  return (
    <View>
      <SectionBanner number={10} title="Insurance & Lender Risk" />
      <Text style={styles.body}>{r?.summary}</Text>
      {r?.insurance_concerns?.length ? (
        <View>
          <Text style={styles.subHead}>Insurance concerns</Text>
          {r.insurance_concerns.map((c, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>·</Text>
              <Text style={styles.bulletText}>{c}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {r?.lender_concerns?.length ? (
        <View>
          <Text style={styles.subHead}>Lender concerns</Text>
          {r.lender_concerns.map((c, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>·</Text>
              <Text style={styles.bulletText}>{c}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SectionNegotiation({ report }: { report: ReportData }) {
  return (
    <View>
      <SectionBanner number={11} title="Negotiation Leverage" />
      <Text style={styles.body}>
        {report.negotiation?.summary}
      </Text>
      {report.negotiation?.leverage_points?.length ? (
        <View>
          {report.negotiation.leverage_points.map((p, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>·</Text>
              <Text style={styles.bulletText}>{p}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SectionEnvironmental({ report }: { report: ReportData }) {
  return (
    <View>
      <SectionBanner number={12} title="Environmental & Natural Hazards" />
      <Text style={styles.body}>
        {report.environmental?.summary}
      </Text>
      {report.environmental?.hazards?.length
        ? report.environmental.hazards.map((h, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>·</Text>
              <Text style={styles.bulletText}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{h.name}</Text> (
                {h.severity}): {h.notes}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

function SectionOutstanding({ report }: { report: ReportData }) {
  // Agent feedback was that this section felt overwhelming when it ran
  // to 15+ questions — the buyer would skim or skip. Render-side cap of
  // 6 (matches the synthesizer's cap for new reports; protects against
  // legacy report_data that still has 20+) plus a framing sentence that
  // explains these are the questions WORTH asking, not an exhaustive
  // checklist. The goal: surface facts, let the buyer + agent draw the
  // conclusion. Questions exist only to fill specific gaps in the docs.
  const allQuestions = report.outstanding_questions ?? [];
  const capped = allQuestions.slice(0, 6);
  const truncated = allQuestions.length > 6;

  return (
    <View>
      <SectionBanner number={13} title="Questions Worth Asking" />
      {capped.length === 0 ? (
        <Text style={styles.emptyState}>
          The documents in this package answered the buyer questions a
          California disclosure analysis typically raises. Pair this report
          with a walk-through and a buyer-side inspection contingency and
          you have what you need to proceed.
        </Text>
      ) : (
        <View>
          <Text style={styles.body}>
            {`The findings above are the facts. These questions exist only where the documents leave a specific gap that affects the buyer's decision — bring them to the seller, listing agent, or HOA management as appropriate.`}
          </Text>
          {capped.map((q, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>{i + 1}.</Text>
              <Text style={styles.bulletText}>{q}</Text>
            </View>
          ))}
          {truncated ? (
            <Text style={styles.disclaimer}>
              {`(${allQuestions.length - 6} additional minor follow-up questions were noted during analysis but trimmed here to keep this list focused. Ask Veroax for the full questions list if you need it.)`}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function SectionOverallRating({ report }: { report: ReportData }) {
  const r = report.overall_rating;
  const color = ratingColor(r?.label);
  return (
    <View>
      <SectionBanner number={14} title="Overall Property Rating" />
      <View style={styles.ratingBox}>
        <View style={styles.ratingPillRow}>
          <View style={[styles.ratingPillBox, { backgroundColor: color }]}>
            <Text style={styles.ratingPillText}>{r?.label ?? "Unrated"}</Text>
          </View>
        </View>
        <Text style={styles.ratingSummary}>{r?.summary}</Text>
        {r?.contingency_advice ? (
          <Text style={styles.ratingContingency}>{r.contingency_advice}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ============================================================================
// Helpers
// ============================================================================

// Inject zero-width spaces into unbroken runs so React-PDF has break
// points. PDF renderers won't split a word — so a long URL or file
// name (no spaces/hyphens) will run straight off the page edge.
// Injecting U+200B every ~30 chars inside long tokens gives the
// renderer wrap opportunities without affecting copy/paste meaningfully.
//
// Heuristic: only touch tokens longer than 35 chars (typical word
// length never crosses that); inside, insert a zero-width space after
// every 25 chars between break-friendly characters (/, ?, &, =, _,
// .) or, if none are nearby, just every 25 chars.
function withSoftBreaks(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .split(/(\s+)/) // keep whitespace runs
    .map((token) => {
      if (/^\s+$/.test(token) || token.length <= 35) return token;
      // First pass: insert ZWSP after natural break chars.
      let out = token.replace(/([/?&=_.])(?=\S)/g, "$1​");
      // Second pass: if any run is still > 35 chars long, force a
      // ZWSP every 25 chars within that run.
      out = out
        .split("​")
        .map((piece) => {
          if (piece.length <= 35) return piece;
          const chunks: string[] = [];
          for (let i = 0; i < piece.length; i += 25) {
            chunks.push(piece.slice(i, i + 25));
          }
          return chunks.join("​");
        })
        .join("​");
      return out;
    })
    .join("");
}

function formatAgentFooter(agent: AgentBranding): string {
  const parts = [
    agent.fullName,
    agent.brokerage,
    agent.dreLicense ? `DRE #${agent.dreLicense}` : null,
    agent.brokerageDre ? `Brokerage DRE #${agent.brokerageDre}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

// Render an ISO date (YYYY-MM-DD) as "Mar 14, 2026". Falls back to
// the raw string when the input doesn't parse — better to show what
// we got than blank out the field. Used on the cover KvTable for
// list_date and hoa_last_increase_date.
function formatIsoDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatCostRange(r: CostRange | null | undefined): string {
  if (!r) return "—";
  const low = Number(r.low) || 0;
  const high = Number(r.high) || 0;
  if (low === high) return formatUSD(low);
  return `${formatUSD(low)} – ${formatUSD(high)}`;
}

function sumLineCosts(items: Array<{ cost: CostRange }>): CostRange {
  let low = 0;
  let high = 0;
  for (const it of items) {
    low += Number(it.cost?.low) || 0;
    high += Number(it.cost?.high) || 0;
  }
  return { low, high };
}

function ratingColor(
  label: ReportData["overall_rating"]["label"] | undefined,
): string {
  switch (label) {
    case "Excellent":
      return C.positive;
    case "Good":
      return C.positive;
    case "Acceptable":
      return C.moderate;
    case "Significant Concerns":
      return C.high;
    case "Walk Away":
      return C.critical;
    default:
      return C.subtext;
  }
}
