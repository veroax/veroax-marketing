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
  },
  // Cover layout — no minHeight (caused layout coordinate crashes)
  coverWrap: {
    flexDirection: "row",
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
  coverEyebrow: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.gold,
    marginBottom: 6,
  },
  coverTitle: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 2,
  },
  coverSubtitle: {
    fontSize: 13,
    color: C.slate,
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
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 9,
    color: C.text,
  },
  // Section banner
  sectionBanner: {
    flexDirection: "row",
    backgroundColor: C.navy,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionBannerLabelBox: {
    width: 60,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.navy,
  },
  sectionBannerLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#9BBDCC",
  },
  sectionBannerTitleBox: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.navy,
  },
  sectionBannerTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  // Findings — each rendered as a distinct card with a colored
  // left-edge severity accent strip, light background, and padding.
  findingCard: {
    flexDirection: "row",
    marginBottom: 12,
    backgroundColor: C.light,
  },
  findingAccent: {
    width: 4,
  },
  findingBody: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  findingHeader: {
    flexDirection: "row",
    marginBottom: 4,
  },
  findingTitle: {
    flexGrow: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: C.navy,
    paddingRight: 8,
  },
  source: {
    fontSize: 8.5,
    color: C.subtext,
    fontStyle: "italic",
    marginBottom: 4,
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
  body: {
    fontSize: 9.5,
    marginBottom: 6,
    lineHeight: 1.5,
  },
  bodyTight: {
    fontSize: 9.5,
    marginBottom: 4,
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
  bulletNumbered: {
    fontSize: 9,
    marginBottom: 2,
    lineHeight: 1.4,
  },
  // Two-column dual block (Strengths/Concerns, etc.)
  // flexBasis: 0 was triggering layout coordinate crashes — use width instead.
  dualBlock: {
    flexDirection: "row",
    marginTop: 4,
  },
  // Letter width 612 - paddingHorizontal*2 (56*2=112) = 500 content area.
  // Two 240-wide columns + 20pt gap = 500. Exact widths avoid percentage
  // calc paths that crash React-PDF's layout engine.
  dualBlockLeft: {
    width: 240,
    padding: 10,
    backgroundColor: C.strengthsBg,
  },
  dualBlockRight: {
    width: 240,
    padding: 10,
    backgroundColor: C.concernsBg,
    marginLeft: 20,
  },
  dualBlockHeaderGreen: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.positive,
    marginBottom: 4,
  },
  dualBlockHeaderRed: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.critical,
    marginBottom: 4,
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
  },
  // Cost summary table
  costSectionHeader: {
    flexDirection: "row",
    backgroundColor: C.slate,
    marginTop: 10,
  },
  costSectionHeaderLabel: {
    flexGrow: 1,
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
  // Page header (top of each body page) — property address left,
  // "AI-Assisted Disclosure Analysis | Confidential" right.
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
  // Page footer (bottom of each body page) — agent line + page number.
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
};

export type OriginalFile = {
  name: string;
  pages: number;
  size_kb: number;
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

  // Body page grouping. Forced page breaks happen between groups:
  //   Page 2: sections 1-3 (Snapshot, Executive Summary, Document Inventory)
  //   Page 3: sections 4-5 (Critical/High, Moderate findings)
  //   Page 4: sections 6-7 (Cosmetic, Repair Cost Summary)
  //   Page 5: sections 8-10 (HOA, Permits, Insurance & Lender Risk)
  //   Page 6: sections 11-14 (Negotiation, Environmental, Questions, Rating)
  const totalBodyPages = 5;
  const bodyPageNumber = (n: number) => `Page ${n} of ${totalBodyPages}`;

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
      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        pageLabel={bodyPageNumber(1)}
      >
        <SectionPropertySnapshot report={report} analysisDate={analysisDate} />
        <SectionExecutiveSummary report={report} />
        <SectionDocumentInventory report={report} originalFiles={originalFiles} />
      </BodyPage>

      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        pageLabel={bodyPageNumber(2)}
      >
        <SectionCritical report={report} />
        <SectionModerate report={report} />
      </BodyPage>

      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        pageLabel={bodyPageNumber(3)}
      >
        <SectionCosmetic report={report} />
        <SectionCostSummary report={report} />
      </BodyPage>

      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        pageLabel={bodyPageNumber(4)}
      >
        <SectionHoa report={report} />
        <SectionPermits report={report} />
        <SectionInsuranceLender report={report} />
      </BodyPage>

      <BodyPage
        property={property}
        agentLine={agentFooterLine}
        pageLabel={bodyPageNumber(5)}
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
  pageLabel,
}: {
  children: React.ReactNode;
  property: string;
  agentLine: string;
  pageLabel: string;
}) {
  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.pageHeader}>
        <Text>{property}</Text>
        <Text>AI-Assisted Disclosure Analysis | Confidential</Text>
      </View>
      <View style={styles.pageHeaderSeparator} />

      {children}

      <View style={styles.pageFooterWrap}>
        <View style={styles.pageFooterSeparator} />
        <View style={styles.pageFooter}>
          <Text>{agentLine || "Veroax disclosure analysis"}</Text>
          <Text>{pageLabel}</Text>
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

  const coverKv: Array<[string, string]> = [];
  if (p?.property_type) coverKv.push(["Property Type", p.property_type]);
  if (p?.year_built) coverKv.push(["Year Built", String(p.year_built)]);
  if (p?.list_price) coverKv.push(["List Price", formatUSD(p.list_price)]);
  if (p?.market_region) coverKv.push(["Market Region", p.market_region]);
  coverKv.push(["Analysis Date", analysisDate]);
  coverKv.push(["Report ID", shortId]);

  return (
    <View style={styles.coverWrap}>
      <View style={styles.coverAccentBar} />
      <View style={styles.coverInner}>
        <Text style={styles.coverEyebrow}>AI-ASSISTED DISCLOSURE ANALYSIS</Text>
        <Text style={styles.coverTitle}>{line1}</Text>
        {line2 ? <Text style={styles.coverSubtitle}>{line2}</Text> : null}
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
            <Text style={styles.preparedForLabel}>PREPARED FOR</Text>
            <Text style={styles.preparedForName}>{clientName}</Text>
          </View>
        ) : null}

        <Text style={styles.preparedByLabel}>Prepared By</Text>
        {agent.fullName ? (
          <Text style={styles.preparedByName}>{agent.fullName}</Text>
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
  );
}

