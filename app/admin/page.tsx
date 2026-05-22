// Admin home — at-a-glance metrics for the founder. Server component;
// reads via the service-role client because every count here spans all
// users. Numbers are intentionally simple and parallel so the page
// loads fast and stays readable on a phone.

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin dashboard — Veroax",
};

// Count helper that just unwraps the count from a Supabase response.
// Each count uses {count: 'exact', head: true} so no rows transfer.
function asCount<T extends { count: number | null }>(r: T): number {
  return r.count ?? 0;
}

export default async function AdminHome() {
  const admin = createServiceRoleClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel queries so the page loads in the time of the slowest one.
  // Each .select with {count: 'exact', head: true} returns no rows —
  // just the count, fast for large tables.
  const [
    profilesAll,
    reportsAll,
    reports24h,
    reports7d,
    reportsAnalyzing,
    reportsFailed,
    reportsFailed7d,
    reportsArchived,
    profilesAdmin,
    recentAudit,
    recentReports,
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("reports").select("*", { count: "exact", head: true }),
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since24h),
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since7d),
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "analyzing"),
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", since7d),
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("archived", true),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_admin", true),
    admin
      .from("audit_log")
      .select("event_type, metadata, created_at, user_id, report_id")
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("reports")
      .select(
        "id, status, property_address, report_name, client_name, created_at, user_id",
      )
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const totalUsers = asCount(profilesAll);
  const totalReports = asCount(reportsAll);
  const reportsLast24h = asCount(reports24h);
  const reportsLast7d = asCount(reports7d);
  const analyzingNow = asCount(reportsAnalyzing);
  const failedAll = asCount(reportsFailed);
  const failedLast7d = asCount(reportsFailed7d);
  const archivedAll = asCount(reportsArchived);
  const admins = asCount(profilesAdmin);

  // Resolve owners for the recent-audit + recent-report sections in
  // one query so each row can show "by {name}" without N round trips.
  const visibleUserIds = Array.from(
    new Set(
      [
        ...((recentAudit.data ?? []).map(
          (e) => (e as { user_id: string | null }).user_id,
        )),
        ...((recentReports.data ?? []).map(
          (r) => (r as { user_id: string }).user_id,
        )),
      ].filter(Boolean) as string[],
    ),
  );
  const { data: ownerProfiles } =
    visibleUserIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", visibleUserIds)
      : { data: [] as Array<{ id: string; email: string; full_name: string | null }> };
  const profileMap = new Map<
    string,
    { id: string; email: string; full_name: string | null }
  >();
  for (const p of (ownerProfiles ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
  }>) {
    profileMap.set(p.id, p);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Admin dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          System-wide overview. All counts are across every account.
        </p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total users"
          value={totalUsers}
          sublabel={`${admins} admin${admins === 1 ? "" : "s"}`}
          href="/admin/users"
        />
        <MetricCard
          label="Total reports"
          value={totalReports}
          sublabel={`${archivedAll} archived`}
          href="/admin/reports"
        />
        <MetricCard
          label="Reports last 24h"
          value={reportsLast24h}
          sublabel={`${reportsLast7d} last 7d`}
          href={`/admin/reports?range=24h`}
        />
        <MetricCard
          label="Analyzing right now"
          value={analyzingNow}
          sublabel={analyzingNow > 0 ? "watch for stuck" : "queue empty"}
          tone={analyzingNow > 0 ? "amber" : "muted"}
          href="/admin/health"
        />
        <MetricCard
          label="Failed (all-time)"
          value={failedAll}
          sublabel={`${failedLast7d} in last 7d`}
          tone={failedLast7d > 0 ? "red" : "muted"}
          href="/admin/health"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent reports */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">
              Recent reports
            </h2>
            <Link
              href="/admin/reports"
              className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
            >
              View all →
            </Link>
          </div>
          {recentReports.data && recentReports.data.length > 0 ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {recentReports.data.map((r) => {
                const owner = profileMap.get(r.user_id);
                return (
                  <li key={r.id} className="py-2.5 flex items-start gap-3">
                    <StatusBadge status={r.status} />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/dashboard/reports/${r.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700 truncate block"
                      >
                        {r.property_address?.trim() ||
                          r.report_name?.trim() ||
                          "Untitled report"}
                      </Link>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {owner ? (
                          <Link
                            href={`/admin/users/${owner.id}`}
                            className="hover:text-indigo-700"
                          >
                            {owner.full_name?.trim() || owner.email}
                          </Link>
                        ) : (
                          <span className="italic">unknown owner</span>
                        )}
                        {" · "}
                        {timeAgo(r.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 italic">No reports yet.</p>
          )}
        </div>

        {/* Recent audit log */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">
              Recent activity
            </h2>
            <Link
              href="/admin/audit"
              className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
            >
              View full log →
            </Link>
          </div>
          {recentAudit.data && recentAudit.data.length > 0 ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {recentAudit.data.map((e, i) => {
                const owner = e.user_id ? profileMap.get(e.user_id) : null;
                return (
                  <li key={i} className="py-2.5">
                    <div className="flex items-start gap-2 flex-wrap">
                      <Link
                        href={`/admin/audit?event=${encodeURIComponent(e.event_type)}`}
                        className="text-[10px] font-mono uppercase tracking-wider bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded shrink-0 hover:bg-slate-200"
                      >
                        {e.event_type}
                      </Link>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {timeAgo(e.created_at)}
                      </span>
                      {owner ? (
                        <Link
                          href={`/admin/users/${owner.id}`}
                          className="text-[11px] text-indigo-700 hover:underline underline-offset-2"
                        >
                          {owner.full_name?.trim() || owner.email}
                        </Link>
                      ) : null}
                      {e.report_id ? (
                        <Link
                          href={`/dashboard/reports/${e.report_id}`}
                          className="text-[11px] text-indigo-700 hover:underline underline-offset-2 font-mono"
                        >
                          {(e.report_id as string).slice(0, 8)}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 italic">No activity yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sublabel,
  tone = "muted",
  href,
}: {
  label: string;
  value: number;
  sublabel?: string;
  tone?: "muted" | "amber" | "red" | "green";
  href?: string;
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "green"
          ? "text-emerald-700"
          : "text-slate-900";
  const card = (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-1.5">
        {label}
      </p>
      <p className={`text-2xl font-bold ${toneClass}`}>
        {value.toLocaleString()}
      </p>
      {sublabel ? (
        <p className="text-[11px] text-slate-500 mt-1">{sublabel}</p>
      ) : null}
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function StatusBadge({ status }: { status: string }) {
  // Same color logic as the dashboard list. qa_pending → "Ready" per
  // the rename done earlier in the project.
  const map: Record<string, { label: string; tone: string }> = {
    uploaded: { label: "Up", tone: "bg-slate-200 text-slate-700" },
    analyzing: { label: "An", tone: "bg-indigo-200 text-indigo-800" },
    qa_pending: { label: "Rd", tone: "bg-emerald-200 text-emerald-800" },
    qa_approved: { label: "Rd", tone: "bg-emerald-200 text-emerald-800" },
    delivered: { label: "De", tone: "bg-emerald-200 text-emerald-800" },
    failed: { label: "Fa", tone: "bg-red-200 text-red-800" },
  };
  const s = map[status] ?? { label: "?", tone: "bg-slate-200 text-slate-700" };
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider w-7 text-center px-1 py-0.5 rounded shrink-0 ${s.tone}`}
      title={status}
    >
      {s.label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
