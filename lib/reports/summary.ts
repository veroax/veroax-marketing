import type { ReportData } from "@/lib/anthropic/schema";

// Shared "top 3 strengths / top 3 concerns" picker used by:
//   - /dashboard/reports/[id] (the agent summary panels)
//   - /api/reports/[id]/email/draft (the seeded email body)
//
// Living in one place keeps the agent's dashboard view and the email
// they send to the client perfectly aligned, if they edit nothing
// before sending, the client sees exactly the bullets the agent saw.

// Each pick carries the bullet text plus optional metadata so the
// dashboard can show a small "Triggered rule: …" badge when a
// finding was upgraded to Critical by an always-CRITICAL rule.
// The email path doesn't need the badge, it just .map(c => c.text)s.
export type SummaryItem = {
  text: string;
  // Only set for concerns sourced from a finding with a triggered_rule.
  // Surfaces in the dashboard agent summary so the agent can sanity-
  // check WHY something is critical.
  triggeredRule?: string | null;
};

export function composeAgentStrengthsAndConcerns(report: ReportData): {
  strengths: SummaryItem[];
  concerns: SummaryItem[];
} {
  const critCount = report.critical_findings?.length ?? 0;
  const modCount = report.moderate_findings?.length ?? 0;
  const cosmCount = report.cosmetic_findings?.length ?? 0;
  const missingCount = report.document_inventory?.documents_missing?.length ?? 0;
  const grand = report.cost_summary?.grand_total;

  // -------- Concerns (always lead with critical findings) --------
  const concerns: SummaryItem[] = [];
  for (const f of report.critical_findings ?? []) {
    if (concerns.length >= 3) break;
    concerns.push({ text: f.title, triggeredRule: f.triggered_rule ?? null });
  }
  if (concerns.length < 3 && missingCount > 0) {
    concerns.push({
      text: `${missingCount} standard CA disclosure${missingCount === 1 ? "" : "s"} missing from the package`,
    });
  }
  for (const f of report.moderate_findings ?? []) {
    if (concerns.length >= 3) break;
    concerns.push({ text: f.title, triggeredRule: f.triggered_rule ?? null });
  }
  if (concerns.length === 0) {
    concerns.push({
      text: "No major concerns surfaced in the documents reviewed",
    });
  }
  while (concerns.length < 3) {
    concerns.push({
      text: "Confirm contingency timelines align with lender milestones",
    });
  }

  // -------- Strengths --------
  const strengths: SummaryItem[] = [];
  if (critCount === 0) {
    strengths.push({
      text: "No critical or high-priority findings in the disclosure package",
    });
  }
  if (missingCount === 0) {
    strengths.push({ text: "Standard CA disclosure package appears complete" });
  }
  if (cosmCount > 0 && critCount === 0 && modCount === 0) {
    strengths.push({
      text: "All findings are cosmetic and addressable post-close",
    });
  }
  if (grand && grand.high > 0 && grand.high < 5000) {
    strengths.push({
      text: "Total cost exposure is modest relative to typical deals",
    });
  }
  if (report.hoa?.applicable && (report.hoa.concerns?.length ?? 0) === 0) {
    strengths.push({ text: "HOA review surfaced no material concerns" });
  }
  if (!report.hoa?.applicable) {
    strengths.push({
      text: "No HOA, eliminates association financial risk",
    });
  }
  if (strengths.length === 0) {
    strengths.push({ text: "Disclosure documents provided for review" });
  }
  while (strengths.length < 3) {
    strengths.push({ text: "Standard inspection contingency should suffice" });
  }

  return { strengths: strengths.slice(0, 3), concerns: concerns.slice(0, 3) };
}
