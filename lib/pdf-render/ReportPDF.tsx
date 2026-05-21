/* eslint-disable jsx-a11y/alt-text */

// Renders a Veroax disclosure analysis report as a downloadable PDF.
// Modeled on the Cowork output: clean text-based layout, numbered
// sections, colored severity badges, source citations, agent branding
// footer with auto page numbers.
//
// Uses @react-pdf/renderer (works in Vercel serverless without
// Chrome/headless-browser dependencies).

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type {
  ReportData,
  Finding,
  CostRange,
  Severity,
} from "@/lib/anthropic/schema";

// ============================================================================
// Theme
// ============================================================================

const COLORS = {
  ink: "#1A1A2E",
  text: "#1A1A2E",
  muted: "#4A4A4A",
  hairline: "#C8C8DC",
  cream: "#FAF8F2",
  panel: "#F5F2EA",
  indigo: "#1e1b4b",
  indigoDeep: "#191970",
  gold: "#C9A84C",
  critical: "#7A2E2E",
  high: "#8B5A2B",
  moderate: "#4A6A87",
  cosmetic: "#6B7280",
  white: "#FFFFFF",
} as const;

// Notes on @react-pdf/renderer style quirks (learned the hard way):
//   - Fractional border widths (0.5) can produce huge negative
//     coordinates inside clipBorderTop, crashing pdfkit. Stick to
//     integer widths.
//   - "gap" and "flexWrap" are not reliably supported. Use margins.
//   - "letterSpacing" is partially supported; safer to omit.
//   - lineHeight as a multiplier works but be conservative.
const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: COLORS.text,
    lineHeight: 1.4,
  },
  // ----- Cover page -----
  coverHeader: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  coverHeaderText: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: COLORS.indigoDeep,
    marginTop: 28,
    marginBottom: 4,
  },
  coverSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 20,
  },
  coverPropertyLine: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: COLORS.ink,
    marginBottom: 12,
  },
  // ----- Section heading -----
  sectionHeader: {
    flexDirection: "row",
    marginTop: 16,
    marginBottom: 8,
  },
  sectionNumber: {
    backgroundColor: COLORS.indigoDeep,
    color: COLORS.gold,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 8,
    paddingVertical: 5,
    textTransform: "uppercase",
  },
  sectionTitle: {
    flexGrow: 1,
    backgroundColor: COLORS.indigoDeep,
    color: COLORS.white,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  // ----- Table -----
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
  tableLabel: {
    width: 140,
    paddingVertical: 4,
    paddingRight: 8,
    color: COLORS.muted,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tableValue: {
    flexGrow: 1,
    paddingVertical: 4,
    color: COLORS.ink,
    fontSize: 10,
  },
  // ----- Findings -----
  finding: {
    marginTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
  findingTitleRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  findingTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: COLORS.indigoDeep,
    flexGrow: 1,
    paddingRight: 8,
  },
  source: {
    fontSize: 9,
    color: COLORS.muted,
    fontStyle: "italic",
    marginBottom: 4,
  },
  badge: {
    color: COLORS.white,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase",
  },
  description: {
    marginBottom: 3,
  },
  metaLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  // ----- Rating box -----
  ratingBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.hairline,
  },
  ratingPill: {
    color: COLORS.white,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 12,
    paddingVertical: 5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  // ----- Footer -----
  footer: {
    position: "absolute",
    left: 56,
    right: 56,
    bottom: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLORS.muted,
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
    paddingTop: 6,
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 2,
  },
  bulletDot: {
    width: 12,
    color: COLORS.muted,
  },
  bulletText: {
    flexGrow: 1,
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
  return (
    <Document
      title={`Disclosure Analysis — ${property}`}
      author="Veroax"
      subject="AI-assisted disclosure analysis"
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header strip */}
        <View style={styles.coverHeader} fixed>
          <Text style={styles.coverHeaderText}>Disclosure Package Analysis</Text>
          <Text style={styles.coverHeaderText}>Report ID: {shortId}</Text>
        </View>

        <Text style={styles.coverTitle}>Disclosure Analysis</Text>
        <Text style={styles.coverSubtitle}>
          Buyer&apos;s review of the seller&apos;s disclosure package
        </Text>
        <Text style={styles.coverPropertyLine}>{property}</Text>

        <SectionPropertySnapshot data={report} />
        <SectionDocumentInventory data={report} />
        <SectionExecutiveSummary data={report} />
        <SectionCritical data={report} />
        <SectionHighModerate data={report} />
        <SectionCosmetic data={report} />
        <SectionCostSummary data={report} />
        <SectionHoa data={report} />
        <SectionPermits data={report} />
        <SectionInsuranceLender data={report} />
        <SectionNegotiation data={report} />
        <SectionEnvironmental data={report} />
        <SectionOutstanding data={report} />
        <SectionOverallRating data={report} />

        {/* Footer (auto-rendered on every page) */}
        <Footer agent={agent} property={property} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}

// ============================================================================
// Sections
// ============================================================================

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <View style={styles.sectionHeader} wrap={false}>
      <Text style={styles.sectionNumber}>Section {number}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SectionPropertySnapshot({ data }: { data: ReportData }) {
  const p = data.property_snapshot;
  const rows: Array<[string, string]> = [];
  if (p?.property_type)
    rows.push(["Property type", p.property_type]);
  if (p?.year_built) rows.push(["Year built", String(p.year_built)]);
  if (p?.square_feet)
    rows.push(["Square feet", p.square_feet.toLocaleString()]);
  if (p?.bedrooms != null && p?.bathrooms != null)
    rows.push(["Bed / Bath", `${p.bedrooms} bed · ${p.bathrooms} bath`]);
  if (p?.list_price)
    rows.push(["List price", formatUSD(p.list_price)]);
  if (p?.days_on_market != null)
    rows.push(["Days on market", String(p.days_on_market)]);
  if (p?.market_region) rows.push(["Market region", p.market_region]);

  return (
    <View>
      <SectionHeader number={1} title="Property Snapshot" />
      {rows.length === 0 ? (
        <Text>Property details not extracted.</Text>
      ) : (
        rows.map(([label, value]) => (
          <View key={label} style={styles.tableRow}>
            <Text style={styles.tableLabel}>{label}</Text>
            <Text style={styles.tableValue}>{value}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function SectionDocumentInventory({ data }: { data: ReportData }) {
  const inv = data.document_inventory;
  return (
    <View>
      <SectionHeader number={2} title="Document Inventory" />
      <Text style={[styles.metaLabel, { marginTop: 4, marginBottom: 4 }]}>
        Provided
      </Text>
      {inv?.documents_provided?.length ? (
        inv.documents_provided.map((d, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>·</Text>
            <Text style={styles.bulletText}>
              <Text style={styles.metaLabel}>{d.type}</Text>: {d.name}
              {d.pages ? ` (${d.pages} pp)` : ""}
            </Text>
          </View>
        ))
      ) : (
        <Text>None identified.</Text>
      )}
      <Text style={[styles.metaLabel, { marginTop: 8, marginBottom: 4 }]}>
        Standard CA disclosures NOT in this package
      </Text>
      {inv?.documents_missing?.length ? (
        inv.documents_missing.map((d, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>·</Text>
            <Text style={styles.bulletText}>{d}</Text>
          </View>
        ))
      ) : (
        <Text>Package appears complete.</Text>
      )}
    </View>
  );
}

function SectionExecutiveSummary({ data }: { data: ReportData }) {
  const crit = data.critical_findings?.length ?? 0;
  const mod = data.moderate_findings?.length ?? 0;
  const cos = data.cosmetic_findings?.length ?? 0;
  const totalCritHigh = formatCostRange(data.cost_summary?.critical_high_total);
  const totalGrand = formatCostRange(data.cost_summary?.grand_total);
  const rating = data.overall_rating?.label ?? "Unrated";

  return (
    <View>
      <SectionHeader number={3} title="Executive Summary" />
      <Text style={{ marginBottom: 6 }}>
        This analysis identified{" "}
        <Text style={styles.metaLabel}>{crit} critical / high</Text>,{" "}
        <Text style={styles.metaLabel}>{mod} moderate</Text>, and{" "}
        <Text style={styles.metaLabel}>{cos} cosmetic</Text> finding{cos === 1 ? "" : "s"} across the disclosure
        documents. Critical and high-priority repair exposure is estimated at{" "}
        <Text style={styles.metaLabel}>{totalCritHigh}</Text>; total estimated
        repair exposure across all severities is{" "}
        <Text style={styles.metaLabel}>{totalGrand}</Text>.
      </Text>
      <Text>
        Overall rating:{" "}
        <Text style={styles.metaLabel}>{rating}</Text>. See Section 14 for the
        full rating rationale and contingency guidance.
      </Text>
    </View>
  );
}

function SectionCritical({ data }: { data: ReportData }) {
  return (
    <FindingsSection
      number={4}
      title="Critical & High-Priority Findings"
      findings={data.critical_findings}
      emptyMessage="No critical or high-priority findings identified."
    />
  );
}

function SectionHighModerate({ data }: { data: ReportData }) {
  return (
    <FindingsSection
      number={5}
      title="Moderate Findings"
      findings={data.moderate_findings}
      emptyMessage="No moderate findings identified."
    />
  );
}

function SectionCosmetic({ data }: { data: ReportData }) {
  return (
    <FindingsSection
      number={6}
      title="Cosmetic Findings"
      findings={data.cosmetic_findings}
      emptyMessage="No cosmetic findings identified."
    />
  );
}

function FindingsSection({
  number,
  title,
  findings,
  emptyMessage,
}: {
  number: number;
  title: string;
  findings: Finding[] | undefined;
  emptyMessage: string;
}) {
  return (
    <View>
      <SectionHeader number={number} title={title} />
      {!findings?.length ? (
        <Text style={{ fontStyle: "italic", color: COLORS.muted }}>{emptyMessage}</Text>
      ) : (
        findings.map((f, i) => <FindingBlock key={i} finding={f} index={i + 1} />)
      )}
    </View>
  );
}

function FindingBlock({ finding, index }: { finding: Finding; index: number }) {
  return (
    <View style={styles.finding} wrap={false}>
      <View style={styles.findingTitleRow}>
        <Text style={styles.findingTitle}>
          {index}. {finding.title}
        </Text>
        <SeverityBadge severity={finding.severity} />
      </View>
      <Text style={styles.source}>{finding.source}</Text>
      {finding.description ? (
        <Text style={styles.description}>{finding.description}</Text>
      ) : null}
      <View style={{ marginTop: 4 }}>
        <KeyValue label="Cost" value={formatCostRange(finding.cost_estimate)} />
        <KeyValue label="Risk if ignored" value={finding.risk_if_ignored} />
        <KeyValue label="Recommended action" value={finding.recommended_action} />
        <KeyValue
          label="Confidence"
          value={finding.confidence.charAt(0).toUpperCase() + finding.confidence.slice(1)}
        />
      </View>
    </View>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", marginTop: 2 }}>
      <Text style={[styles.metaLabel, { width: 110 }]}>{label}</Text>
      <Text style={{ flexGrow: 1, fontSize: 9 }}>{value}</Text>
    </View>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const bg = {
    critical: COLORS.critical,
    high: COLORS.high,
    moderate: COLORS.moderate,
    cosmetic: COLORS.cosmetic,
  }[severity];
  return (
    <Text style={[styles.badge, { backgroundColor: bg }]}>{severity}</Text>
  );
}

function SectionCostSummary({ data }: { data: ReportData }) {
  const cs = data.cost_summary;
  return (
    <View>
      <SectionHeader number={7} title="Repair Cost Summary" />
      {cs?.line_items?.length
        ? cs.line_items.map((cat, ci) => (
            <View key={ci} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={[styles.metaLabel, { marginTop: 6 }]}>{cat.category}</Text>
              {cat.items.map((item, ii) => (
                <View key={ii} style={styles.tableRow}>
                  <Text style={[styles.tableValue, { flexGrow: 1 }]}>{item.label}</Text>
                  <Text
                    style={[styles.tableValue, { width: 120, textAlign: "right" }]}
                  >
                    {formatCostRange(item.cost)}
                  </Text>
                </View>
              ))}
            </View>
          ))
        : null}
      <View
        style={{
          flexDirection: "row",
          marginTop: 10,
          paddingVertical: 6,
          paddingHorizontal: 10,
          backgroundColor: COLORS.indigoDeep,
        }}
        wrap={false}
      >
        <Text style={{ flexGrow: 1, color: COLORS.white, fontFamily: "Helvetica-Bold" }}>
          TOTAL ESTIMATED REPAIR EXPOSURE
        </Text>
        <Text style={{ color: COLORS.white, fontFamily: "Helvetica-Bold" }}>
          {formatCostRange(cs?.grand_total)}
        </Text>
      </View>
    </View>
  );
}

function SectionHoa({ data }: { data: ReportData }) {
  return (
    <View>
      <SectionHeader number={8} title="HOA Financial & Governance Review" />
      {!data.hoa?.applicable ? (
        <Text style={{ fontStyle: "italic", color: COLORS.muted }}>
          HOA documents not present or not applicable to this property.
        </Text>
      ) : (
        <View>
          <Text style={{ marginBottom: 6 }}>{data.hoa.summary}</Text>
          {data.hoa.concerns?.length ? (
            <View>
              <Text style={styles.metaLabel}>Concerns:</Text>
              {data.hoa.concerns.map((c, i) => (
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

function SectionPermits({ data }: { data: ReportData }) {
  return (
    <View>
      <SectionHeader number={9} title="Permits, Alterations & Code Compliance" />
      <Text style={{ marginBottom: 6 }}>
        {data.permit_compliance?.summary ||
          "No permit-related issues surfaced in the documents reviewed."}
      </Text>
      {data.permit_compliance?.findings?.length
        ? data.permit_compliance.findings.map((f, i) => (
            <FindingBlock key={i} finding={f} index={i + 1} />
          ))
        : null}
    </View>
  );
}

function SectionInsuranceLender({ data }: { data: ReportData }) {
  const r = data.insurance_lender_risk;
  return (
    <View>
      <SectionHeader number={10} title="Insurance & Lender Risk" />
      <Text style={{ marginBottom: 6 }}>{r?.summary}</Text>
      {r?.insurance_concerns?.length ? (
        <View style={{ marginBottom: 6 }}>
          <Text style={styles.metaLabel}>Insurance concerns</Text>
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
          <Text style={styles.metaLabel}>Lender concerns</Text>
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

function SectionNegotiation({ data }: { data: ReportData }) {
  return (
    <View>
      <SectionHeader number={11} title="Negotiation Leverage" />
      <Text style={{ marginBottom: 6 }}>{data.negotiation?.summary}</Text>
      {data.negotiation?.leverage_points?.length ? (
        <View>
          {data.negotiation.leverage_points.map((p, i) => (
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

function SectionEnvironmental({ data }: { data: ReportData }) {
  return (
    <View>
      <SectionHeader number={12} title="Environmental & Natural Hazards" />
      <Text style={{ marginBottom: 6 }}>{data.environmental?.summary}</Text>
      {data.environmental?.hazards?.length ? (
        data.environmental.hazards.map((h, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>·</Text>
            <Text style={styles.bulletText}>
              <Text style={styles.metaLabel}>{h.name}</Text> ({h.severity}): {h.notes}
            </Text>
          </View>
        ))
      ) : null}
    </View>
  );
}

function SectionOutstanding({ data }: { data: ReportData }) {
  return (
    <View>
      <SectionHeader number={13} title="Outstanding Questions" />
      {data.outstanding_questions?.length ? (
        data.outstanding_questions.map((q, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>{i + 1}.</Text>
            <Text style={styles.bulletText}>{q}</Text>
          </View>
        ))
      ) : (
        <Text style={{ fontStyle: "italic", color: COLORS.muted }}>
          No outstanding questions identified.
        </Text>
      )}
    </View>
  );
}

function SectionOverallRating({ data }: { data: ReportData }) {
  const r = data.overall_rating;
  const ratingColor = ratingPillColor(r?.label);
  return (
    <View>
      <SectionHeader number={14} title="Overall Property Rating" />
      <View style={styles.ratingBox} wrap={false}>
        <Text style={[styles.ratingPill, { backgroundColor: ratingColor }]}>
          {r?.label ?? "Unrated"}
        </Text>
        <Text style={{ marginBottom: 6 }}>{r?.summary}</Text>
        {r?.contingency_advice ? (
          <Text style={{ fontStyle: "italic", color: COLORS.muted }}>
            {r.contingency_advice}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ============================================================================
// Footer (per-page) and helpers
// ============================================================================

function Footer({
  agent,
  property,
  generatedAt,
}: {
  agent: AgentBranding;
  property: string;
  generatedAt: Date;
}) {
  const agentLine = [
    agent.fullName,
    agent.brokerage,
    agent.dreLicense ? `DRE #${agent.dreLicense}` : null,
    agent.brokerageDre ? `Brokerage DRE #${agent.brokerageDre}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const right = `${property} · ${generatedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
  return (
    <View style={styles.footer} fixed>
      <Text>{agentLine || "Veroax disclosure analysis"}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${right} · Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
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

function ratingPillColor(
  label: ReportData["overall_rating"]["label"] | undefined,
): string {
  switch (label) {
    case "Excellent":
      return "#047857"; // emerald-700
    case "Good":
      return "#059669"; // emerald-600
    case "Acceptable":
      return COLORS.moderate;
    case "Significant Concerns":
      return COLORS.high;
    case "Walk Away":
      return COLORS.critical;
    default:
      return COLORS.cosmetic;
  }
}
