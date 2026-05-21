import type { ReportData } from "@/lib/anthropic/schema";

// Shared "top 3 strengths / top 3 concerns" picker used by:
//   - /dashboard/reports/[id] (the agent summary panels)
//   - /api/reports/[id]/email/draft (the seeded email body)
//
// Living in one place keeps the agent's dashboard view and the email
// they send to the client perfectly aligned — if they edit nothing
// before sending, the client sees exactly the bullets the agent saw.

export function composeAgentStrengthsAndConcerns(report: ReportData): {
  strengths: string[];
  concerns: string[];
} {
  const critCount = report.critical_findings?.length ?? 0;
  const modCount = report.moderate_findings?.length ?? 0;
  const cosmCount = report.cosmetic_findings?.length ?? 0;
  const missingCount = report.document_inventory?.documents_missing?.length ?? 0;
  const grand = report.cost_summary?.grand_total;

  // -------- Concerns (always lead with critical findings) --------
  const concerns: string[] = [];
  for (const f of report.critical_findings ?? []) {
    if (concerns.length >= 3) break;
    concerns.push(f.title);
  }
  if (concerns.length < 3 && missingCount > 0) {
    concerns.push(
      `${missingCount} standard CA disclosure${missingCount === 1 ? "" : "s"} missing from the package`,
    );
  }
  for (const f of report.moderate_findings ?? []) {
    if (concerns.length >= 3) break;
    concerns.push(f.title);
  }
  if (concerns.length === 0) {
    concerns.push("No major concerns surfaced in the documents reviewed");
  }
  while (concerns.length < 3) {
    concerns.push("Confirm contingency timelines align with lender milestones");
  }

  // -------- Strengths --------
  const strengths: string[] = [];
  if (critCount === 0) {
    strengths.push(
      "No critical or high-priority findings in the disclosure package",
    );
  }
  if (missingCount === 0) {
    strengths.push("Standard CA disclosure package appears complete");
  }
  if (cosmCount > 0 && critCount === 0 && modCount === 0) {
    strengths.push("All findings are cosmetic and addressable post-close");
  }
  if (grand && grand.high > 0 && grand.high < 5000) {
    strengths.push("Total cost exposure is modest relative to typical deals");
  }
  if (report.hoa?.applicable && (report.hoa.concerns?.length ?? 0) === 0) {
    strengths.push("HOA review surfaced no material concerns");
  }
  if (!report.hoa?.applicable) {
    strengths.push("No HOA — eliminates association financial risk");
  }
  if (strengths.length === 0) {
    strengths.push("Disclosure documents provided for review");
  }
  while (strengths.length < 3) {
    strengths.push("Standard inspection contingency should suffice");
  }

  return { strengths: strengths.slice(0, 3), concerns: concerns.slice(0, 3) };
}
