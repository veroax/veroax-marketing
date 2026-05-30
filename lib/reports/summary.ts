import type { ReportData, Finding } from "@/lib/anthropic/schema";
import { deriveCostSummary } from "./cost-summary";

// Shared "top 3 strengths / top 3 concerns" picker used by:
//   - /dashboard/reports/[id] (the agent summary panels)
//   - /api/reports/[id]/email/draft (the seeded email body)
//   - /admin/reports/[id] (AdminReportContent block)
//
// Living in one place keeps the agent's dashboard view, the admin
// view, and the email they send to the client perfectly aligned,
// if they edit nothing before sending, the client sees exactly
// the bullets the agent saw.

// Each pick carries the bullet text plus optional metadata. The
// dashboard shows the badge when set; the email path just .map(c
// => c.text)s.
export type SummaryItem = {
  text: string;
  // Only set for concerns sourced from a finding with a triggered_rule.
  // Surfaces in the dashboard agent summary so the agent can sanity-
  // check WHY something is critical.
  triggeredRule?: string | null;
  // Title of the underlying finding (when the item is sourced from
  // one) so the dashboard can render a "view details" link that
  // scrolls to the matching finding card. Null for items derived
  // from structured non-finding data (hazard zones, package
  // completeness, etc.).
  findingTitle?: string | null;
};