// ============================================================================
// Reusable pieces
// ============================================================================

function SectionBanner({ number, title }: { number: number; title: string }) {
  // The banner is the "header group" — a deliberately small wrapper
  // (~32pt tall) marked wrap={false} so the banner itself can never
  // be split across pages. minPresenceAhead={80} additionally tells
  // React-PDF: if there's less than 80pt of room below the banner on
  // the current page, push the WHOLE banner to the next page. That
  // prevents the orphan case where a page ends with a banner sitting
  // at the bottom and the content begins on the next page.
  //
  // wrap={false} is safe here despite the project-wide prohibition on
  // wrap={false} for tall content — this wrapper is intentionally tiny
  // (just the banner, ~32pt) and well under page height.
  return (
    <View wrap={false} minPresenceAhead={80} style={styles.sectionBanner}>
      <View style={styles.sectionBannerLabelBox}>
        <Text style={styles.sectionBannerLabel}>SECTION {number}</Text>
      </View>
      <View style={styles.sectionBannerTitleBox}>
        <Text style={styles.sectionBannerTitle}>{title.toUpperCase()}</Text>
      </View>
    </View>
  );
}

function KvTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <View>
      {rows.map(([label, value], i) => (
        <View key={label} style={i % 2 === 1 ? styles.kvRowAlt : styles.kvRow}>
          <Text style={styles.kvLabel}>{label}</Text>
          <Text style={styles.kvValue}>{value}</Text>
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
  const accentColor = severityHexColor(finding.severity);
  return (
    <View style={styles.findingCard}>
      <View style={[styles.findingAccent, { backgroundColor: accentColor }]} />
      <View style={styles.findingBody}>
        <View style={styles.findingHeader}>
          <Text style={styles.findingTitle}>
            Issue {index}: {finding.title}
          </Text>
          <SeverityBadge severity={finding.severity} />
        </View>
        <Text style={styles.source}>{finding.source}</Text>
        {finding.description ? (
          <Text style={styles.description}>{finding.description}</Text>
        ) : null}
        <KvTable
          rows={[
            ["Source", finding.source],
            ["Est. Cost", formatCostRange(finding.cost_estimate)],
            ["Risk if Ignored", finding.risk_if_ignored],
            ["Recommended Action", finding.recommended_action],
            [
              "Confidence",
              finding.confidence.charAt(0).toUpperCase() +
                finding.confidence.slice(1),
            ],
          ]}
        />
      </View>
    </View>
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
  const rows: Array<[string, string]> = [];
  if (p?.address) rows.push(["Address", p.address]);
  if (p?.property_type) rows.push(["Property Type", p.property_type]);
  if (p?.year_built) rows.push(["Year Built", String(p.year_built)]);
  if (p?.square_feet)
    rows.push(["Square Feet", p.square_feet.toLocaleString()]);
  if (p?.bedrooms != null || p?.bathrooms != null) {
    rows.push([
      "Bed / Bath",
      `${p?.bedrooms ?? "—"} bed / ${p?.bathrooms ?? "—"} bath`,
    ]);
  }
  if (p?.list_price) rows.push(["List Price", formatUSD(p.list_price)]);
  if (p?.days_on_market != null)
    rows.push(["Days on Market", String(p.days_on_market)]);
  if (p?.market_region) rows.push(["Market Region", p.market_region]);
  rows.push(["Analysis Date", analysisDate]);

  return (
    <View>
      <SectionBanner number={1} title="Property Snapshot" />
      <KvTable rows={rows} />
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

// Compose the lead-in narrative for the Executive Summary section.
// Builds 2-3 substantive paragraphs from the report data: property
// context, findings synthesis with cost exposure, and bottom line.
function composeExecutiveNarrative(report: ReportData): string[] {
  const p = report.property_snapshot;
  const cs = report.cost_summary;
  const ratingLabel = report.overall_rating?.label ?? "Unrated";

  const paragraphs: string[] = [];

  // ── Paragraph 1: Property overview ──
  const typeLabel = p?.property_type
    ? p.property_type.toLowerCase()
    : "property";
  const yearPart = p?.year_built
    ? `built in ${p.year_built}`
    : "of unknown vintage";
  const sqftPart = p?.square_feet
    ? `, ${p.square_feet.toLocaleString()} sq ft`
    : "";
  const bedBath =
    p?.bedrooms != null && p?.bathrooms != null
      ? `, ${p.bedrooms} bed / ${p.bathrooms} bath`
      : "";
  const regionPart = p?.market_region ? ` in the ${p.market_region} market` : "";
  const pricePart = p?.list_price
    ? ` and listed at ${formatUSD(p.list_price)}`
    : "";
  const domPart =
    p?.days_on_market != null
      ? `, with ${p.days_on_market} day${p.days_on_market === 1 ? "" : "s"} on market`
      : "";
  paragraphs.push(
    `This report reviews the seller's disclosure package for a ${typeLabel} ${yearPart}${sqftPart}${bedBath}${regionPart}${pricePart}${domPart}. Every finding below is grounded in the documents that were actually provided; this is not a substitute for licensed professional inspection, attorney review, or lender underwriting.`,
  );

  // ── Paragraph 2: Findings synthesis with cost exposure ──
  const critCount = report.critical_findings?.length ?? 0;
  const modCount = report.moderate_findings?.length ?? 0;
  let findingsPara = "";
  if (critCount === 0 && modCount === 0) {
    findingsPara =
      "The package reveals no critical, high, or moderate findings that materially affect the buyer's decision — the disclosed condition is consistent with a well-maintained property.";
  } else if (critCount === 0) {
    findingsPara = `The package surfaces ${modCount} moderate item${modCount === 1 ? "" : "s"} reflecting typical aging-property maintenance, but no critical or high-severity findings. The work is bounded and routine.`;
  } else {
    const topCritical = (report.critical_findings ?? [])
      .slice(0, 2)
      .map((f) => f.title)
      .join(" and ");
    findingsPara = `${critCount} critical or high-severity finding${critCount === 1 ? "" : "s"} require immediate attention before contingency removal${topCritical ? ` — including ${topCritical}` : ""}.`;
    if (modCount > 0) {
      findingsPara += ` ${modCount} additional moderate item${modCount === 1 ? "" : "s"} add to the work scope.`;
    }
  }
  if (cs?.grand_total && (cs.grand_total.low > 0 || cs.grand_total.high > 0)) {
    findingsPara += ` Total estimated repair exposure across all severities is ${formatCostRange(cs.grand_total)}, with the critical/high portion at ${formatCostRange(cs.critical_high_total)}.`;
  }
  paragraphs.push(findingsPara);

  // ── Paragraph 3: HOA + hazards + rating-driven bottom line ──
  const bottomParts: string[] = [];
  if (report.hoa?.applicable) {
    if ((report.hoa.concerns?.length ?? 0) > 0) {
      bottomParts.push(
        `The HOA review surfaced ${report.hoa.concerns.length} concern${report.hoa.concerns.length === 1 ? "" : "s"} (Section 8) worth confirming with the association directly before contingency removal.`,
      );
    } else {
      bottomParts.push(
        "The HOA review surfaced no material financial concerns (Section 8).",
      );
    }
  }
  const hazardCount = report.environmental?.hazards?.length ?? 0;
  if (hazardCount > 0) {
    bottomParts.push(
      `Natural hazard disclosures include ${hazardCount} zone determination${hazardCount === 1 ? "" : "s"} (Section 12) that may affect insurance availability and lender requirements.`,
    );
  }
  bottomParts.push(
    `Overall rating: ${ratingLabel}. ${report.overall_rating?.summary ?? ""}`,
  );
  paragraphs.push(bottomParts.join(" "));

  return paragraphs;
}

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
  return (
    <View>
      <SectionBanner number={7} title="Repair Cost Summary" />
      {cs?.line_items?.length
        ? cs.line_items.map((cat, ci) => (
            <View key={ci}>
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
          ))
        : null}
      <View style={styles.costGrandTotalRow}>
        <Text style={styles.costGrandTotalLabel}>
          TOTAL ESTIMATED REPAIR EXPOSURE
        </Text>
        <Text style={styles.costGrandTotalValue}>
          {formatCostRange(cs?.grand_total)}
        </Text>
      </View>
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
  return (
    <View>
      <SectionBanner number={13} title="Outstanding Questions" />
      {report.outstanding_questions?.length ? (
        report.outstanding_questions.map((q, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>{i + 1}.</Text>
            <Text style={styles.bulletText}>{q}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyState}>
          No outstanding questions identified.
        </Text>
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

function formatAgentFooter(agent: AgentBranding): string {
  const parts = [
    agent.fullName,
    agent.brokerage,
    agent.dreLicense ? `DRE #${agent.dreLicense}` : null,
    agent.brokerageDre ? `Brokerage DRE #${agent.brokerageDre}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
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
