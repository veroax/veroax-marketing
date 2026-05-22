import type { ReportData, CostRange } from "@/lib/anthropic/schema";

// Shared "Executive Summary" / "Talking Points" narrative generator
// used by:
//   - lib/pdf-render/ReportPDF.tsx (the PDF cover's Executive Summary)
//   - /dashboard/reports/[id]/page.tsx (the on-screen Talking Points card)
//
// Both surfaces draw from the same function so what the agent sees on
// the dashboard matches what their client reads in the PDF — no drift.
//
// Returns 2-3 substantive paragraphs covering:
//   1. Property overview (type, age, size, market, list price/DOM)
//   2. Findings synthesis with cost exposure
//   3. HOA + hazard context + bottom-line rating

export function composeExecutiveNarrative(report: ReportData): string[] {
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

// ---- Local formatters (kept inline so this module has no React-PDF
// or dashboard-page dependencies — it's pure logic that can be
// consumed from either render surface). ----

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
