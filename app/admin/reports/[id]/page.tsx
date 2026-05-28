// Admin-only report detail view. Service-role read of any report
// regardless of owner, so admins clicking a row in /admin/reports
// never hit the 404 they'd get from /dashboard/reports/[id] (which
// is RLS-scoped to the report's owning agent).
//
// Surfaces:
//   - Identity row: address, status pill, created/completed dates,
//     owning agent, brokerage / team attribution if any
//   - Document inventory (what was uploaded)
//   - Failure reason when status='failed'
//   - Audit-log tail for this report (last 20 events)
//   - Listing reconciliation audit trail when present
//   - Admin actions: re-run analysis, open the agent-facing view
//     (which will 404 unless the admin happens to own it, useful
//     only for self-owned reports), view full audit
//
// Re-run flow: posts to /api/admin/reports/[id]/rerun. The page is
// a server component so re-run is a client island.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { AdminRerunButton } from "@/app/admin/_components/AdminRerunButton";
import { AdminAnalysisProgress } from "@/app/admin/_components/AdminAnalysisProgress";

export const metadata = {
  title: "Report detail, Admin",
};

type RouteParams = Promise<{ id: string }>;

export default async function AdminReportDetail({
  params,
}: {
  params: RouteParams;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    // requireAdmin returns NextResponse for API contexts; for a
    // page render we redirect to /login (unauthenticated) or send
    // them home (signed in but not admin).
    redirect("/login?next=/admin/reports");
  }

  const { id: reportId } = await params;
  const admin = createServiceRoleClient();

  const { data: report } = await admin
    .from("reports")
    .select(
      "id, user_id, status, property_address, client_name, report_name, listing_url, listing_text, created_at, analysis_started_at, analysis_completed_at, failure_reason, original_files, archived, archived_at, watermarked, credit_source, brokerage_id, team_id, listing_reconciliation, listing_source_choice, analysis_run_count",
    )
    .eq("id", reportId)
    .maybeSingle();

  if (!report) notFound();

  // Owning agent profile, for the identity panel + link back to
  // /admin/users/<id>.
  const { data: owner } = await admin
    .from("profiles")
    .select("id, email, full_name, brokerage, dre_license, is_admin, is_suspended")
    .eq("id", report.user_id)
    .maybeSingle();

  // Audit log tail for this specific report, last 20 events.
  const { data: auditRowsRaw } = await admin
    .from("audit_log")
    .select("event_type, metadata, created_at, user_id")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(20);
  const auditRows = (auditRowsRaw ?? []) as Array<{
    event_type: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
    user_id: string | null;
  }>;

  // Original files inventory for the "what was uploaded" block.
  const originalFiles = Array.isArray(
    (report as { original_files?: unknown }).original_files,
  )
    ? ((report as { original_files?: Array<Record<string, unknown>> })
        .original_files ?? [])
    : [];

  const display =
    report.property_address?.trim() ||
    report.report_name?.trim() ||
    "Untitled report";

  const reconciliation = (
    report as { listing_reconciliation?: Record<string, unknown> | null }
  ).listing_reconciliation;
  const hasDivergence = Boolean(
    reconciliation &&
      typeof reconciliation === "object" &&
      (reconciliation as { has_divergence?: boolean }).has_divergence,
  );

  return (
    <div className="space-y-6">
      <div className="text-xs">
        <Link
          href="/admin/reports"
          className="text-slate-500 hover:text-slate-900"
        >
          &larr; All reports
        </Link>
      </div>

      {/* Identity panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 break-words">
              {display}
            </h1>
            {report.client_name ? (
              <p className="text-sm text-slate-500 mt-1">
                Client: {report.client_name}
              </p>
            ) : null}
            {report.report_name && report.property_address ? (
              <p className="text-xs text-slate-400 mt-0.5">
                Agent label: {report.report_name}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <StatusPill status={report.status} />
            {(report as { analysis_run_count?: number }).analysis_run_count &&
            (report as { analysis_run_count: number }).analysis_run_count > 1 ? (
              <span
                className="text-[10px] uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-semibold"
                title="Number of times this report has been analyzed (original run + retries)"
              >
                Run #{(report as { analysis_run_count: number }).analysis_run_count}
              </span>
            ) : null}
            {report.archived ? (
              <span className="text-[10px] uppercase tracking-wider text-slate-400 px-2 py-0.5 border border-slate-200 rounded">
                Archived
              </span>
            ) : null}
            {report.watermarked ? (
              <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                Trial
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm pt-4 border-t border-slate-100">
          <Row label="Report ID" value={<code className="text-xs">{report.id}</code>} />
          <Row
            label="Owner"
            value={
              owner ? (
                <Link
                  href={`/admin/users/${owner.id}`}
                  className="text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
                >
                  {owner.full_name?.trim() || owner.email}
                </Link>
              ) : (
                <span className="text-slate-400 italic">unknown</span>
              )
            }
          />
          <Row
            label="Created"
            value={new Date(report.created_at).toLocaleString("en-US", {
              timeZone: "America/Los_Angeles",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          />
          <Row
            label="Completed"
            value={
              report.analysis_completed_at
                ? new Date(report.analysis_completed_at).toLocaleString("en-US", {
                    timeZone: "America/Los_Angeles",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : <span className="text-slate-400 italic">not yet</span>
            }
          />
          {report.analysis_started_at ? (
            <Row
              label="Last analysis started"
              value={new Date(report.analysis_started_at).toLocaleString("en-US", {
                timeZone: "America/Los_Angeles",
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
          ) : null}
          {report.listing_url ? (
            <Row
              label="Listing URL"
              value={
                <a
                  href={report.listing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-700 hover:text-indigo-900 underline underline-offset-2 break-all"
                >
                  {report.listing_url}
                </a>
              }
            />
          ) : null}
          {report.credit_source ? (
            <Row label="Credit source" value={report.credit_source} />
          ) : null}
          {report.brokerage_id ? (
            <Row label="Brokerage" value={<code className="text-xs">{report.brokerage_id}</code>} />
          ) : null}
        </div>

        {report.failure_reason ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900">
            <p className="font-semibold mb-1">Failure reason</p>
            <p className="text-xs leading-relaxed">{report.failure_reason}</p>
          </div>
        ) : null}
      </div>

      {/* Admin actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4">
          Admin actions
        </h2>
        <div className="flex flex-wrap items-start gap-3">
          <AdminRerunButton
            reportId={report.id}
            currentStatus={report.status}
          />
          <Link
            href={`/dashboard/reports/${report.id}`}
            className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
          >
            Open agent view
          </Link>
          <Link
            href={`/admin/audit?report=${report.id}`}
            className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
          >
            Full audit log
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          Re-run replaces the current report data with a fresh
          multi-pass analysis run. The agent is NOT emailed; we
          assume admin re-runs are silent fixes. Same Claude
          machinery as a normal analysis, so the full verification
          pass, market-context, cost-reference, and listing
          reconciliation steps fire.
        </p>
      </div>

      {/* Live progress block, only renders while the analyzer is
          running so the admin can see the multi-pass machinery
          actually doing work after clicking Re-run. Mirrors the
          agent's AnalysisRunner UX but stripped of agent-facing
          affordances (no "we'll email you" message, no completion
          chime, no inline retry button). Server-side condition,
          shows up below the admin actions box without disturbing
          the existing layout. */}
      {report.status === "analyzing" ? (
        <AdminAnalysisProgress
          reportId={report.id}
          analysisStartedAt={report.analysis_started_at ?? null}
        />
      ) : null}

      {/* Listing reconciliation, when present.
          The agent-facing surfaces (PDF) now treat listing history
          as negotiation signal rather than a "fix this" warning.
          The admin view here mirrors that framing: neutral indigo
          when there's history worth noting, neutral white when
          sources agreed. The "Divergence flagged" amber pill is
          gone, has_divergence is preserved on the raw JSON for
          audit but not surfaced as a warning. */}
      {reconciliation ? (
        <div
          className={`rounded-2xl border p-6 ${hasDivergence ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200"}`}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700">
              Listing history
            </h2>
            {(reconciliation as { same_listing_agent_pattern?: boolean }).same_listing_agent_pattern ? (
              <span className="text-[10px] uppercase tracking-wider text-indigo-800 bg-indigo-200 px-2 py-0.5 rounded">
                Same listing agent
              </span>
            ) : null}
          </div>
          {(reconciliation as { listing_history_insight?: string | null }).listing_history_insight ? (
            <p className="text-sm text-slate-900 mb-3 leading-relaxed">
              {(reconciliation as { listing_history_insight: string }).listing_history_insight}
            </p>
          ) : (reconciliation as { divergence_note?: string | null }).divergence_note ? (
            <p className="text-sm text-slate-900 mb-3 leading-relaxed">
              {(reconciliation as { divergence_note: string }).divergence_note}
            </p>
          ) : null}
          {(reconciliation as { agent_talking_point?: string | null }).agent_talking_point ? (
            <div className="bg-white border border-indigo-200 rounded-lg p-4 mb-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 mb-1.5">
                For agent review &middot; client conversation
              </p>
              <p className="text-sm text-slate-800 italic leading-relaxed">
                {(reconciliation as { agent_talking_point: string }).agent_talking_point}
              </p>
            </div>
          ) : null}
          {report.listing_source_choice ? (
            <p className="text-xs text-slate-600 mb-3">
              Headline source:{" "}
              <span className="font-mono text-slate-900">
                {report.listing_source_choice}
              </span>
            </p>
          ) : null}
          <details className="text-xs text-slate-700">
            <summary className="cursor-pointer hover:text-slate-900">
              View raw reconciliation JSON
            </summary>
            <pre className="mt-2 bg-white border border-slate-200 rounded p-3 overflow-x-auto text-[10px] leading-relaxed">
              {JSON.stringify(reconciliation, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}

      {/* Document inventory */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4">
          Document inventory ({originalFiles.length})
        </h2>
        {originalFiles.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            No file inventory captured for this report.
          </p>
        ) : (
          <ul className="text-xs divide-y divide-slate-100">
            {originalFiles.map((f, i) => (
              <li
                key={i}
                className="py-2 grid grid-cols-[1fr_60px_80px] gap-3"
              >
                <span className="font-mono truncate text-slate-700">
                  {String(f.name ?? "(unnamed)")}
                </span>
                <span className="text-slate-500 text-right">
                  {f.pages != null ? `${f.pages} pp` : "?"}
                </span>
                <span className="text-slate-500 text-right">
                  {f.size_kb != null ? `${f.size_kb} KB` : "?"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Audit log tail */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
            Recent audit events ({auditRows.length})
          </h2>
          <Link
            href={`/admin/audit?report=${report.id}`}
            className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
          >
            View full audit &rarr;
          </Link>
        </div>
        {auditRows.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            No audit events recorded for this report.
          </p>
        ) : (
          <ul className="text-xs divide-y divide-slate-100">
            {auditRows.map((row, i) => (
              <li key={i} className="py-2 grid grid-cols-[160px_1fr] gap-3">
                <span className="text-slate-500">
                  {new Date(row.created_at).toLocaleString("en-US", {
                    timeZone: "America/Los_Angeles",
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
                <span className="font-mono text-slate-700">
                  {row.event_type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">
        {label}
      </p>
      <p className="text-sm text-slate-900 break-words">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    uploaded: { label: "Uploaded", tone: "bg-slate-100 text-slate-700" },
    analyzing: { label: "Analyzing", tone: "bg-indigo-100 text-indigo-700" },
    qa_pending: { label: "Ready", tone: "bg-emerald-100 text-emerald-700" },
    qa_approved: { label: "Ready", tone: "bg-emerald-100 text-emerald-700" },
    delivered: { label: "Delivered", tone: "bg-emerald-100 text-emerald-700" },
    failed: { label: "Failed", tone: "bg-red-100 text-red-700" },
  };
  const entry = map[status] ?? {
    label: status,
    tone: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${entry.tone}`}
    >
      {entry.label}
    </span>
  );
}
