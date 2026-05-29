import type { ReportData, Finding } from "@/lib/anthropic/schema";
import { slugifyFindingTitle } from "@/lib/reports/summary";

// Run-to-run variance computation across multiple ReportData
// snapshots of the same disclosure package. Used by the admin
// regression harness (/admin/regressions) to surface whether the
// analyzer is producing materially different outputs across
// re-runs of the same input.
//
// "Materially different" is operationally defined as:
//   - A finding appears in one run but not another (set delta).
//   - A finding's severity changes between runs.
//   - A finding's cost_estimate range shifts by more than 30% on
//     either end.
//
// Each of the above contributes to a 0-1 variance score where
// 0.0 = identical and 1.0 = entirely disjoint findings. The
// score is a Jaccard distance over finding slugs (1 minus the
// intersection-over-union), so it has a familiar shape: two
// identical reports score 0; two reports sharing half their
// findings score ~0.33; two reports with no overlap score 1.

export type FindingComparison = {
  // Stable identifier (slug of finding.title) used for matching
  // across runs.
  slug: string;
  // Representative title (from the most recent run that surfaced
  // this finding) so the admin UI can show a human-readable name.
  title: string;
  // Per-run state: did the finding appear, and at what severity /
  // cost? null when the finding was not surfaced in that run.
  per_run: Array<{
    surfaced: boolean;
    severity: string | null;
    cost_low: number | null;
    cost_high: number | null;
    quote_match_failed: boolean | null;
  }>;
  // Convenience flags computed across per_run.
  always_surfaced: boolean;
  severity_changed: boolean;
  cost_range_shifted: boolean;
};

export type RunSnapshot = {
  // Human-readable label for this run, e.g., "v1 (Mar 12)" or
  // "current". Surfaced as the column header on the variance
  // matrix.
  label: string;
  // The actual report data for this run.
  report: ReportData;
};

export type VarianceReport = {
  run_count: number;
  // Jaccard distance over the union of all critical-finding slugs.
  // 0 = identical critical finding sets; 1 = disjoint.
  variance_score: number;
  // Sub-scores for diagnosis.
  total_unique_findings: number;
  intersection_count: number;
  union_count: number;
  // Count of findings whose severity changed across runs (excludes
  // findings that didn't appear in every run).
  severity_flip_count: number;
  // Count of findings whose cost range shifted by >30% across runs.
  cost_shift_count: number;
  // Per-finding breakdown.
  findings: FindingComparison[];
};

const COST_SHIFT_THRESHOLD = 0.3;

function severityOf(f: Finding | null): string | null {
  if (!f) return null;
  return String(f.severity ?? "").toLowerCase() || null;
}

function rangesShift(
  a: { low: number | null; high: number | null },
  b: { low: number | null; high: number | null },
): boolean {
  // Only meaningful when both ranges are populated. A missing
  // range on one side doesn't count as a shift, that's a
  // surface-different signal (already captured elsewhere).
  if (a.low == null || a.high == null || b.low == null || b.high == null) {
    return false;
  }
  const lowShift = a.low === 0 && b.low === 0 ? 0 : Math.abs(a.low - b.low) / Math.max(a.low, b.low, 1);
  const highShift = a.high === 0 && b.high === 0 ? 0 : Math.abs(a.high - b.high) / Math.max(a.high, b.high, 1);
  return lowShift > COST_SHIFT_THRESHOLD || highShift > COST_SHIFT_THRESHOLD;
}

export function computeVariance(runs: RunSnapshot[]): VarianceReport {
  if (runs.length < 2) {
    return {
      run_count: runs.length,
      variance_score: 0,
      total_unique_findings: 0,
      intersection_count: 0,
      union_count: 0,
      severity_flip_count: 0,
      cost_shift_count: 0,
      findings: [],
    };
  }

  // Group critical findings by slug across all runs. (We compare
  // critical findings specifically because those are the ones
  // driving the agent narrative; moderate findings flip in and
  // out frequently and aren't the source of the founder's
  // complaint.)
  const slugToFindings = new Map<string, Array<Finding | null>>();
  const slugToTitle = new Map<string, string>();

  runs.forEach((snapshot, runIndex) => {
    const findings = (snapshot.report.critical_findings ?? []) as Finding[];
    for (const f of findings) {
      const slug = slugifyFindingTitle(f.title);
      if (!slug) continue;
      slugToTitle.set(slug, f.title);
      if (!slugToFindings.has(slug)) {
        slugToFindings.set(
          slug,
          Array.from({ length: runs.length }, () => null),
        );
      }
      const arr = slugToFindings.get(slug)!;
      arr[runIndex] = f;
    }
  });

  let intersectionCount = 0;
  let severityFlips = 0;
  let costShifts = 0;
  const findings: FindingComparison[] = [];

  for (const [slug, arr] of slugToFindings.entries()) {
    const allRuns = arr.every((f) => f !== null);
    if (allRuns) intersectionCount += 1;

    // Detect severity flip across the runs in which the finding
    // appeared. A finding that only appears in some runs is NOT
    // a severity flip; that's a surface-different signal.
    const severities = arr.map(severityOf).filter((s): s is string => s !== null);
    const uniqueSev = new Set(severities);
    const severityChanged = allRuns && uniqueSev.size > 1;
    if (severityChanged) severityFlips += 1;

    // Detect cost-range shift. Compare every consecutive pair
    // of runs where both have the finding.
    let costRangeShifted = false;
    for (let i = 1; i < arr.length; i += 1) {
      const a = arr[i - 1];
      const b = arr[i];
      if (!a || !b) continue;
      const shifted = rangesShift(
        { low: a.cost_estimate?.low ?? null, high: a.cost_estimate?.high ?? null },
        { low: b.cost_estimate?.low ?? null, high: b.cost_estimate?.high ?? null },
      );
      if (shifted) {
        costRangeShifted = true;
        break;
      }
    }
    if (costRangeShifted) costShifts += 1;

    findings.push({
      slug,
      title: slugToTitle.get(slug) ?? slug,
      per_run: arr.map((f) => ({
        surfaced: f !== null,
        severity: f?.severity ?? null,
        cost_low: f?.cost_estimate?.low ?? null,
        cost_high: f?.cost_estimate?.high ?? null,
        quote_match_failed: f?.quote_match_failed ?? null,
      })),
      always_surfaced: allRuns,
      severity_changed: severityChanged,
      cost_range_shifted: costRangeShifted,
    });
  }

  const unionCount = slugToFindings.size;
  // Jaccard distance: 1 minus intersection-over-union. When all
  // runs surface the same set of critical findings, intersection
  // equals union and the score is 0. When the runs share nothing,
  // intersection is 0 and the score is 1.
  const varianceScore =
    unionCount === 0 ? 0 : 1 - intersectionCount / unionCount;

  return {
    run_count: runs.length,
    variance_score: varianceScore,
    total_unique_findings: unionCount,
    intersection_count: intersectionCount,
    union_count: unionCount,
    severity_flip_count: severityFlips,
    cost_shift_count: costShifts,
    findings,
  };
}
