/**
 * Derive cost_summary from the finding lists in a ReportData at render
 * time, so the totals + line items stay in sync with whatever findings
 * are currently displayed.
 *
 * Why this exists. The synthesis pass writes a cost_summary into
 * report_data, but findings can be edited or removed post-synthesis
 * (admin cleanup, future user-visible edits). When that happens the
 * stored cost_summary drifts and the report shows totals for findings
 * the reader can no longer see. Saint Remi #1 is the concrete case:
 * the deed-of-trust finding was removed from critical_findings, but
 * the stored cost_summary still listed it. Renderers should treat
 * findings as the source of truth and re-derive cost_summary from
 * them every time the report is displayed.
 *
 * Keep this file pure: takes a ReportData, returns a CostSummary.
 * No I/O, no side effects, no Date.now() (matters when the same
 * helper is called inside a workflow that needs determinism).
 */

import type { Finding, ReportData, CostRange } from "../anthropic/schema";

type CostSummary = NonNullable<ReportData["cost_summary"]>;

/**
 * Re-derive cost_summary from the report's current findings.
 *
 * Mirrors the synthesis-time logic in synthesizeReportInCode so a
 * fresh report and a re-derived one produce the same shape.
 *
 * Buyer-pays subset: cost_responsibility null/undefined/owner/shared.
 * HOA-paid subset: cost_responsibility === "hoa", reported as an
 * informational line, NOT rolled into the buyer's totals.
 */
export function deriveCostSummary(report: ReportData): CostSummary {
  const isBuyerPays = (f: Finding) => f.cost_responsibility !== "hoa";
  const validRange = (c: CostRange | null | undefined): c is CostRange =>
    c != null && Number.isFinite(Number(c.low)) && Number.isFinite(Number(c.high));

  const criticalFindings = report.critical_findings ?? [];
  const moderateFindings = report.moderate_findings ?? [];

  const buyerCritHighCosts = criticalFindings
    .filter(isBuyerPays)
    .map((f) => f.cost_estimate)
    .filter(validRange);
  const buyerModerateCosts = moderateFindings
    .filter(isBuyerPays)
    .map((f) => f.cost_estimate)
    .filter(validRange);

  const critHighTotal = sum(buyerCritHighCosts);
  const moderateTotal = sum(buyerModerateCosts);
  const grandTotal: CostRange = {
    low: critHighTotal.low + moderateTotal.low,
    high: critHighTotal.high + moderateTotal.high,
  };

  const byCategory = new Map<string, Array<{ label: string; cost: CostRange }>>();
  for (const f of criticalFindings) {
    if (!validRange(f.cost_estimate)) continue;
    const category = isBuyerPays(f)
      ? "Critical & high-priority repairs (buyer)"
      : "HOA-paid capital projects (informational)";
    pushLine(byCategory, category, f.title, f.cost_estimate);
  }
  for (const f of moderateFindings) {
    if (!validRange(f.cost_estimate)) continue;
    const category = isBuyerPays(f)
      ? "Moderate repairs (1-5 year horizon, buyer)"
      : "HOA-paid capital projects (informational)";
    pushLine(byCategory, category, f.title, f.cost_estimate);
  }

  const lineItems = Array.from(byCategory.entries()).map(([category, items]) => ({
    category,
    items,
  }));

  return {
    critical_high_total: critHighTotal,
    moderate_total: moderateTotal,
    grand_total: grandTotal,
    line_items: lineItems,
  };
}

function sum(ranges: CostRange[]): CostRange {
  let low = 0;
  let high = 0;
  for (const r of ranges) {
    low += Number(r.low) || 0;
    high += Number(r.high) || 0;
  }
  return { low, high };
}

function pushLine(
  bucket: Map<string, Array<{ label: string; cost: CostRange }>>,
  category: string,
  label: string,
  cost: CostRange,
): void {
  const items = bucket.get(category) ?? [];
  items.push({ label, cost });
  bucket.set(category, items);
}

/**
 * Returns a shallow-cloned ReportData with cost_summary swapped for
 * a freshly-derived one. Convenient for renderers that pass the full
 * report down to many children.
 *
 * Reserved for the case where callers want a normalized report object
 * to pass through nested components without each child re-deriving.
 */
export function withDerivedCostSummary(report: ReportData): ReportData {
  return { ...report, cost_summary: deriveCostSummary(report) };
}
