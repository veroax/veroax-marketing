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
import { AdminDeleteReportButton } from "@/app/admin/_components/AdminDeleteReportButton";
import { composeExecutiveNarrative } from "@/lib/reports/narrative";
import { composeAgentStrengthsAndConcerns } from "@/lib/reports/summary";
import type { ReportData, Finding } from "@/lib/anthropic/schema";

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
      "id, user_id, status, property_address, client_name, report_name, listing_url, listing_text, created_at, analysis_started_at, analysis_completed_at, failure_reason, original_files, archived, archived_at, watermarked, credit_source, brokerage_id, team_id, listing_reconciliation, listing_source_choice, analysis_run_count, report_data, share_code",
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
          {/* View report: opens the public share-link page in a new
              tab so the admin sees exactly what the buyer would see.
              Only available when a share_code has been minted, which
              happens at first successful analysis. PDF download
              stays available below for the offline / archive flow. */}
          {report.report_data &&
          (report as { share_code?: string | null }).share_code ? (
            <a
              href={`/r/${(report as { share_code: string }).share_code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-amber-400 text-indigo-950 px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors shadow-sm"
              title="Open the public report in a new tab, the same view the buyer sees from the share link"
            >
              <span className="text-base leading-none">↗</span>
              View report
            </a>
          ) : null}
          {report.report_data ? (
            <a
              href={`/api/reports/${report.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-indigo-700 hover:text-indigo-900 px-4 py-2 rounded-lg border border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
              title="Download the report as a PDF. Renders with the owning agent's branding, not yours."
            >
              Download PDF
            </a>
          ) : null}
          <Link
            href={`/admin/audit?report=${report.id}`}
            className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
          >
            Full audit log
          </Link>
          <AdminDeleteReportButton
            reportId={report.id}
            reportLabel={display}
          />
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

      {/* Report content: rendered when the analysis has data,
          regardless of status. Uses the same narrative + strengths
          / concerns helpers the agent dashboard uses, so the admin
          sees what the agent sees without redirecting through
          /dashboard/reports/<id> (which 404s for non-owners).
          For the full styled output (cover, all 14 sections, agent
          branding) the admin can hit the Download PDF button in
          the actions row above. */}
      {report.report_data ? (
        <AdminReportContent
          reportData={report.report_data as ReportData}
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

// Admin-facing read of the synthesized report content.
//
// Renders the same headline data the agent sees on
// /dashboard/reports/<id> (executive narrative, strengths,
// concerns, critical findings, moderate findings, overall rating),
// but without the agent-action affordances (download PDF lives
// in the admin actions row above; archive / email-client /
// share-link don't apply when the caller isn't the owning agent).
//
// Uses the existing composeExecutiveNarrative + composeAgentStrengths-
// AndConcerns helpers so a future change to those helpers shows up
// here automatically, no second source of truth to maintain.
function AdminReportContent({ reportData }: { reportData: ReportData }) {
  const narrative = composeExecutiveNarrative(reportData);
  const { strengths, concerns } = composeAgentStrengthsAndConcerns(reportData);
  const property = reportData.property_snapshot;
  const rating = reportData.overall_rating;
  const critical = reportData.critical_findings ?? [];
  const moderate = reportData.moderate_findings ?? [];
  const grand = reportData.cost_summary?.grand_total ?? null;
  const hoa = reportData.hoa;
  const completeness = reportData.completeness_audit;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
            Report content
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            What the analyzer produced. The owning agent sees this
            on their dashboard; the full styled PDF is available
            from the Download PDF button above.
          </p>
        </div>
        {rating ? (
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${overallRatingTone(rating.label)}`}
          >
            {rating.label}
          </span>
        ) : null}
      </div>

      {/* Property snapshot, condensed admin view. */}
      {property ? (
        <div className="grid sm:grid-cols-3 gap-x-6 gap-y-3 text-sm border-t border-slate-100 pt-5">
          <Row
            label="Address"
            value={
              property.address ?? (
                <span className="text-slate-400 italic">
                  not extracted
                </span>
              )
            }
          />
          {property.property_type ? (
            <Row label="Type" value={property.property_type} />
          ) : null}
          {property.year_built ? (
            <Row label="Year built" value={property.year_built} />
          ) : null}
          {property.bedrooms != null || property.bathrooms != null ? (
            <Row
              label="Bed / Bath / Sqft"
              value={`${property.bedrooms ?? "?"} bd / ${property.bathrooms ?? "?"} ba${property.square_feet ? ` / ${property.square_feet.toLocaleString()} sqft` : ""}`}
            />
          ) : null}
          {property.list_price ? (
            <Row label="List price" value={`$${property.list_price.toLocaleString()}`} />
          ) : null}
          {property.days_on_market != null ? (
            <Row label="Days on market" value={property.days_on_market} />
          ) : null}
          {property.mls_number ? (
            <Row label="MLS#" value={<code className="text-xs">{property.mls_number}</code>} />
          ) : null}
          {property.apn ? (
            <Row label="APN" value={<code className="text-xs">{property.apn}</code>} />
          ) : null}
          {grand ? (
            <Row
              label="Total exposure"
              value={
                <span className="font-bold text-slate-900">
                  ${grand.low.toLocaleString()} to ${grand.high.toLocaleString()}
                </span>
              }
            />
          ) : null}
        </div>
      ) : null}

      {/* Executive narrative, as paragraphs. */}
      {narrative.length > 0 ? (
        <div className="border-t border-slate-100 pt-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Executive narrative
          </h3>
          {narrative.map((paragraph, i) => (
            <p
              key={i}
              className="text-sm text-slate-800 leading-relaxed"
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}

      {/* Strengths vs concerns, side by side. */}
      {(strengths.length > 0 || concerns.length > 0) ? (
        <div className="border-t border-slate-100 pt-5 grid sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-2">
              Three strengths
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-800">
              {strengths.length === 0 ? (
                <li className="italic text-slate-400">none surfaced</li>
              ) : (
                strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-emerald-600 font-bold">
                      {i + 1}.
                    </span>
                    <span>{s.text}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-red-700 mb-2">
              Three key concerns
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-800">
              {concerns.length === 0 ? (
                <li className="italic text-slate-400">none surfaced</li>
              ) : (
                concerns.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-red-700 font-bold">
                      {i + 1}.
                    </span>
                    <span>{c.text}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Cross-document consistency findings (between-document
          disagreements). Renders ABOVE critical findings because
          these are often contract-level issues the listing side
          needs to correct, more actionable than any single
          finding. Mirrors the public report's CrossDocumentSection
          but condensed for the admin view. */}
      {reportData.cross_document_findings &&
      reportData.cross_document_findings.length > 0 ? (
        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700 mb-2">
            Cross-document items to fix ({reportData.cross_document_findings.length})
          </h3>
          <ul className="space-y-2.5">
            {reportData.cross_document_findings
              .slice(0, 8)
              .map((f, i) => {
                const sev = f.severity ?? "moderate";
                const badgeTone =
                  sev === "critical"
                    ? "bg-red-700 text-white"
                    : sev === "informational"
                      ? "bg-slate-600 text-white"
                      : "bg-amber-500 text-white";
                return (
                  <li key={i} className="text-sm">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 flex-1 min-w-0">
                        {f.title}
                      </p>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${badgeTone}`}
                      >
                        {sev}
                      </span>
                    </div>
                    <p className="text-slate-700 mt-1 leading-relaxed">
                      {f.description}
                    </p>
                    {f.source_docs && f.source_docs.length > 0 ? (
                      <p className="text-xs text-slate-500 mt-1">
                        <span className="font-semibold">In tension: </span>
                        {f.source_docs.join(" vs. ")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            {reportData.cross_document_findings.length > 8 ? (
              <li className="text-xs text-slate-500 italic pl-2">
                ...{reportData.cross_document_findings.length - 8} more,
                see the public report for the full set.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* Critical + high findings (top 5 by severity ordering). */}
      {critical.length > 0 ? (
        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-red-700 mb-3">
            Critical and high-priority findings ({critical.length})
          </h3>
          <ul className="space-y-2.5">
            {critical.slice(0, 8).map((f, i) => (
              <FindingRow key={i} finding={f} />
            ))}
            {critical.length > 8 ? (
              <li className="text-xs text-slate-500 italic pl-2">
                ...{critical.length - 8} more, see the PDF for the
                full set.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* Moderate findings, condensed. */}
      {moderate.length > 0 ? (
        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-3">
            Moderate findings ({moderate.length})
          </h3>
          <ul className="space-y-1.5 text-sm text-slate-800">
            {moderate.slice(0, 10).map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-700">&middot;</span>
                <span>
                  {f.title}
                  {f.cost_estimate &&
                  (f.cost_estimate.low || f.cost_estimate.high) ? (
                    <span className="text-slate-500 text-xs ml-2">
                      ${(f.cost_estimate.low ?? 0).toLocaleString()} to $
                      {(f.cost_estimate.high ?? 0).toLocaleString()}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
            {moderate.length > 10 ? (
              <li className="text-xs text-slate-500 italic pl-2">
                ...{moderate.length - 10} more in the PDF.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* HOA section summary, when present. */}
      {hoa && hoa.applicable !== false ? (
        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            HOA review
          </h3>
          <p className="text-sm text-slate-800 leading-relaxed">
            {hoa.summary ?? (
              <span className="italic text-slate-400">
                no HOA narrative populated
              </span>
            )}
          </p>
          {hoa.reserve_health_read ? (
            <p className="text-sm text-slate-800 leading-relaxed mt-3">
              <span className="font-semibold">Reserve health, our read:</span>{" "}
              {hoa.reserve_health_read}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Overall rating narrative. */}
      {rating ? (
        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            Overall rating
          </h3>
          <p className="text-sm text-slate-800 leading-relaxed">
            {rating.summary ?? rating.contingency_advice ?? (
              <span className="italic text-slate-400">
                no narrative populated
              </span>
            )}
          </p>
          {rating.why_this_rating ? (
            <p className="text-sm text-slate-800 leading-relaxed mt-3">
              <span className="font-semibold">Why this rating:</span>{" "}
              {rating.why_this_rating}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Completeness audit issues, surfaces the stale-package
          warnings and any other issues the focused passes or
          defensive override generated. */}
      {completeness && (completeness.issues?.length ?? 0) > 0 ? (
        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            Completeness audit ({completeness.issues?.length})
          </h3>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {completeness.issues?.map((issue, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-600">&middot;</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const sevTone =
    finding.severity === "critical"
      ? "bg-red-700 text-white"
      : finding.severity === "high"
        ? "bg-orange-700 text-white"
        : "bg-amber-100 text-amber-900";
  return (
    <li className="border border-slate-200 rounded-lg p-3 text-sm">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="font-semibold text-slate-900">{finding.title}</p>
        <span
          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded shrink-0 ${sevTone}`}
        >
          {finding.severity}
        </span>
      </div>
      {finding.cost_estimate &&
      (finding.cost_estimate.low || finding.cost_estimate.high) ? (
        <p className="text-xs text-slate-600 font-mono">
          ${(finding.cost_estimate.low ?? 0).toLocaleString()} to $
          {(finding.cost_estimate.high ?? 0).toLocaleString()}
        </p>
      ) : null}
      {finding.source ? (
        <p className="text-xs text-slate-500 mt-1">{finding.source}</p>
      ) : null}
    </li>
  );
}

function overallRatingTone(label: string | null | undefined): string {
  switch (label) {
    case "Excellent":
    case "Good":
      return "bg-emerald-100 text-emerald-800";
    case "Acceptable":
      return "bg-indigo-100 text-indigo-800";
    case "Manageable Concerns":
      return "bg-amber-100 text-amber-800";
    case "Significant Concerns":
      return "bg-orange-100 text-orange-900";
    case "Walk Away":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
