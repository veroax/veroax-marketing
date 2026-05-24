// System health view. Three buckets that demand admin attention:
//
//   1. Reports stuck in "analyzing" past the function timeout window.
//      The analyze route has maxDuration=800s; if a report's
//      analysis_started_at is more than ~15 minutes old and status is
//      still "analyzing", the Vercel function almost certainly died
//      silently. This view surfaces those so they can be restarted.
//
//   2. Recent failed reports (last 7 days) with the failure_reason
//      visible inline. Pattern-spotting helps catch systemic issues
//      (a particular PDF format that keeps blowing the analyzer, a
//      Claude rate-limit recurring, etc.).
//
//   3. Slowest recent successful analyses (>5 minutes). If healthy
//      runs creep up in duration, the analyzer needs attention before
//      we start hitting the timeout en masse.
//
// All reads via the service-role client.

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const metadata = {
  title: "System health, Admin",
};

const STUCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const SLOW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

type Row = {
  id: string;
  user_id: string;
  status: string;
  property_address: string | null;
  client_name: string | null;
  report_name: string | null;
  created_at: string;
  analysis_started_at: string | null;
  analysis_completed_at: string | null;
  failure_reason: string | null;
};

type ProfileMini = {
  id: string;
  email: string;
  full_name: string | null;
};

