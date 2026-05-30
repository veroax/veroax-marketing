import type { ReportData, CostRange } from "@/lib/anthropic/schema";
import { deriveCostSummary } from "./cost-summary";

// Shared "Executive Summary" / "Talking Points" narrative generator
// used by:
//   - lib/pdf-render/ReportPDF.tsx (the PDF cover's Executive Summary)
//   - /dashboard/reports/[id]/page.tsx (the on-screen Talking Points card)
//   - app/r/[code]/_components/PublicReportView.tsx (the public report)
//
// All three surfaces draw from this function so what the agent reads
// on the dashboard matches what the client reads on the public web
// view AND what the PDF cover says, no drift.
//
// Returns 3-4 substantive paragraphs covering:
//   1. Property overview with party identity (sellers, listing team,
//      prep service, package date) when populated
//   2. Findings synthesis with named critical findings and cost
//      exposure
//   3. HOA + hazard context, ADU + solar context when present
//   4. Bottom line synthesis (negotiation posture + rating)
//
// The cosmetic upgrade in this version: when the 5f45a99 prompt
// overhaul populates the new property_snapshot fields (named_sellers,
// named_listing_team, package_date, disclosure_prep_service,
// adu_status, solar_status, fema_flood_zone, hazard_zone_summary),
// the narrative weaves those specifics in. Legacy reports without
// those fields render the same as before.

