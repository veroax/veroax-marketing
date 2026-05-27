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
    hourlyAllRes,
    lastAnthropicRes,
    lastStripeRes,
    lastResendRes,
    lastCronRes,
    syntheticRes,
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
    // For the sparkline: every report finished (success or failed)
    // in the last 24h, with status + completion timestamp so we can
    // bucket by hour and compute the error rate per bucket.
    admin
      .from("reports")
      .select("status, analysis_completed_at, created_at")
      .in("status", ["qa_pending", "qa_approved", "delivered", "failed"])
      .gte("created_at", since24h)
      .limit(2000),
    // Connected-service heartbeats. Each query returns the most
    // recent successful event we can attribute to the service, so
    // we can render "last seen X minutes ago" cards.
    admin
      .from("audit_log")
      .select("created_at")
      .in("event_type", ["report.analyzed", "report.updated"])
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("subscriptions")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1),
    admin
      .from("email_drafts")
      .select("sent_at")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1),
    admin
      .from("audit_log")
      .select("created_at")
      .eq("event_type", "cron.sweep_ran")
      .order("created_at", { ascending: false })
      .limit(1),
    // Synthetic heartbeat data for the last 24 hours, across all
    // services. We aggregate per-service in code below.
    admin
      .from("synthetic_pings")
      .select("service, ran_at, ok, latency_ms, error_message")
      .gte("ran_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("ran_at", { ascending: false })
      .limit(500),
  ]);
  const failed24h = failed24hCountRes.count ?? 0;
  const success24h = success24hCountRes.count ?? 0;

  // Extract last-seen timestamps for the connected-service tiles.
  const lastAnthropic =
    (lastAnthropicRes.data?.[0] as { created_at?: string } | undefined)
      ?.created_at ?? null;
  const lastStripe =
    (lastStripeRes.data?.[0] as { updated_at?: string } | undefined)
      ?.updated_at ?? null;
  const lastResend =
    (lastResendRes.data?.[0] as { sent_at?: string } | undefined)?.sent_at ??
    null;
  const lastCron =
    (lastCronRes.data?.[0] as { created_at?: string } | undefined)
      ?.created_at ?? null;

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

  // 24h error-rate sparkline buckets. 24 hourly cells, ending at
  // "now" so the rightmost bar represents the current hour. Each
  // bucket counts finished reports (success + failed) so we can
  // compute a per-hour error rate without dividing by zero in empty
  // hours (those render as gray placeholders).
  type Bucket = { hourStartMs: number; total: number; failed: number };
  const buckets: Bucket[] = [];
  const nowMs = Date.now();
  for (let i = 23; i >= 0; i--) {
    buckets.push({
      hourStartMs: nowMs - i * 60 * 60 * 1000,
      total: 0,
      failed: 0,
    });
  }
  const startWindowMs = nowMs - 24 * 60 * 60 * 1000;
  type FinishedRow = {
    status: string;
    analysis_completed_at: string | null;
    created_at: string;
  };
  for (const row of (hourlyAllRes.data ?? []) as FinishedRow[]) {
    const tsIso =
      row.status === "failed"
        ? row.created_at
        : row.analysis_completed_at || row.created_at;
    const ts = new Date(tsIso).getTime();
    if (!Number.isFinite(ts) || ts < startWindowMs || ts > nowMs) continue;
    const offsetHours = Math.floor((nowMs - ts) / (60 * 60 * 1000));
    if (offsetHours < 0 || offsetHours > 23) continue;
    const idx = 23 - offsetHours; // rightmost = current hour
    buckets[idx].total += 1;
    if (row.status === "failed") buckets[idx].failed += 1;
  }
  const totalFinished24h = buckets.reduce((acc, b) => acc + b.total, 0);
  const totalFailed24h = buckets.reduce((acc, b) => acc + b.failed, 0);
  const errorRate24h =
    totalFinished24h > 0 ? totalFailed24h / totalFinished24h : 0;

  // ----- Synthetic heartbeat aggregation -------------------------
  // Group the last 24h of pings by service. Per service we expose
  // the latest ping (status + latency + error), the success rate
  // across the window, and a small status history for the trail
  // visualization (last 12 attempts, newest first).
  type PingRow = {
    service: string;
    ran_at: string;
    ok: boolean;
    latency_ms: number | null;
    error_message: string | null;
  };
  type ServiceSummary = {
    service: string;
    latest: PingRow | null;
    success_rate: number; // 0-1
    sample_count: number;
    fail_count: number;
    p50_latency_ms: number | null;
    history: PingRow[]; // newest first, up to 12
  };
  const pingRows = (syntheticRes.data ?? []) as PingRow[];
  const HEARTBEAT_SERVICES = ["anthropic", "storage", "stripe", "resend"] as const;
  const syntheticByService: Record<string, ServiceSummary> = {};
  for (const svc of HEARTBEAT_SERVICES) {
    const ofSvc = pingRows.filter((p) => p.service === svc);
    const latencies = ofSvc
      .filter((p) => p.ok && p.latency_ms !== null)
      .map((p) => p.latency_ms as number)
      .sort((a, b) => a - b);
    const failCount = ofSvc.filter((p) => !p.ok).length;
    syntheticByService[svc] = {
      service: svc,
      latest: ofSvc[0] ?? null,
      success_rate: ofSvc.length > 0 ? 1 - failCount / ofSvc.length : 0,
      sample_count: ofSvc.length,
      fail_count: failCount,
      p50_latency_ms:
        latencies.length > 0
          ? latencies[Math.floor(latencies.length / 2)]
          : null,
      history: ofSvc.slice(0, 12),
    };
  }

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
          value={successWindowCount > 0 ? formatDuration(avgMs) : ","}
          sublabel={
            successWindowCount > 0
              ? `${successWindowCount} sample${successWindowCount === 1 ? "" : "s"}`
              : "no data yet"
          }
          tone={avgMs > 300_000 ? "amber" : "muted"}
        />
        <StatusCard
          label="P95 run (7d)"
          value={successWindowCount > 0 ? formatDuration(p95Ms) : ","}
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

      {/* 24h error-rate sparkline. Each bar is one hour, leftmost is
          24h ago, rightmost is "now". Bar height = error rate (0-100%
          mapped to bar height). Empty hours render as flat gray
          markers so a quiet stretch is obviously quiet rather than
          mistakenly read as zero errors. */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              24h error rate
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hourly buckets. Bar height is the percent of finished runs
              that failed in that hour. Trend matters more than any
              single bar; an upward slope on the right is the signal
              to investigate.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">
              {(errorRate24h * 100).toFixed(1)}
              <span className="text-base font-medium text-slate-500">%</span>
            </p>
            <p className="text-[11px] text-slate-500">
              {totalFailed24h} failed / {totalFinished24h} finished
            </p>
          </div>
        </div>
        <div className="mt-5">
          <ErrorRateSparkline buckets={buckets} />
        </div>
      </section>

      {/* Synthetic heartbeats. Proactive checks fired hourly by
          /api/cron/synthetic-heartbeat against each external
          service. Shows latest status, p50 latency, 24h success
          rate, and a 12-attempt trail per service. Goes red as
          soon as the next scheduled ping fails. */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Synthetic heartbeats
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
              Cron fires every hour and runs a tiny round-trip
              against each upstream service. These tiles tell you
              what is broken right now, even when there is no
              organic user traffic to mine signal from.
            </p>
          </div>
          <p className="text-[11px] text-slate-500 italic">
            Cron: <span className="font-mono">/api/cron/synthetic-heartbeat</span>{" "}
            (hourly)
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <HeartbeatTile
            service="anthropic"
            label="Anthropic"
            description="Sonnet 4.5 ping → pong"
            summary={syntheticByService["anthropic"]}
          />
          <HeartbeatTile
            service="storage"
            label="Supabase storage"
            description="Bucket write + read back"
            summary={syntheticByService["storage"]}
          />
          <HeartbeatTile
            service="stripe"
            label="Stripe"
            description="balance.retrieve read"
            summary={syntheticByService["stripe"]}
          />
          <HeartbeatTile
            service="resend"
            label="Resend"
            description="domains.list read"
            summary={syntheticByService["resend"]}
          />
        </div>
      </section>

      {/* Connected services. Last-successful timestamp per upstream
          dependency, mined from existing organic data so no
          instrumentation burden is added. Tones derived from
          per-service freshness thresholds (cron is critical; the
          others are quieter by their nature). Each tile links
          somewhere actionable. Read as a "real traffic" view; the
          Synthetic heartbeats section above is the "we just
          checked" view. */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900">
            Connected services
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Last-successful signal for each upstream service. If a tile
            goes red, that service has gone quiet and is the first
            place to check.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <ServiceTile
            label="Anthropic"
            description="Analyzer model calls"
            timestampIso={lastAnthropic}
            // Anthropic is our highest-volume external service. We
            // expect it to fire on every analysis. > 7 days quiet
            // is a problem if there's any traffic at all.
            thresholds={{ greenHours: 24 * 7, amberHours: 24 * 14 }}
          />
          <ServiceTile
            label="Stripe webhook"
            description="Billing event sync"
            timestampIso={lastStripe}
            // Stripe webhooks fire on checkout, subscription change,
            // and renewal. Cadence is monthly + episodic. Quiet
            // stretches are normal early on.
            thresholds={{ greenHours: 24 * 14, amberHours: 24 * 30 }}
          />
          <ServiceTile
            label="Resend"
            description="Client report email send"
            timestampIso={lastResend}
            // Mined from email_drafts.sent_at (the via=resend path).
            // Per-agent send frequency varies a lot, so the green
            // window is generous.
            thresholds={{ greenHours: 24 * 7, amberHours: 24 * 21 }}
          />
          <ServiceTile
            label="Sweep cron"
            description="Stale-analyzing watchdog"
            timestampIso={lastCron}
            // Scheduled every 15 min in vercel.json. > 30 min quiet
            // means the cron is broken and stuck reports will start
            // piling up.
            thresholds={{ greenHours: 0.5, amberHours: 1.5 }}
          />
          <ExternalLinkTile
            label="Vercel Analytics"
            description="Page-load latency + errors"
            href="https://vercel.com/dashboard"
            note="Opens Vercel"
          />
        </div>
        <p className="text-[11px] text-slate-500 italic mt-4 leading-relaxed">
          These tiles are mined from existing data (audit_log,
          subscriptions, email_drafts). They show last-seen-OK, not
          live request latency. For request-level performance,
          Vercel Analytics is the source.
        </p>
      </section>

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

// Hourly bar sparkline for the 24h error-rate timeseries. Each
// bucket renders as one bar; bar height encodes failure rate from
// 0 to 100% (with a 5% minimum so anything > 0 is visible) and bar
// color encodes severity. Empty hours render as a flat gray
// baseline tick so quiet stretches look quiet rather than green.
type Bucket = { hourStartMs: number; total: number; failed: number };
function ErrorRateSparkline({ buckets }: { buckets: Bucket[] }) {
  const W = 720;
  const H = 80;
  const PAD_X = 0;
  const PAD_TOP = 6;
  const PAD_BOT = 18; // room for the x-axis hour markers
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOT;
  const gap = 3;
  const barW = (innerW - gap * (buckets.length - 1)) / buckets.length;
  const nowMs = Date.now();

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="24-hour error rate, hourly buckets"
        className="w-full h-auto max-w-full"
        style={{ minWidth: 320 }}
      >
        {/* Baseline */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={H - PAD_BOT}
          y2={H - PAD_BOT}
          stroke="#E2E8F0"
          strokeWidth={1}
        />
        {buckets.map((b, i) => {
          const rate = b.total > 0 ? b.failed / b.total : 0;
          const hasData = b.total > 0;
          const barH = hasData
            ? Math.max(rate > 0 ? 4 : 2, rate * innerH)
            : 2;
          const x = PAD_X + i * (barW + gap);
          const y = H - PAD_BOT - barH;
          const color = !hasData
            ? "#CBD5E1" // slate-300, "no data" marker
            : rate >= 0.2
              ? "#DC2626" // red-600
              : rate >= 0.1
                ? "#F59E0B" // amber-500
                : rate > 0
                  ? "#FCD34D" // amber-300
                  : "#10B981"; // emerald-500
          const hourDate = new Date(b.hourStartMs);
          const tooltipLines = [
            `${hourDate.toLocaleTimeString(undefined, { hour: "numeric" })} • ${b.total} finished`,
            hasData
              ? `${b.failed} failed (${(rate * 100).toFixed(0)}%)`
              : "no runs",
          ];
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={1.5}
                fill={color}
              >
                <title>{tooltipLines.join(", ").replace(/, /g, " · ")}</title>
              </rect>
            </g>
          );
        })}
        {/* X-axis ticks: -24h, -18h, -12h, -6h, now. */}
        {[0, 6, 12, 18, 23].map((tick) => {
          const idx = tick;
          const x = PAD_X + idx * (barW + gap) + barW / 2;
          const hours = 23 - idx;
          const label =
            hours === 0
              ? "now"
              : hours === 23
                ? "24h ago"
                : `-${hours}h`;
          return (
            <text
              key={tick}
              x={x}
              y={H - 4}
              fill="#64748B"
              fontSize={10}
              textAnchor="middle"
              fontFamily="system-ui"
            >
              {label}
            </text>
          );
        })}
        <title>{`Now: ${new Date(nowMs).toLocaleTimeString()}`}</title>
      </svg>
    </div>
  );
}

// Synthetic-heartbeat tile. Shows the latest ping result plus the
// 24h success rate, the p50 latency, and a 12-attempt trail of
// little squares so the recent history is visible at a glance.
function HeartbeatTile({
  service: _service,
  label,
  description,
  summary,
}: {
  service: string;
  label: string;
  description: string;
  summary: {
    service: string;
    latest:
      | {
          ran_at: string;
          ok: boolean;
          latency_ms: number | null;
          error_message: string | null;
        }
      | null;
    success_rate: number;
    sample_count: number;
    fail_count: number;
    p50_latency_ms: number | null;
    history: Array<{
      ran_at: string;
      ok: boolean;
      latency_ms: number | null;
    }>;
  };
}) {
  const { latest, success_rate, sample_count, fail_count, p50_latency_ms, history } =
    summary;

  let tone: "green" | "amber" | "red" | "muted" = "muted";
  let toneLabel = "No data yet";
  if (latest) {
    if (!latest.ok) {
      tone = "red";
      toneLabel = "Down";
    } else if (success_rate < 0.95) {
      tone = "amber";
      toneLabel = "Flaky";
    } else {
      tone = "green";
      toneLabel = "Healthy";
    }
  }
  const dotColor =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "red"
          ? "bg-red-500"
          : "bg-slate-300";
  const borderColor =
    tone === "red"
      ? "border-red-300"
      : tone === "amber"
        ? "border-amber-300"
        : tone === "green"
          ? "border-emerald-200"
          : "border-slate-200";

  return (
    <div
      className={`bg-white rounded-xl border ${borderColor} p-4 flex flex-col gap-2`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`}
            aria-hidden="true"
          />
          <p className="text-sm font-bold text-slate-900 truncate">
            {label}
          </p>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
          {toneLabel}
        </p>
      </div>
      <p className="text-[11px] text-slate-500">{description}</p>

      {/* 12-attempt history trail. Newest right (visually most
          recent). Each square is one ping; green = ok, red = fail,
          gray = no data slot. */}
      <div className="flex items-center gap-1 mt-1" aria-label="Recent pings">
        {Array.from({ length: 12 }).map((_, i) => {
          // history is newest first; map index 0..11 right-to-left so
          // the newest sits at the far right of the trail row.
          const trailIdx = 11 - i;
          const p = history[trailIdx];
          if (!p) {
            return (
              <span
                key={i}
                className="block w-2.5 h-3.5 rounded-sm bg-slate-200"
                title="no ping yet"
              />
            );
          }
          const c = p.ok ? "bg-emerald-500" : "bg-red-500";
          const t = `${new Date(p.ran_at).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })} · ${p.ok ? `ok ${p.latency_ms ?? "?"}ms` : "FAIL"}`;
          return (
            <span
              key={i}
              className={`block w-2.5 h-3.5 rounded-sm ${c}`}
              title={t}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Last
          </p>
          <p className="text-slate-900 font-mono">
            {latest ? formatAgo(Date.now() - new Date(latest.ran_at).getTime()) : ","}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            P50
          </p>
          <p className="text-slate-900 font-mono">
            {p50_latency_ms !== null ? `${p50_latency_ms}ms` : ","}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            24h OK
          </p>
          <p className="text-slate-900 font-mono">
            {sample_count > 0
              ? `${Math.round(success_rate * 100)}%`
              : ","}
          </p>
        </div>
      </div>

      {latest && !latest.ok && latest.error_message ? (
        <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1 mt-1 leading-snug break-words">
          {latest.error_message}
        </p>
      ) : null}

      {sample_count === 0 ? (
        <p className="text-[11px] text-slate-500 italic mt-1">
          Waiting for the first cron run. Hourly schedule.
        </p>
      ) : fail_count > 0 ? (
        <p className="text-[10px] text-slate-500 mt-1">
          {fail_count} fail{fail_count === 1 ? "" : "s"} in last {sample_count}{" "}
          attempt{sample_count === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

// One "service" tile: shows last-OK time + colored freshness dot.
function ServiceTile({
  label,
  description,
  timestampIso,
  thresholds,
}: {
  label: string;
  description: string;
  timestampIso: string | null;
  thresholds: { greenHours: number; amberHours: number };
}) {
  const ageMs = timestampIso
    ? Date.now() - new Date(timestampIso).getTime()
    : Number.POSITIVE_INFINITY;
  const ageHours = ageMs / (60 * 60 * 1000);

  let tone: "green" | "amber" | "red" | "muted" = "muted";
  let toneLabel = "No data yet";
  if (timestampIso) {
    if (ageHours <= thresholds.greenHours) {
      tone = "green";
      toneLabel = "Healthy";
    } else if (ageHours <= thresholds.amberHours) {
      tone = "amber";
      toneLabel = "Quiet";
    } else {
      tone = "red";
      toneLabel = "Check this";
    }
  }
  const dotColor =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "red"
          ? "bg-red-500"
          : "bg-slate-300";
  const borderColor =
    tone === "red"
      ? "border-red-300"
      : tone === "amber"
        ? "border-amber-300"
        : tone === "green"
          ? "border-emerald-200"
          : "border-slate-200";
  return (
    <div
      className={`bg-white rounded-xl border ${borderColor} p-3 flex flex-col gap-1`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${dotColor}`}
          aria-hidden="true"
        />
        <p className="text-sm font-bold text-slate-900 truncate">{label}</p>
      </div>
      <p className="text-[11px] text-slate-500">{description}</p>
      <p className="text-xs text-slate-700 mt-1">
        {timestampIso ? `Last OK ${formatAgo(ageMs)}` : "No data yet"}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {toneLabel}
      </p>
    </div>
  );
}

// External-link tile: opens an outside dashboard in a new tab.
function ExternalLinkTile({
  label,
  description,
  href,
  note,
}: {
  label: string;
  description: string;
  href: string;
  note: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col gap-1 hover:border-slate-400 hover:shadow-sm transition-colors"
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full bg-indigo-500"
          aria-hidden="true"
        />
        <p className="text-sm font-bold text-slate-900 truncate">{label}</p>
      </div>
      <p className="text-[11px] text-slate-500">{description}</p>
      <p className="text-xs text-indigo-700 mt-1">{note} ↗</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        External link
      </p>
    </a>
  );
}

function formatAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const months = Math.floor(d / 30);
  return `${months}mo ago`;
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