export default async function AdminHealthPage() {
  const admin = createServiceRoleClient();

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Stuck-analyzing candidates: status=analyzing AND analysis_started_at
  // older than the threshold. We fetch a moderate window and filter
  // in code because the threshold is "more than 15 minutes ago" which
  // we can express directly as analysis_started_at <= (now - 15min).
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();
  const [
    stuckRes,
    failedRes,
    slowRes,
    failed24hCountRes,
    success24hCountRes,
  ] = await Promise.all([
    admin
      .from("reports")
      .select(
        "id, user_id, status, property_address, client_name, report_name, created_at, analysis_started_at, analysis_completed_at, failure_reason",
      )
      .eq("status", "analyzing")
      .lte("analysis_started_at", stuckCutoff)
      .order("analysis_started_at", { ascending: true })
      .limit(50),
    admin
      .from("reports")
      .select(
        "id, user_id, status, property_address, client_name, report_name, created_at, analysis_started_at, analysis_completed_at, failure_reason",
      )
      .eq("status", "failed")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("reports")
      .select(
        "id, user_id, status, property_address, client_name, report_name, created_at, analysis_started_at, analysis_completed_at, failure_reason",
      )
      .in("status", ["qa_pending", "qa_approved", "delivered"])
      .gte("created_at", since7d)
      .not("analysis_started_at", "is", null)
      .not("analysis_completed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(200),
    // Headline count: failures in the last 24 hours.
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", since24h),
    // Throughput proxy: successful runs in the last 24h. Tells us
    // if the pipeline is moving volume.
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["qa_pending", "qa_approved", "delivered"])
      .gte("analysis_completed_at", since24h),
  ]);
  const failed24h = failed24hCountRes.count ?? 0;
  const success24h = success24hCountRes.count ?? 0;

  const stuck = (stuckRes.data ?? []) as Row[];
  const failed = (failedRes.data ?? []) as Row[];
  // Filter slow client-side by computed duration since we don't have
  // a duration column to sort on.
  const slowCandidates = (slowRes.data ?? []) as Row[];
  const successfulWithDuration = slowCandidates
    .map((r) => ({
      ...r,
      durationMs:
        r.analysis_started_at && r.analysis_completed_at
          ? new Date(r.analysis_completed_at).getTime() -
            new Date(r.analysis_started_at).getTime()
          : 0,
    }))
    .filter((r) => r.durationMs > 0);

  const slow = successfulWithDuration
    .filter((r) => r.durationMs >= SLOW_THRESHOLD_MS)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 20);

  // Performance metrics over the same 7-day successful-run window.
  // avg = mean of all completed durations; p95 = the long-tail
  // signal (95th percentile). When p95 climbs toward 800s we are
  // one bad package away from regular timeouts.
  const durations = successfulWithDuration.map((r) => r.durationMs);
  const avgMs =
    durations.length > 0
      ? durations.reduce((acc, d) => acc + d, 0) / durations.length
      : 0;
  const sortedDur = [...durations].sort((a, b) => a - b);
  const p95Ms =
    sortedDur.length > 0
      ? sortedDur[Math.min(sortedDur.length - 1, Math.floor(sortedDur.length * 0.95))]
      : 0;
  const successWindowCount = successfulWithDuration.length;
  const errorRate7d =
    successWindowCount + failed.length > 0
      ? failed.length / (successWindowCount + failed.length)
      : 0;

  const activeProblems = stuck.length + failed24h;

  // Owner lookup for everything visible.
  const userIds = Array.from(
    new Set(
      [...stuck, ...failed, ...slow]
        .map((r) => r.user_id)
        .filter(Boolean),
    ),
  );
  const { data: profilesData } =
    userIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds)
      : { data: [] as ProfileMini[] };
  const profileMap = new Map<string, ProfileMini>();
  for (const p of (profilesData ?? []) as ProfileMini[]) {
    profileMap.set(p.id, p);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System health</h1>
        <p className="text-sm text-gray-500 mt-1">
          At-a-glance pipeline health up top, then the detail. Tap any
          card to jump to the matching section.
        </p>
      </div>

      {/* Quick-status cards. Tap to scroll to the section that
          shows the underlying rows. Active problems is the single
          "is anything broken right now?" number so a bad shift is
          obvious without reading the rest of the page. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatusCard
          label="Active problems"
          value={activeProblems}
          sublabel={
            activeProblems === 0
              ? "all clear"
              : `${stuck.length} stuck + ${failed24h} failed (24h)`
          }
          tone={activeProblems > 0 ? "red" : "green"}
          href="#stuck"
        />
        <StatusCard
          label="Stuck analyzing"
          value={stuck.length}
          sublabel={
            stuck.length === 0
              ? "no live stalls"
              : `oldest ${formatDuration(
                  stuck[0].analysis_started_at
                    ? Date.now() -
                        new Date(stuck[0].analysis_started_at).getTime()
                    : 0,
                )}`
          }
          tone={stuck.length > 0 ? "red" : "green"}
          href="#stuck"
        />
        <StatusCard
          label="Failed (24h)"
          value={failed24h}
          sublabel={`${failed.length} in last 7d`}
          tone={failed24h > 0 ? "amber" : failed.length > 0 ? "muted" : "green"}
          href="#failed"
        />
        <StatusCard
          label="Throughput (24h)"
          value={success24h}
          sublabel={`${successWindowCount} completed (7d)`}
          tone="muted"
        />
        <StatusCard
          label="Avg run (7d)"
          value={successWindowCount > 0 ? formatDuration(avgMs) : "—"}
          sublabel={
            successWindowCount > 0
              ? `${successWindowCount} sample${successWindowCount === 1 ? "" : "s"}`
              : "no data yet"
          }
          tone={avgMs > 300_000 ? "amber" : "muted"}
        />
        <StatusCard
          label="P95 run (7d)"
          value={successWindowCount > 0 ? formatDuration(p95Ms) : "—"}
          sublabel={
            p95Ms > 600_000
              ? "near 800s timeout"
              : p95Ms > 480_000
                ? "watch the tail"
                : `${(errorRate7d * 100).toFixed(1)}% error rate (7d)`
          }
          tone={p95Ms > 600_000 ? "red" : p95Ms > 480_000 ? "amber" : "muted"}
          href="#slow"
        />
      </div>

      {/* Stuck-analyzing */}
      <section id="stuck" className="bg-white rounded-2xl border border-slate-200 p-6 scroll-mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Stuck in analyzing
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Reports with status=analyzing whose run started more than
              15 minutes ago. Vercel function maxDuration is 800s, so
              anything past 15 minutes is almost certainly dead.
            </p>
          </div>
          <span
            className={`text-xs font-bold px-2 py-1 rounded ${stuck.length > 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}
          >
            {stuck.length} stuck
          </span>
        </div>
        {stuck.length === 0 ? (
          <p className="text-sm text-emerald-700 flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            No stuck analyses. The pipeline is clean.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {stuck.map((r) => {
              const owner = profileMap.get(r.user_id);
              const stuckSinceMs = r.analysis_started_at
                ? Date.now() - new Date(r.analysis_started_at).getTime()
                : 0;
              return (
                <li key={r.id} className="py-3 flex items-start gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 px-1.5 py-0.5 rounded shrink-0">
                    Stuck
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/reports/${r.id}`}
                      className="font-medium text-slate-900 hover:text-indigo-700 block truncate"
                    >
                      {r.property_address?.trim() ||
                        r.report_name?.trim() ||
                        "Untitled report"}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
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
                      Stuck for {formatDuration(stuckSinceMs)}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/reports/${r.id}`}
                    className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2 shrink-0"
                  >
                    Investigate →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Failed reports last 7d */}
      <section id="failed" className="bg-white rounded-2xl border border-slate-200 p-6 scroll-mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Failed analyses · last 7 days
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Look for patterns. Repeating Claude errors, a particular
              PDF format that keeps tripping the analyzer, etc.
            </p>
          </div>
          <span
            className={`text-xs font-bold px-2 py-1 rounded ${failed.length > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
          >
            {failed.length} failed
          </span>
        </div>
        {failed.length === 0 ? (
          <p className="text-sm text-emerald-700 flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            No failed analyses in the past 7 days.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {failed.map((r) => {
              const owner = profileMap.get(r.user_id);
              return (
                <li key={r.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 px-1.5 py-0.5 rounded shrink-0">
                      Failed
                    </span>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/dashboard/reports/${r.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700 block"
                      >
                        {r.property_address?.trim() ||
                          r.report_name?.trim() ||
                          "Untitled report"}
                      </Link>
                      <p className="text-xs text-slate-500 mt-0.5">
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
                        {new Date(r.created_at).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                  {r.failure_reason ? (
                    <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-1.5 mt-2 ml-12 break-words">
                      {r.failure_reason}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Slowest successful analyses */}
      <section id="slow" className="bg-white rounded-2xl border border-slate-200 p-6 scroll-mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Slowest successful runs · last 7 days
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Runs that took longer than 5 minutes to complete. If
              healthy runs creep upward, the timeout-at-800s ceiling
              gets closer to a real problem.
            </p>
          </div>
          <span className="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-800">
            {slow.length} slow
          </span>
        </div>
        {slow.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            All recent successful runs completed within 5 minutes. Good.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {slow.map((r) => {
              const owner = profileMap.get(r.user_id);
              return (
                <li key={r.id} className="py-3 flex items-start gap-3">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider w-16 text-center px-1.5 py-0.5 rounded shrink-0 ${r.durationMs > 600_000 ? "bg-red-100 text-red-800" : r.durationMs > 480_000 ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}
                  >
                    {formatDuration(r.durationMs)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/reports/${r.id}`}
                      className="font-medium text-slate-900 hover:text-indigo-700 block truncate"
                    >
                      {r.property_address?.trim() ||
                        r.report_name?.trim() ||
                        "Untitled report"}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
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
                      {" · Finished "}
                      {r.analysis_completed_at
                        ? new Date(
                            r.analysis_completed_at,
                          ).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "Never"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// Compact status card. Big number, small sublabel, color-coded
// border + value. Click-through via anchor link when href is set.
function StatusCard({
  label,
  value,
  sublabel,
  tone = "muted",
  href,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  tone?: "muted" | "amber" | "red" | "green";
  href?: string;
}) {
  const valueClass =
    tone === "red"
      ? "text-red-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "green"
          ? "text-emerald-700"
          : "text-slate-900";
  const borderClass =
    tone === "red"
      ? "border-red-300"
      : tone === "amber"
        ? "border-amber-300"
        : tone === "green"
          ? "border-emerald-300"
          : "border-slate-200";
  const card = (
    <div
      className={`bg-white rounded-2xl border ${borderClass} p-4 h-full flex flex-col justify-between transition-colors ${href ? "hover:border-slate-400 hover:shadow-sm cursor-pointer" : ""}`}
    >
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
        {label}
      </p>
      <p
        className={`text-3xl font-bold mt-1.5 mb-1 leading-none ${valueClass}`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sublabel ? (
        <p className="text-[11px] text-slate-500 leading-tight">{sublabel}</p>
      ) : null}
    </div>
  );
  return href ? (
    <a href={href} className="block">
      {card}
    </a>
  ) : (
    card
  );
}