export function composeExecutiveNarrative(report: ReportData): string[] {
  const p = report.property_snapshot as ReportData["property_snapshot"] & {
    adu_status?: string | null;
    solar_status?: string | null;
    fema_flood_zone?: string | null;
    hazard_zone_summary?: string | null;
    named_sellers?: string | null;
    named_listing_team?: string | null;
    disclosure_prep_service?: string | null;
    package_date?: string | null;
  };
  const cs = deriveCostSummary(report);
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
  let para1 = `This report reviews the seller's disclosure package for a ${typeLabel} ${yearPart}${sqftPart}${bedBath}${regionPart}${pricePart}${domPart}.`;
  // Weave in the named parties when extracted. Mirrors the Cowork
  // narrative which always names sellers + listing team + prep
  // service + package date in the executive summary.
  const partyBits: string[] = [];
  if (p?.disclosure_prep_service?.trim()) {
    partyBits.push(`prepared via ${p.disclosure_prep_service.trim()}`);
  }
  if (p?.named_listing_team?.trim()) {
    partyBits.push(`assembled by ${p.named_listing_team.trim()}`);
  }
  if (p?.package_date?.trim()) {
    partyBits.push(`dated ${p.package_date.trim()}`);
  }
  if (partyBits.length > 0) {
    para1 += ` The package was ${partyBits.join(", ")}.`;
  }
  if (p?.named_sellers?.trim()) {
    para1 += ` Sellers of record per the signed TDS and SPQ: ${p.named_sellers.trim()}.`;
  }
  para1 +=
    " Every finding below is grounded in the documents that were actually provided; this is not a substitute for licensed professional inspection, attorney review, or lender underwriting.";
  paragraphs.push(para1);

  // ── Paragraph 2: Findings synthesis with cost exposure ──
  const critCount = report.critical_findings?.length ?? 0;
  const modCount = report.moderate_findings?.length ?? 0;
  let findingsPara = "";
  if (critCount === 0 && modCount === 0) {
    findingsPara =
      "The package reveals no critical, high, or moderate findings that materially affect the buyer's decision, the disclosed condition is consistent with a well-maintained property.";
  } else if (critCount === 0) {
    findingsPara = `The package surfaces ${modCount} moderate item${modCount === 1 ? "" : "s"} reflecting typical aging-property maintenance, but no critical or high-severity findings. The work is bounded and routine.`;
  } else {
    // Cite the top THREE critical findings by title (was two);
    // matches the Cowork "Three key concerns" structure and gives
    // the buyer a meaningful preview before opening the section.
    const topCritical = (report.critical_findings ?? [])
      .slice(0, 3)
      .map((f) => f.title);
    findingsPara = `${critCount} critical or high-severity finding${critCount === 1 ? "" : "s"} require immediate attention before contingency removal.`;
    if (topCritical.length > 0) {
      const joined =
        topCritical.length === 1
          ? topCritical[0]
          : topCritical.length === 2
            ? `${topCritical[0]} and ${topCritical[1]}`
            : `${topCritical[0]}, ${topCritical[1]}, and ${topCritical[2]}`;
      findingsPara += ` The headline items are ${joined}.`;
    }
    if (modCount > 0) {
      findingsPara += ` ${modCount} additional moderate item${modCount === 1 ? "" : "s"} add to the work scope.`;
    }
  }
  if (cs?.grand_total && (cs.grand_total.low > 0 || cs.grand_total.high > 0)) {
    findingsPara += ` Total estimated repair exposure across all severities is ${formatCostRange(cs.grand_total)}, with the critical/high portion at ${formatCostRange(cs.critical_high_total)}.`;
  }
  paragraphs.push(findingsPara);

  // ── Paragraph 3: HOA + hazards + property-specific context ──
  const bottomParts: string[] = [];
  if (report.hoa?.applicable) {
    if ((report.hoa.concerns?.length ?? 0) > 0) {
      bottomParts.push(
        `The HOA review surfaced ${report.hoa.concerns.length} concern${report.hoa.concerns.length === 1 ? "" : "s"} worth confirming with the association directly before contingency removal.`,
      );
    } else {
      bottomParts.push(
        "The HOA review surfaced no material financial concerns.",
      );
    }
  } else if (p?.property_type) {
    bottomParts.push(
      "No HOA applies to this property, which eliminates association-driven assessment and dues risk.",
    );
  }
  // Hazard zones: prefer the analyzer's structured one-line summary
  // (populated by the prompt overhaul) when present; fall back to
  // a generic count-based summary for legacy reports.
  if (p?.hazard_zone_summary?.trim()) {
    bottomParts.push(`Natural hazard disclosures: ${p.hazard_zone_summary.trim()}.`);
  } else {
    const hazardCount = report.environmental?.hazards?.length ?? 0;
    if (hazardCount > 0) {
      bottomParts.push(
        `Natural hazard disclosures include ${hazardCount} zone determination${hazardCount === 1 ? "" : "s"} that may affect insurance availability and lender requirements.`,
      );
    }
  }
  // ADU and solar are top-of-mind items for CA condo + SFR buyers;
  // mention them in the executive summary when present so the
  // buyer doesn't have to scroll to the property snapshot to find
  // them.
  if (p?.adu_status?.trim()) {
    bottomParts.push(`ADU status: ${p.adu_status.trim()}.`);
  }
  if (p?.solar_status?.trim()) {
    bottomParts.push(`Solar: ${p.solar_status.trim()}.`);
  }
  if (bottomParts.length > 0) {
    paragraphs.push(bottomParts.join(" "));
  }

  // ── Paragraph 4 (final): Bottom line ──
  const ratingSummary = report.overall_rating?.summary?.trim() ?? "";
  let bottomLine = `Bottom line: this is a "${ratingLabel}" property.`;
  if (ratingSummary) {
    bottomLine += ` ${ratingSummary}`;
  }
  // Append a negotiation-posture line based on findings count. Mirrors
  // Cowork's "Bottom line" paragraph which always pairs the rating
  // with a concrete read of where the buyer stands.
  if (critCount >= 3) {
    bottomLine += ` The volume of critical items creates leverage for a price concession or seller credit, but each must be independently verified before contingency removal.`;
  } else if (critCount >= 1) {
    bottomLine += ` The disclosed package supports a price-and-terms negotiation around the documented critical items, with fresh inspections to confirm before contingency removal.`;
  } else if (modCount >= 3) {
    bottomLine += ` The work scope is bounded and the buyer can proceed through standard contingencies; a modest credit may cover the moderate items if the seller is willing.`;
  } else {
    bottomLine += ` The buyer can proceed through standard contingencies with high confidence in the disclosure package.`;
  }
  paragraphs.push(bottomLine);

  return paragraphs;
}

// ---- Local formatters (kept inline so this module has no React-PDF
// or dashboard-page dependencies, it's pure logic that can be
// consumed from either render surface). ----

function formatUSD(n: number | null | undefined): string {
  if (n == null) return ",";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatCostRange(r: CostRange | null | undefined): string {
  if (!r) return ",";
  const low = Number(r.low) || 0;
  const high = Number(r.high) || 0;
  if (low === high) return formatUSD(low);
  // Prefer "X to Y" over the en-dash form per the founder's
  // strong preference (AGENTS.md: "'3 to 5' is preferred even
  // there" for numeric ranges).
  return `${formatUSD(low)} to ${formatUSD(high)}`;
}
