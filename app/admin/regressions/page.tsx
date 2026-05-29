import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeVariance, type RunSnapshot } from "@/lib/reports/variance";
import type { ReportData } from "@/lib/anthropic/schema";

// Regression-harness admin surface. Lists reports that have been
// re-run multiple times (via the admin rerun route at
// /api/admin/reports/[id]/rerun) and shows the Jaccard-distance
// variance score across runs. Use case: trigger a few re-runs of
// the same package via admin rerun, then come here to see whether
// the analyzer is producing materially different outputs run to
// run. High variance is a signal the focused-pass prompt needs
// tightening.
//
// Variance computation lives in lib/reports/variance.ts. Score
// of 0 means the runs surfaced identical critical-finding sets;
// 1 means entirely disjoint. Anything above ~0.3 deserves a look.

export const metadata = {
  title: "Regression harness, Admin",
};

type ReportRow = {
  id: string;
  user_id: string;
  property_address: string | null;
  report_name: string | null;
  status: string;
  analysis_run_count: number | null;
  report_data: ReportData | null;
  versions: Array<{
    version_number?: number;
    snapshotted_at?: string;
    report_data?: ReportData | null;
    regression_rerun?: boolean;
  }> | null;
};

export default async function RegressionsAdminPage() {
  const admin = createServiceRoleClient();

  // Pull reports that have at least one version snapshot AND a
  // current report_data. Re-run snapshots and document-added
  // snapshots are both in versions[]; we ONLY count regression-
  // rerun snapshots toward run-to-run variance because adding
  // documents legitimately changes findings.
  const { data } = await admin
    .from("reports")
    .select(
      "id, user_id, property_address, report_name, status, analysis_run_count, report_data, versions",
    )
    .eq("status", "qa_pending")
    .not("versions", "is", null)
    .order("last_updated_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as ReportRow[];

  type WithVariance = ReportRow & {
    rerunVersions: Array<{ snapshotted_at: string; report_data: ReportData }>;
    varianceScore: number;
    runCount: number;
    totalUniqueFindings: number;
    intersection: number;
    severityFlips: number;
    costShifts: number;
  };

  const withVariance: WithVariance[] = [];
  for (const r of rows) {
    const versions = Array.isArray(r.versions) ? r.versions : [];
    const rerunVersions = versions
      .filter(
        (v): v is {
          version_number?: number;
          snapshotted_at?: string;
          report_data?: ReportData | null;
          regression_rerun?: boolean;
        } => v != null && v.regression_rerun === true && v.report_data != null,
      )
      .map((v) => ({
        snapshotted_at: v.snapshotted_at ?? "",
        report_data: v.report_data as ReportData,
      }));
    if (rerunVersions.length === 0 || !r.report_data) continue;
    const snapshots: RunSnapshot[] = [
      ...rerunVersions.map((v, i) => ({
        label: `v${i + 1}`,
        report: v.report_data,
      })),
      { label: "current", report: r.report_data },
    ];
    const variance = computeVariance(snapshots);
    withVariance.push({
      ...r,
      rerunVersions,
      varianceScore: variance.variance_score,
      runCount: snapshots.length,
      totalUniqueFindings: variance.total_unique_findings,
      intersection: variance.intersection_count,
      severityFlips: variance.severity_flip_count,
      costShifts: variance.cost_shift_count,
    });
  }
  withVariance.sort((a, b) => b.varianceScore - a.varianceScore);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Regression harness
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Reports that have been re-run at least once via the admin
          rerun endpoint. Variance is Jaccard distance over the
          critical-finding slugs across runs, 0 means identical
          critical-finding sets, 1 means no overlap. Trigger a
          rerun from /admin/reports/&lt;id&gt; with the &ldquo;Re-run
          analysis&rdquo; button to add another data point.
        </p>
      </div>

      {withVariance.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-600">
          <p>
            No reports have been re-run yet. To collect a data point:
            open any completed report at /admin/reports/&lt;id&gt;,
            click &ldquo;Re-run analysis,&rdquo; wait for it to
            finish, then come back. Re-run two or three times for
            a meaningful variance number.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th className="text-left px-4 py-2">Report</th>
                <th className="text-right px-4 py-2">Runs</th>
                <th className="text-right px-4 py-2">Variance</th>
                <th className="text-right px-4 py-2">Findings (∩ / ∪)</th>
                <th className="text-right px-4 py-2">Sev. flips</th>
                <th className="text-right px-4 py-2">Cost shifts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {withVariance.map((r) => {
                const tone =
                  r.varianceScore < 0.1
                    ? "bg-emerald-100 text-emerald-800"
                    : r.varianceScore < 0.3
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800";
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/reports/${r.id}`}
                        className="text-indigo-700 hover:text-indigo-900 underline underline-offset-2 break-words"
                      >
                        {r.property_address ||
                          r.report_name ||
                          r.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {r.runCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold tabular-nums ${tone}`}
                      >
                        {r.varianceScore.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {r.intersection} / {r.totalUniqueFindings}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {r.severityFlips}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {r.costShifts}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500 italic max-w-3xl">
        Reading the score: green (&lt;0.10) is consistent enough to
        ship. Amber (0.10 to 0.30) means re-runs disagree on a
        material chunk of critical findings, look at sev. flips and
        cost shifts to see what's moving. Red (&gt;0.30) means the
        analyzer is producing materially different outputs from the
        same input, a prompt regression that should be investigated
        before shipping new analyzer changes.
      </p>
    </div>
  );
}