// Shared slugifier used by BOTH the summary panel's link icons and the
// CriticalFindingsView card IDs. Keeping it here (next to the place
// findingTitle is set) guarantees the link target and the link source
// can never drift out of sync, click the icon, land on the card.
//
// Strips combining diacritics, collapses non-alphanumerics into
// hyphens, lowercases. Truncated at 80 chars so unusually long
// titles still produce a stable, readable hash fragment.
export function slugifyFindingTitle(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function composeAgentStrengthsAndConcerns(report: ReportData): {
  strengths: SummaryItem[];
  concerns: SummaryItem[];
} {
  const critFindings = (report.critical_findings ?? []) as Finding[];
  const modFindings = (report.moderate_findings ?? []) as Finding[];
  const critCount = critFindings.length;
  const modCount = modFindings.length;
  const cosmCount = report.cosmetic_findings?.length ?? 0;
  const missingCount =
    report.document_inventory?.documents_missing?.length ?? 0;
  const grand = deriveCostSummary(report).grand_total;
  // The analyzer surfaces per-zone entries (flood, fault, FHSZ,
  // etc.) under report.environmental.hazards with a severity tag,
  // earlier drafts had this at the top level which left the
  // "outside the high-severity natural-hazard zones" strength
  // silently disabled.
  const hazardItems = report.environmental?.hazards ?? [];

  // -------- Concerns -----------------------------------------------
  //
  // Priority order, designed so the top 3 are what a buyer's agent
  // would actually raise in conversation:
  //
  //   1. Critical findings the BUYER pays for (cost_responsibility
  //      = 'owner' or 'shared' or null/missing). Sorted by the
  //      analyzer's original ordering (already severity-ranked).
  //   2. Critical findings the HOA pays for. These matter to the
  //      buyer (special-assessment risk, building reputation) but
  //      should not crowd out unit-relevant items.
  //   3. Moderate findings the buyer pays for, when there's still
  //      room.
  //   4. The "N standard CA disclosures missing" filler, but ONLY
  //      when N is 2+. A single missing item with no other concerns
  //      is usually not worth a top-3 slot.
  //
  // Dedupe by title (lowercased + trimmed) so a critical and a
  // moderate finding with the same title don't both surface.
  const concerns: SummaryItem[] = [];
  const seenConcernTitles = new Set<string>();
  const pushConcern = (item: SummaryItem) => {
    const key = item.text.trim().toLowerCase();
    if (seenConcernTitles.has(key)) return;
    seenConcernTitles.add(key);
    concerns.push(item);
  };
  const isBuyerPaying = (f: Finding) =>
    f.cost_responsibility !== "hoa";

  // 1: Critical owner/shared findings.
  for (const f of critFindings.filter(isBuyerPaying)) {
    if (concerns.length >= 3) break;
    pushConcern({
      text: f.title,
      triggeredRule: f.triggered_rule ?? null,
      findingTitle: f.title,
    });
  }
  // 2: Critical HOA-paid findings.
  for (const f of critFindings.filter((f) => f.cost_responsibility === "hoa")) {
    if (concerns.length >= 3) break;
    pushConcern({
      text: f.title,
      triggeredRule: f.triggered_rule ?? null,
      findingTitle: f.title,
    });
  }
  // 3: Moderate owner/shared findings.
  for (const f of modFindings.filter(isBuyerPaying)) {
    if (concerns.length >= 3) break;
    pushConcern({
      text: f.title,
      triggeredRule: f.triggered_rule ?? null,
      findingTitle: f.title,
    });
  }
  // 4: Missing disclosures, but only when meaningfully many.
  if (concerns.length < 3 && missingCount >= 2) {
    pushConcern({
      text: `${missingCount} standard CA disclosures missing from the package`,
    });
  }
  // Final fallback when nothing surfaced (genuinely clean package).
  if (concerns.length === 0) {
    concerns.push({
      text: "No major concerns surfaced in the documents reviewed",
    });
  }
  // No more boilerplate filler. If the package legitimately has
  // only one real concern, we show one. Better than padding with
  // "Standard contingency timelines should suffice" three times.

  // -------- Strengths ----------------------------------------------
  //
  // Source from the actual structured signals in the report, not
  // from generic boilerplate. Each candidate is added only when its
  // underlying condition is true, and the dedupe set prevents the
  // same text from appearing twice (previously a bug where the
  // boilerplate filler ran 3 times in a row produced "Standard
  // inspection contingency should suffice" three times stacked).
  const strengths: SummaryItem[] = [];
  const seenStrengthTexts = new Set<string>();
  const pushStrength = (text: string) => {
    const key = text.trim().toLowerCase();
    if (seenStrengthTexts.has(key)) return;
    if (strengths.length >= 3) return;
    seenStrengthTexts.add(key);
    strengths.push({ text });
  };

  // 1: Clean finding profile.
  if (critCount === 0) {
    pushStrength(
      "No critical or high-priority findings in the disclosure package",
    );
  } else if (critFindings.every((f) => !isBuyerPaying(f))) {
    // Every critical finding is HOA-paid, so the BUYER's direct
    // out-of-pocket exposure on critical items is zero.
    pushStrength(
      "All critical findings are HOA-paid, no direct out-of-pocket exposure for the buyer",
    );
  }

  // 2: Package completeness.
  if (missingCount === 0) {
    pushStrength("Standard CA disclosure package appears complete");
  }

  // 3: Environmental / hazard zones from the structured
  // environmental_hazards array. The analyzer populates this with
  // one entry per zone (flood, fault, FHSZ, etc.) with a severity
  // tag. When every zone is "info" / "low" severity, the property
  // is genuinely outside the worst-case zones and worth highlighting.
  const hasMaterialHazard = hazardItems.some(
    (h) => h.severity === "critical" || h.severity === "high",
  );
  if (hazardItems.length > 0 && !hasMaterialHazard) {
    pushStrength(
      "Property is outside the high-severity natural-hazard zones (no flood / fault / FHSZ flags)",
    );
  }

  // 4: HOA signal (only when applicable).
  if (
    report.hoa?.applicable &&
    (report.hoa.concerns?.length ?? 0) === 0
  ) {
    pushStrength("HOA review surfaced no material concerns");
  }
  if (!report.hoa?.applicable) {
    pushStrength("No HOA, eliminates association financial risk");
  }

  // 5: Cost summary signal.
  if (grand && grand.high > 0 && grand.high < 5000) {
    pushStrength("Total cost exposure is modest relative to typical deals");
  }

  // 6: All-cosmetic profile.
  if (cosmCount > 0 && critCount === 0 && modCount === 0) {
    pushStrength("All findings are cosmetic and addressable post-close");
  }

  // 7: Market context strength when the analyzer surfaced one.
  // The market_context.summary often contains a defensible "well-
  // located / sub-segment-priced" sentence; if so we pick the first
  // signal-ish substring.
  const mcSummary = report.market_context?.summary;
  if (
    strengths.length < 3 &&
    typeof mcSummary === "string" &&
    mcSummary.trim().length > 0
  ) {
    const firstSentence = mcSummary
      .split(/(?<=\.)\s+/)[0]
      ?.trim();
    if (firstSentence && firstSentence.length > 20) {
      pushStrength(firstSentence);
    }
  }

  // 8: Title vesting signal (clean title, standard mortgage only).
  const tv = report.title_vesting;
  if (
    strengths.length < 3 &&
    tv &&
    (tv.liens_summary ?? "").toLowerCase().includes("mortgage") &&
    !(tv.liens_summary ?? "").toLowerCase().includes("pace") &&
    !(tv.liens_summary ?? "").toLowerCase().includes("hero") &&
    !(tv.liens_summary ?? "").toLowerCase().includes("mello")
  ) {
    pushStrength(
      "Title is clean: standard mortgage only, no PACE/HERO lien, no Mello-Roos",
    );
  }

  // Final fallback: a single honest line, NOT padded. If we found
  // only one real strength, show one. Three forced boilerplate
  // strengths read as filler and undermine trust in the rest of
  // the report.
  if (strengths.length === 0) {
    strengths.push({ text: "Disclosure documents provided for review" });
  }

  return { strengths, concerns };
}
