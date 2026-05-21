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

const C = {
  navy: "#1B2A4A",
  slate: "#2E4057",
  accent: "#2E86AB",
  gold: "#C9A84C",
  critical: "#C0392B",
  high: "#E67E22",
  moderate: "#2980B9",
  positive: "#27AE60",
  light: "#F4F7FA",
  rowAlt: "#EBF2FA",
  border: "#D0DCE8",
  text: "#1A1A2E",
  subtext: "#4A4A6A",
  white: "#FFFFFF",
  strengthsBg: "#EAF7EF",
  concernsBg: "#FDECEA",
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
  // Findings
  finding: {
    marginBottom: 10,
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
    fontSize: 9,
    marginBottom: 4,
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
    fontStyle: "italic",
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
  // Sub-header within a section
  subHead: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginTop: 8,
    marginBottom: 4,
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
  // Page footer — trailing block, no absolute positioning (which crashes
  // React-PDF's layout). Re-attempt per-page fixed footer separately.
  pageFooter: {
    marginTop: 24,
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

export function ReportPDF({
  report,
  property,
  agent,
  reportId,
  generatedAt,
}: {
  report: ReportData;
  property: string;
  agent: AgentBranding;
  reportId: string;
  generatedAt: Date;
}) {
  const shortId = reportId.slice(0, 8);
  const analysisDate = generatedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const agentFooterLine = formatAgentFooter(agent);

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
        />
      </Page>

      {/* ============ BODY PAGES ============ */}
      <Page size="LETTER" style={styles.page}>
        <SectionPropertySnapshot report={report} analysisDate={analysisDate} />
        <SectionExecutiveSummary report={report} />
        <SectionDocumentInventory report={report} />
        <SectionCritical report={report} />
        <SectionModerate report={report} />
        <SectionCosmetic report={report} />
        <SectionCostSummary report={report} />
        <SectionHoa report={report} />
        <SectionPermits report={report} />
        <SectionInsuranceLender report={report} />
        <SectionNegotiation report={report} />
        <SectionEnvironmental report={report} />
        <SectionOutstanding report={report} />
        <SectionOverallRating report={report} />

        <PageFooter
          agentLine={agentFooterLine}
          property={property}
          analysisDate={analysisDate}
        />
      </Page>
    </Document>
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
}: {
  property: string;
  report: ReportData;
  agent: AgentBranding;
  analysisDate: string;
  shortId: string;
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
  return (
    <View style={styles.sectionBanner}>
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
    cosmetic: C.subtext,
  }[severity];
  return (
    <View style={[styles.badgeBox, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{severity}</Text>
    </View>
  );
}

function FindingBlock({ finding, index }: { finding: Finding; index: number }) {
  return (
    <View style={styles.finding}>
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
  );
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
  const critHighTotal = formatCostRange(report.cost_summary?.critical_high_total);
  const grandTotal = formatCostRange(report.cost_summary?.grand_total);
  const ratingLabel = report.overall_rating?.label ?? "Unrated";

  // Build "strengths" and "concerns" lists from data
  // Strengths: derived from cosmetic-only findings or absent issues
  // Concerns: top 3 critical/high findings by severity
  const concerns = (report.critical_findings ?? [])
    .slice(0, 3)
    .map((f) => f.title);
  while (concerns.length < 3) {
    concerns.push(
      modCount > 0
        ? (report.moderate_findings?.[concerns.length]?.title ??
          "Additional moderate items below")
        : "(No additional concerns identified)",
    );
  }
  const strengths: string[] = [];
  if (critCount === 0)
    strengths.push("No critical findings identified in the disclosure package");
  if (report.hoa?.applicable && report.hoa.concerns?.length === 0)
    strengths.push("HOA review surfaced no material financial concerns");
  if ((report.environmental?.hazards?.length ?? 0) === 0)
    strengths.push("No significant natural hazard zones disclosed");
  while (strengths.length < 3) {
    strengths.push(
      cosmCount > 0
        ? "Most findings are cosmetic and addressable post-close"
        : "Standard contingency timelines should suffice",
    );
  }

  return (
    <View>
      <SectionBanner number={2} title="Executive Summary" />
      <Text style={{ fontSize: 9.5, marginBottom: 6 }}>
        This analysis identified{" "}
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{critCount}</Text>{" "}
        critical / high,{" "}
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{modCount}</Text>{" "}
        moderate, and{" "}
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{cosmCount}</Text>{" "}
        cosmetic findings across the disclosure package. Critical and
        high-priority repair exposure is estimated at{" "}
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{critHighTotal}</Text>;
        total estimated repair exposure across all severities is{" "}
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{grandTotal}</Text>.
      </Text>
      <Text style={{ fontSize: 9.5, marginBottom: 8 }}>
        Overall rating:{" "}
        <Text style={{ fontFamily: "Helvetica-Bold" }}>{ratingLabel}</Text>. See
        Section 14 for the full rationale and contingency guidance.
      </Text>

      <View style={styles.dualBlock}>
        <View style={styles.dualBlockLeft}>
          <Text style={styles.dualBlockHeaderGreen}>THREE STRENGTHS</Text>
          {strengths.slice(0, 3).map((s, i) => (
            <Text key={i} style={{ fontSize: 9, marginBottom: 2 }}>
              {i + 1}. {s}
            </Text>
          ))}
        </View>
        <View style={styles.dualBlockRight}>
          <Text style={styles.dualBlockHeaderRed}>THREE KEY CONCERNS</Text>
          {concerns.slice(0, 3).map((c, i) => (
            <Text key={i} style={{ fontSize: 9, marginBottom: 2 }}>
              {i + 1}. {c}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function SectionDocumentInventory({ report }: { report: ReportData }) {
  const inv = report.document_inventory;
  return (
    <View>
      <SectionBanner number={3} title="Document Inventory" />
      <Text style={styles.subHead}>Provided</Text>
      {inv?.documents_provided?.length ? (
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
        <Text style={{ fontSize: 9, fontStyle: "italic", color: C.subtext }}>
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
        <Text style={{ fontSize: 9, fontStyle: "italic", color: C.subtext }}>
          Package appears complete.
        </Text>
      )}
    </View>
  );
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
        <Text style={{ fontSize: 9, fontStyle: "italic", color: C.subtext }}>
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
        <Text style={{ fontSize: 9, fontStyle: "italic", color: C.subtext }}>
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
        <Text style={{ fontSize: 9, fontStyle: "italic", color: C.subtext }}>
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
        <Text style={{ fontSize: 9, fontStyle: "italic", color: C.subtext }}>
          HOA documents not present or not applicable to this property.
        </Text>
      ) : (
        <View>
          <Text style={{ fontSize: 9.5, marginBottom: 6 }}>
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
      <Text style={{ fontSize: 9.5, marginBottom: 6 }}>
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
      <Text style={{ fontSize: 9.5, marginBottom: 6 }}>{r?.summary}</Text>
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
      <Text style={{ fontSize: 9.5, marginBottom: 6 }}>
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
      <Text style={{ fontSize: 9.5, marginBottom: 6 }}>
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
        <Text style={{ fontSize: 9, fontStyle: "italic", color: C.subtext }}>
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

function PageFooter({
  agentLine,
  property,
  analysisDate,
}: {
  agentLine: string;
  property: string;
  analysisDate: string;
}) {
  return (
    <View style={styles.pageFooter}>
      <Text>{agentLine || "Veroax disclosure analysis"}</Text>
      <Text>
        {property} · {analysisDate}
      </Text>
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
