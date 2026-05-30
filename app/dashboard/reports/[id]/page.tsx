import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resolveDashboardViewer } from "@/lib/admin/impersonation";
import { AnalysisRunner } from "./_components/AnalysisRunner";
import { CriticalFindingsView } from "./_components/CriticalFindingsView";
import { ReportErrorButton } from "@/components/ReportErrorButton";
import { RetryButton } from "./_components/RetryButton";
import { AgentActions } from "./_components/AgentActions";
import { RemoveFileButton } from "./_components/RemoveFileButton";
import { VersionDownloadButton } from "./_components/VersionDownloadButton";
import type { ReportData } from "@/lib/anthropic/schema";
import {
  composeAgentStrengthsAndConcerns,
  slugifyFindingTitle,
} from "@/lib/reports/summary";
import { composeExecutiveNarrative } from "@/lib/reports/narrative";
import { CompletionTimestamp } from "./_components/CompletionTimestamp";
import { FindingFlagButton } from "./_components/FindingFlagButton";

type Params = Promise<{ id: string }>;

export default async function ReportDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin impersonation: when the admin has activated "View as
  // user", we read this report via service role so we can resolve
  // a report owned by the impersonated user instead of bouncing
  // off RLS. Outside impersonation we keep the user-scoped client
  // so a regular agent only ever sees their own reports.
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(
    (viewerProfile as { is_admin?: boolean } | null)?.is_admin,
  );
  const viewer = await resolveDashboardViewer({
    actualUserId: user.id,
    isAdmin,
  });
  const reader = viewer.impersonating ? createServiceRoleClient() : supabase;

  const { data: report } = await reader
    .from("reports")
    .select("id, user_id, status, property_address, source_file_path, report_data, created_at, analysis_started_at, analysis_completed_at, failure_reason, report_name, client_name, last_updated_at, update_count, versions, original_files, archived, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!report) notFound();
  // When impersonating, verify the report is actually owned by the
  // impersonated user. Service-role would otherwise let an admin
  // view anyone's report through the impersonation surface, which
  // is a separate posture from "see what THIS user sees" and is
  // already covered by /admin/reports/[id]. Keep the surfaces clean.
  if (
    viewer.impersonating &&
    (report as { user_id?: string }).user_id !== viewer.viewingUserId
  ) {
    notFound();
  }
  // Soft-deleted reports 404 from the agent's own detail page.
  // Restoration is admin-only via /admin/reports/deleted, so even
  // the owning agent does not see the report here until an admin
  // brings it back.
  if ((report as { deleted_at?: string | null }).deleted_at) notFound();

  // We used to list storage objects here for a top-of-page "Source
  // documents" panel, but the same data renders inside AgentSummary
  // (as the "Uploaded documents" card built from reports.original_files),
  // so the top panel was duplicative. Dropped, saves a storage round-
  // trip on every detail page load and removes the redundant section.

  const reportData = report.report_data as ReportData | null;

  // Pull token/cost-related audit_log rows. We surface partial data even
  // when the analysis didn't complete fully, if Claude succeeded but a
  // later step failed we still want to see what it cost. We also fall
  // back to the estimated-token count emitted before the Claude call,
  // so the user has something to look at even after a rejection.
  type AnalyzedMeta = {
    input_tokens?: number;
    output_tokens?: number;
    estimated_input_tokens?: number;
    model?: string;
    files_uploaded?: number;
    files_skipped?: Array<{ filename: string; reason: string }>;
  };
  type StartedMeta = {
    document_count?: number;
    estimated_tokens?: number;
  };
  const { data: usageEvents } = await supabase
    .from("audit_log")
    .select("event_type, metadata, created_at")
    .eq("report_id", id)
    .in("event_type", [
      "report.analyzed",
      "analysis.claude_completed",
      "analysis.claude_started",
    ])
    .order("created_at", { ascending: false })
    .limit(10);

  const analyzedEvent = usageEvents?.find((e) => e.event_type === "report.analyzed");
  const claudeCompletedEvent = usageEvents?.find(
    (e) => e.event_type === "analysis.claude_completed",
  );
  const claudeStartedEvent = usageEvents?.find(
    (e) => e.event_type === "analysis.claude_started",
  );

  const fullUsage = analyzedEvent?.metadata as AnalyzedMeta | undefined;
  const completedUsage = claudeCompletedEvent?.metadata as AnalyzedMeta | undefined;
  const startedUsage = claudeStartedEvent?.metadata as StartedMeta | undefined;

  // Compose the best available token-burn snapshot.
  const usage: AnalyzedMeta & { estimated_input_tokens?: number } | null =
    fullUsage ||
    (completedUsage
      ? {
          ...completedUsage,
          estimated_input_tokens: startedUsage?.estimated_tokens,
        }
      : startedUsage
        ? { estimated_input_tokens: startedUsage.estimated_tokens }
        : null);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top chrome: just the back-link + status pill. The full
          address heading used to live here too, which duplicated
          the address rendered inside AgentSummary's hero (with
          "Prepared For" + dates + rating). The duplication cost
          a row of vertical space and made the page feel
          repetitive at first glance. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <Link
          href="/dashboard"
          className="text-xs text-gray-500 hover:text-slate-900 inline-block"
        >
          &larr; All reports
        </Link>
        <StatusPill status={report.status} />
      </div>

      {/* Analyzing state, render the client runner that triggers + polls.
          analysisStartedAt seeds the elapsed-time display so navigating
          back to this page mid-run shows REAL elapsed instead of resetting
          to 0, which also keeps the stuck-detection threshold working
          correctly after a navigation. */}
      {report.status === "analyzing" && (
        <AnalysisRunner
          reportId={report.id}
          analysisStartedAt={
            (report as { analysis_started_at?: string | null })
              .analysis_started_at ?? null
          }
          propertyAddress={report.property_address ?? null}
          isRerun={
            ((report as { analysis_run_count?: number | null })
              .analysis_run_count ?? 1) > 1
          }
        />
      )}

      {/* Failed state */}
      {report.status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 space-y-3">
          <div>
            <h2 className="text-base font-bold text-red-900 mb-1">
              Analysis didn&apos;t complete
            </h2>
            <p className="text-sm text-red-800">{report.failure_reason}</p>
          </div>
          <RetryButton reportId={report.id} />
          <p className="text-xs text-red-700/80">
            Or{" "}
            <Link
              href="/dashboard/upload"
              className="font-semibold underline underline-offset-2"
            >
              start a new report
            </Link>{" "}
            if you&apos;d rather upload different files.
          </p>
        </div>
      )}

      {/* Agent-focused summary view, replaces the old inline 14-section
          render. The full report is downloadable as PDF; this page now
          orients the agent around what they need to ACT on. */}
      {reportData && (
        <AgentSummary
          reportId={report.id}
          userId={user.id}
          reportData={reportData}
          reportName={
            (report as { report_name?: string | null }).report_name ?? null
          }
          clientName={
            (report as { client_name?: string | null }).client_name ?? null
          }
          createdAt={report.created_at}
          analysisCompletedAt={report.analysis_completed_at ?? null}
          analysisRunCount={
            (report as { analysis_run_count?: number | null })
              .analysis_run_count ?? null
          }
          lastUpdatedAt={
            (report as { last_updated_at?: string | null }).last_updated_at ??
            null
          }
          versions={
            ((report as { versions?: unknown }).versions as
              | ReportVersionSnapshot[]
              | null
              | undefined) ?? []
          }
          archived={Boolean(
            (report as { archived?: boolean | null } | null)?.archived,
          )}
          originalFiles={
            (Array.isArray(
              (report as { original_files?: unknown }).original_files,
            )
              ? ((report as { original_files: Array<unknown> }).original_files
                  .filter(
                    (e): e is {
                      name: string;
                      pages: number;
                      size_kb: number;
                      uploaded_at?: string | null;
                    } =>
                      typeof e === "object" &&
                      e !== null &&
                      typeof (e as { name?: unknown }).name === "string",
                  )
                  .map((e) => ({
                    name: e.name,
                    pages: Number(e.pages) || 0,
                    size_kb: Number(e.size_kb) || 0,
                    // Legacy reports persisted without uploaded_at fall
                    // back to the report's created_at on render so the
                    // PDF inventory always shows a date column.
                    uploaded_at:
                      typeof e.uploaded_at === "string"
                        ? e.uploaded_at
                        : report.created_at,
                  })))
              : []) as Array<{
              name: string;
              pages: number;
              size_kb: number;
              uploaded_at?: string | null;
            }>
          }
        />
      )}

      {/* Token burn / cost, dev visibility */}
      {usage && <TokenBurnCard usage={usage} />}

      {/* "Report an error" affordance, sits at the bottom of every
          report. Agents click here when a finding is wrong, missing,
          or doesn't apply; admins review submissions on
          /admin/report-errors and grant a refund credit when
          warranted. Email is pre-filled from the signed-in profile. */}
      <div className="border-t border-slate-200 pt-4 mt-6 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Notice an error in this report? Let us know, we may credit
          your account.
        </p>
        <ReportErrorButton
          reportId={report.id}
          defaultEmail={user.email ?? undefined}
        />
      </div>
    </div>
  );
}

// Sonnet pricing, $3/M input, $15/M output. Update if we switch models.
// ============================================================================
// Note: the old top-of-page Source documents panel (with its split-PDF
// collapsing helpers) was removed because AgentSummary already renders
// an "Uploaded documents" card from reports.original_files. Saved a
// storage list() call per page load. If we ever want that panel back,
// the data shape is reports.original_files (Array<{name, pages, size_kb}>).
// ============================================================================

function TokenBurnCard({
  usage,
}: {
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    estimated_input_tokens?: number;
    model?: string;
    files_uploaded?: number;
    files_skipped?: Array<{ filename: string; reason: string }>;
  };
}) {
  const hasActual = usage.input_tokens != null;
  const displayInput =
    usage.input_tokens?.toLocaleString() ??
    (usage.estimated_input_tokens != null
      ? `~${usage.estimated_input_tokens.toLocaleString()} est.`
      : ",");
  const displayOutput = usage.output_tokens?.toLocaleString() ?? ",";
  const displayCost = hasActual
    ? estimateUsd(usage.input_tokens, usage.output_tokens)
    : usage.estimated_input_tokens != null
      ? `~${estimateUsd(usage.estimated_input_tokens, 5000)} est.`
      : ",";

  return (
    <section className="bg-slate-900 rounded-2xl p-5 text-white text-sm space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-slate-100 text-base">
          Analysis cost
          {!hasActual && usage.estimated_input_tokens != null && (
            <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full">
              Estimate · not consumed
            </span>
          )}
          <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full">
            Dev
          </span>
        </h2>
        <span className="text-xs text-slate-400 font-mono">{usage.model ?? ","}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <Stat label="Input tokens" value={displayInput} />
        <Stat label="Output tokens" value={displayOutput} />
        <Stat label="Est. cost" value={displayCost} highlight />
        <Stat label="Files used" value={String(usage.files_uploaded ?? ",")} />
      </div>
      {usage.files_skipped && usage.files_skipped.length > 0 && (
        <details className="text-xs text-slate-300">
          <summary className="cursor-pointer hover:text-white">
            {usage.files_skipped.length} file(s) skipped
          </summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc text-slate-400">
            {usage.files_skipped.map((f, i) => (
              <li key={i}>
                <span className="font-mono text-slate-300">{f.filename}</span>, {f.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function estimateUsd(
  input: number | undefined,
  output: number | undefined,
): string {
  if (input == null || output == null) return ",";
  const cost = (input / 1_000_000) * 3 + (output / 1_000_000) * 15;
  return `$${cost.toFixed(4)}`;
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p
        className={`text-2xl font-bold ${
          highlight ? "text-amber-300" : "text-white"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">
        {label}
      </p>
    </div>
  );
}


function StatusPill({ status }: { status: string }) {
  // qa_pending → "Ready" because the human-QA workflow it was named for
  // doesn't exist yet; nothing transitions past this state. See the
  // STATUS_LABEL comment in dashboard/_components/ReportListTable.tsx.
  const map: Record<string, { label: string; tone: string }> = {
    uploaded: { label: "Uploaded", tone: "bg-slate-100 text-slate-700" },
    analyzing: { label: "Analyzing", tone: "bg-indigo-100 text-indigo-700" },
    qa_pending: { label: "Ready", tone: "bg-emerald-100 text-emerald-700" },
    qa_approved: { label: "Ready", tone: "bg-emerald-100 text-emerald-700" },
    delivered: { label: "Delivered", tone: "bg-emerald-100 text-emerald-700" },
    failed: { label: "Failed", tone: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status, tone: "bg-slate-100 text-slate-700" };
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${s.tone}`}
    >
      {s.label}
    </span>
  );
}

function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

// ============================================================================
// Agent-focused summary view, replaces the inline 14-section PDF preview.
// The actual report is downloadable as PDF; this page orients the agent
// around what they need to ACT on:
//   - Strengths to highlight to the buyer
//   - Concerns to surface and discuss
//   - Missing disclosures to chase down
// Action row: Download PDF, Draft email, Add documents.
// Version history collapses old snapshots with explicit affirmation
// before downloading a non-current report.
// ============================================================================

type ReportVersionSnapshot = {
  version_number: number;
  snapshotted_at: string;
  report_data: ReportData | null;
  original_files?: Array<{ name: string; pages: number; size_kb: number }> | null;
  source_file_path?: string | null;
  status?: string | null;
  pdf_blob_path?: string | null;
};

function AgentSummary({
  reportId,
  userId,
  reportData,
  reportName,
  clientName,
  createdAt,
  analysisCompletedAt,
  analysisRunCount,
  lastUpdatedAt,
  versions,
  archived,
  originalFiles,
}: {
  reportId: string;
  userId: string;
  reportData: ReportData;
  reportName: string | null;
  clientName: string | null;
  createdAt: string;
  analysisCompletedAt: string | null;
  // Number of times this report's analysis has been run (original
  // + retries). Renders in the hero info bar as "Run #N" alongside
  // the short Report ID so agents can validate they're looking at
  // the right report and the right analysis revision.
  analysisRunCount: number | null;
  lastUpdatedAt: string | null;
  versions: ReportVersionSnapshot[];
  archived: boolean;
  originalFiles: Array<{
    name: string;
    pages: number;
    size_kb: number;
    uploaded_at?: string | null;
  }>;
}) {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  // Same narrative the PDF cover renders, single source of truth.
  // Used in the new "Talking points for your client" panel below.
  const narrative = composeExecutiveNarrative(reportData);
  const address =
    reportData.property_snapshot?.address?.trim() || "Address not extracted";
  const { strengths, concerns } = composeAgentStrengthsAndConcerns(reportData);
  const missing = reportData.document_inventory?.documents_missing ?? [];
  const grandTotal = reportData.cost_summary?.grand_total ?? null;

  return (
    <section className="space-y-5">
      {/* ----- Hero ---------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-indigo-950 px-6 py-5 text-white">
          {clientName && (
            <div className="text-[10px] font-bold tracking-widest text-amber-300 uppercase mb-1">
              Prepared For · {clientName}
            </div>
          )}
          <h2 className="text-2xl font-bold leading-tight">{address}</h2>
          {reportName && (
            <p className="text-xs text-indigo-200 italic mt-1">
              Internal reference: {reportName}
            </p>
          )}
        </div>
        <div className="px-6 py-3 text-xs text-slate-500 flex flex-wrap gap-x-5 gap-y-1.5 bg-slate-50">
          {/* Report ID + Run number, surfaced so agents can verify
              they're looking at the right report and the right
              analysis revision. The short ID matches what's
              printed on the PDF cover and in the URL bar of the
              share link, so cross-referencing is unambiguous. */}
          <span>
            <span className="font-semibold text-slate-700">Report ID</span>{" "}
            <span className="font-mono text-slate-900">
              {reportId.slice(0, 8)}
            </span>
          </span>
          <span>
            <span className="font-semibold text-slate-700">Version</span>{" "}
            <span className="font-mono text-slate-900">
              Run #{analysisRunCount ?? 1}
            </span>
          </span>
          <span>
            <span className="font-semibold text-slate-700">Created</span>{" "}
            {formatDate(createdAt)}
          </span>
          {analysisCompletedAt && (
            // Rendered via client component so it picks up the
            // BROWSER's locale rather than the Vercel function's UTC.
            <CompletionTimestamp
              iso={analysisCompletedAt}
              label="Analysis completed"
            />
          )}
          {lastUpdatedAt && (
            <span>
              <span className="font-semibold text-slate-700">Last updated</span>{" "}
              {formatDate(lastUpdatedAt)}
            </span>
          )}
          <span>
            <span className="font-semibold text-slate-700">Overall rating</span>{" "}
            {reportData.overall_rating?.label ?? "Unrated"}
          </span>
          {grandTotal && grandTotal.high > 0 && (
            <span>
              <span className="font-semibold text-slate-700">Cost exposure</span>{" "}
              {formatUSD(grandTotal.low)} to {formatUSD(grandTotal.high)}
            </span>
          )}
        </div>
      </div>

      {/* ----- Property snapshot facts table -------------------- */}
      {/* Renders the analyzer's structured property_snapshot fields
          as a labeled fact table. Mirrors the Cowork PDF cover
          (year built + age, sq ft, bed/bath, MLS #, APN, ADU,
          solar, hazard zones, sellers, listing team) so the agent
          sees the same fact panel the buyer sees on /r/<code>.
          Skipped silently when no facts have populated. */}
      <PropertySnapshotFactsSection
        snapshot={reportData.property_snapshot}
      />

      {/* ----- Update banner ------------------------------------- */}
      {reportData.update_note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 flex items-start gap-3">
          <span className="text-amber-500 text-base leading-none mt-0.5">↻</span>
          <span>{reportData.update_note}</span>
        </div>
      )}

      {/* ----- Talking points (above Strengths / Concerns) ------ */}
      {/* 2-3 narrative paragraphs derived from the same helper that
          drives the PDF cover's Executive Summary, so what the
          agent reads here matches what the PDF says verbatim. The
          per-section flag button lets agents flag a wonky narrative
          paragraph the same way they flag a wonky finding. Flag
          severity is "summary" so /admin/finding-flags can filter
          summary-data feedback apart from per-finding feedback. */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
            Talking points for your client
          </h3>
          <FindingFlagButton
            reportId={reportId}
            findingTitle={`Talking points (${narrative.join(" ").slice(0, 200)}${narrative.join(" ").length > 200 ? "..." : ""})`}
            findingSeverity="summary"
          />
        </div>
        <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
          {narrative.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>

      {/* ----- Strengths / Concerns dual block -------------------
          Each row with a sourced finding (findingTitle non-null)
          links to the corresponding finding card in the Critical
          Findings View further down the page via a hash anchor.
          The link icon (chain-style) is visible by default so the
          agent knows the row IS clickable; rows derived from
          structured non-finding data (hazard zones, package
          completeness, etc.) render without the icon since there's
          no finding card to jump to. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <h3 className="text-xs font-bold tracking-widest text-emerald-800 uppercase mb-3">
            Top Strengths
          </h3>
          <ol className="space-y-2.5 text-sm text-emerald-950">
            {strengths.map((s, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <span className="font-bold text-emerald-700 shrink-0">
                  {i + 1}.
                </span>
                <span className="flex-1">{s.text}</span>
                {s.findingTitle ? (
                  <a
                    href={`#finding-${slugifyFindingTitle(s.findingTitle)}`}
                    className="shrink-0 text-emerald-700 hover:text-emerald-900"
                    title="Jump to the detailed finding below"
                    aria-label="View finding details"
                  >
                    <LinkIcon />
                  </a>
                ) : null}
                {/* Per-strength flag. The flag's "finding_title"
                    column captures the strength text itself so
                    triage can read what was flagged without
                    clicking through. Severity = "strength" so
                    /admin/finding-flags can filter by surface. */}
                <FindingFlagButton
                  reportId={reportId}
                  findingTitle={s.text}
                  findingSeverity="strength"
                />
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <h3 className="text-xs font-bold tracking-widest text-red-800 uppercase mb-3">
            Top Concerns
          </h3>
          <ol className="space-y-2.5 text-sm text-red-950">
            {concerns.map((c, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <span className="font-bold text-red-700 shrink-0">
                  {i + 1}.
                </span>
                <span className="flex-1">
                  {c.text}
                  {c.triggeredRule && (
                    // Small inline badge so agents can see WHY a
                    // finding was upgraded to Critical. Hidden when
                    // the finding's severity came from cost or
                    // active-hazard criteria rather than an
                    // always-Critical rule.
                    <span
                      className="ml-2 inline-block text-[10px] font-mono uppercase tracking-wider bg-red-200/70 text-red-900 px-1.5 py-0.5 rounded align-middle"
                      title="An always-CRITICAL rule fired on this finding (FPE panel, polybutylene, etc.). Sanity-check the underlying document to confirm."
                    >
                      Rule: {c.triggeredRule}
                    </span>
                  )}
                </span>
                {c.findingTitle ? (
                  <a
                    href={`#finding-${slugifyFindingTitle(c.findingTitle)}`}
                    className="shrink-0 text-red-700 hover:text-red-900"
                    title="Jump to the detailed finding below"
                    aria-label="View finding details"
                  >
                    <LinkIcon />
                  </a>
                ) : null}
                {/* Per-concern flag. Severity = "concern" so
                    /admin/finding-flags can filter feedback on
                    the punchline-cards apart from per-finding
                    feedback. Underlying finding's
                    actual severity is captured on its own card. */}
                <FindingFlagButton
                  reportId={reportId}
                  findingTitle={c.text}
                  findingSeverity="concern"
                />
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* ----- Cross-document consistency findings -------------- */}
      {/* Discrepancies BETWEEN documents in the package: TDS county
          vs prelim title, missing referenced AVID, HOA minutes vs
          balance sheet, MLS public-remarks vs listing field, etc.
          Often contract-level issues the agent should fix before
          signature, so this section renders ABOVE the critical
          findings on the dashboard. Mirrors the public report's
          CrossDocumentSection but with the agent's "actionable
          first" framing in the section header. */}
      <CrossDocumentDashboardSection
        reportId={reportId}
        findings={reportData.cross_document_findings ?? null}
      />

      {/* ----- Critical findings with click-to-source ----------- */}
      {/* Lives only on the agent's dashboard (not the public /r/{code}
          view) because the source PDFs are private. Click any "Source:"
          citation to open a side panel with the underlying inspection
          / disclosure document jumped to the cited page. */}
      <CriticalFindingsView
        reportId={reportId}
        findings={reportData.critical_findings ?? []}
      />

      {/* ----- Moderate findings (with flag affordances) -------- */}
      {/* The agent dashboard previously rendered only critical
          findings as cards (moderates lived only on the public
          report). While in beta the founder wants every finding
          flaggable so any quality regression gets reported back.
          Each moderate row gets the same flag-button treatment as
          the critical cards. */}
      <ModerateFindingsDashboardSection
        reportId={reportId}
        findings={reportData.moderate_findings ?? []}
      />

      {/* ----- Cost summary (line items + grand total) ----------- */}
      {/* Schema's cost_summary.line_items grouped by category +
          the grand_total bold footer. Mirrors what the public
          report renders so the agent reviews the same breakdown
          the buyer will see. Collapsed by default to keep the
          dashboard scroll height manageable. */}
      <CostSummaryDashboardSection
        costSummary={reportData.cost_summary}
      />

      {/* ----- Permit & compliance review ------------------------ */}
      {/* Schema's permit_compliance summary + structured findings.
          Pulls non-obvious permit gaps (unpermitted ADUs,
          unpermitted living-area conversions, balcony inspection
          gaps under SB 326). */}
      <PermitComplianceDashboardSection
        reportId={reportId}
        permitCompliance={reportData.permit_compliance}
      />

      {/* ----- Insurance & lender risk --------------------------- */}
      {/* Schema's insurance_lender_risk block, was rendered nowhere
          on the dashboard before. Surfaces lender concerns that
          can stall closing even on a clean property. */}
      <InsuranceLenderDashboardSection
        insuranceLenderRisk={reportData.insurance_lender_risk}
      />

      {/* ----- Outstanding questions to ask the listing agent --- */}
      {/* Schema's outstanding_questions flat string[] rendered as
          a numbered list. Mirrors Cowork Section 13. */}
      <OutstandingQuestionsDashboardSection
        questions={reportData.outstanding_questions ?? []}
      />

      {/* ----- Document inventory (analyzer's structured view) -- */}
      {/* Distinct from "Uploaded documents" further down which is
          the FILE list; this is the analyzer's read of what a CA
          disclosure package SHOULD contain vs. what's actually
          here, with per-doc notes / status / date when the
          analyzer extracted them. */}
      <DocumentInventoryDashboardSection
        inventory={reportData.document_inventory}
      />

      {/* ----- Missing disclosures ------------------------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Missing from standard CA disclosure package
        </h3>
        {missing.length === 0 ? (
          <p className="text-sm text-emerald-700 flex items-center gap-2">
            <span className="text-emerald-500 text-base leading-none">✓</span>
            Package appears complete.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm text-slate-700">
            {missing.map((m, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-red-500 shrink-0">·</span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ----- Uploaded documents (collapsed by default) ---------
          Real CA disclosure packages commonly run 40+ PDFs;
          rendering all of them expanded made this section
          dominate the scroll height of the page. Now collapsed
          into a <details> with the summary showing the count, so
          agents who don't need to manage files can scroll past
          and agents who DO need to remove a file click to expand. */}
      {originalFiles.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 hover:text-slate-900">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
                Uploaded documents
              </h3>
              <span className="text-xs text-slate-500">
                {originalFiles.length} file
                {originalFiles.length === 1 ? "" : "s"}
              </span>
            </div>
            <span
              className="text-slate-400 group-open:rotate-90 transition-transform text-base leading-none"
              aria-hidden="true"
            >
              &rsaquo;
            </span>
          </summary>
          <ul className="divide-y divide-slate-100 text-sm mt-3">
            {originalFiles.map((f) => (
              <li
                key={f.name}
                className="py-2 flex items-center gap-3"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded shrink-0">
                  PDF
                </span>
                <span className="flex-1 min-w-0 truncate text-slate-800">
                  {f.name}
                </span>
                <span className="text-xs text-slate-400 shrink-0">
                  {f.pages > 0 ? `${f.pages} pp` : ""}
                  {f.pages > 0 && f.size_kb > 0 ? " · " : ""}
                  {f.size_kb > 0 ? formatFileSize(f.size_kb) : ""}
                </span>
                <RemoveFileButton
                  reportId={reportId}
                  filename={f.name}
                  ageDays={ageDays}
                  isLastRemaining={originalFiles.length === 1}
                />
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 italic mt-3">
            Removing a file triggers a re-analysis on the remaining
            package. The current report is preserved in the version
            history.
          </p>
        </details>
      )}

      {/* ----- Action row (client component for modal state) ---- */}
      <AgentActions
        reportId={reportId}
        userId={userId}
        ageDays={ageDays}
        archived={archived}
      />


      {/* ----- Version history (collapsed by default) ----------- */}
      {versions.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white px-5 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 select-none">
            Version history ({versions.length}{" "}
            {versions.length === 1 ? "snapshot" : "snapshots"})
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {versions
              .slice()
              .sort((a, b) => b.version_number - a.version_number)
              .map((v) => (
                <li
                  key={v.version_number}
                  className="flex items-center justify-between gap-3 py-1.5 border-t border-slate-100 first:border-t-0"
                >
                  <div>
                    <span className="font-semibold text-slate-900">
                      Version {v.version_number}
                    </span>
                    <span className="text-slate-500 ml-2 text-xs">
                      {formatDate(v.snapshotted_at)}
                    </span>
                  </div>
                  <VersionDownloadButton
                    reportId={reportId}
                    versionNumber={v.version_number}
                    snapshottedAt={v.snapshotted_at}
                    currentUpdatedAt={lastUpdatedAt}
                  />

                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500 italic">
            Earlier snapshots are preserved when you add documents to this
            report, the current view always reflects the latest re-analysis.
          </p>
        </details>
      )}
    </section>
  );
}

// Dashboard cross-document consistency block. Renders the schema's
// cross_document_findings array between the strengths / concerns
// panel and the critical findings list. Different from the public
// report's CrossDocumentSection in that the agent version is
// always expanded (not collapsed) since the agent's job is to
// triage these BEFORE handing the report to the buyer, and the
// section header explicitly frames them as agent-actionable
// ("Cross-document items to fix before contract"). Returns null
// when the analyzer produced no cross-doc findings, the section
// silently vanishes on legacy reports or clean packages.
function CrossDocumentDashboardSection({
  reportId,
  findings,
}: {
  reportId: string;
  findings: ReportData["cross_document_findings"];
}) {
  if (!findings || findings.length === 0) return null;
  const critCount = findings.filter((f) => f.severity === "critical").length;
  return (
    <section className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
          Cross-document items to fix before contract ({findings.length})
        </h3>
        {critCount > 0 ? (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-red-700 text-white px-2 py-0.5 rounded">
            {critCount} critical
          </span>
        ) : null}
      </div>
      <p className="text-xs text-slate-500 italic mb-3">
        Discrepancies between documents in the package. Often more
        actionable than any single finding because they&apos;re
        contract-level items the listing side needs to correct.
      </p>
      <div className="space-y-3">
        {findings.map((f, i) => {
          const sev = f.severity ?? "moderate";
          const tone =
            sev === "critical"
              ? "border-red-200 bg-red-50/40"
              : sev === "informational"
                ? "border-slate-200 bg-slate-50"
                : "border-amber-200 bg-amber-50";
          const badgeTone =
            sev === "critical"
              ? "bg-red-700 text-white"
              : sev === "informational"
                ? "bg-slate-600 text-white"
                : "bg-amber-500 text-white";
          return (
            <article
              key={i}
              className={`rounded-xl border p-4 ${tone}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <p className="font-bold text-slate-900 text-sm flex-1 min-w-0">
                  {i + 1}. {f.title}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${badgeTone}`}
                  >
                    {sev}
                  </span>
                  <FindingFlagButton
                    reportId={reportId}
                    findingTitle={f.title}
                    findingSeverity={`cross_document_${sev}`}
                  />
                </div>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed mb-2">
                {f.description}
              </p>
              {f.source_docs && f.source_docs.length > 0 ? (
                <p className="text-xs text-slate-600 mb-2">
                  <span className="font-semibold">Documents in tension: </span>
                  {f.source_docs.join(" vs. ")}
                </p>
              ) : null}
              {f.recommended_action ? (
                <p className="text-sm text-slate-700 leading-relaxed">
                  <span className="font-semibold">Recommended action: </span>
                  {f.recommended_action}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// New section components mirroring the public report's structured rendering.
// All use server-side <details> for collapsibility (no client state needed),
// consistent with how "Uploaded documents" already renders on this page.
// ============================================================================

// Property snapshot facts table. Reads the analyzer's structured
// property_snapshot block and renders one row per non-null field.
// Open by default so the agent sees facts at a glance; renders
// nothing when the snapshot is empty.
function PropertySnapshotFactsSection({
  snapshot,
}: {
  snapshot: ReportData["property_snapshot"];
}) {
  const rows: Array<[string, string]> = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value == null) return;
    const v = typeof value === "string" ? value.trim() : String(value);
    if (!v) return;
    rows.push([label, v]);
  };
  push("Property type", snapshot?.property_type ?? null);
  if (snapshot?.unit_number) push("Unit", snapshot.unit_number);
  if (snapshot?.floor != null) push("Floor", String(snapshot.floor));
  if (snapshot?.year_built != null) {
    push(
      "Year built",
      `${snapshot.year_built} (age ${Math.max(0, new Date().getFullYear() - snapshot.year_built)})`,
    );
  }
  if (snapshot?.square_feet != null) {
    push("Sq ft", `${snapshot.square_feet.toLocaleString()} sq ft`);
  }
  if (snapshot?.bedrooms != null && snapshot?.bathrooms != null) {
    push("Bed / Bath", `${snapshot.bedrooms} bed / ${snapshot.bathrooms} bath`);
  }
  if (snapshot?.list_price != null) {
    const relistHistory = (snapshot as { relist_history?: unknown })
      .relist_history as Array<{
      date: string;
      old_price: number | null;
      new_price: number;
      percent_change: number | null;
    }> | null | undefined;
    let listPriceText = formatUSD(snapshot.list_price);
    if (Array.isArray(relistHistory) && relistHistory.length >= 2) {
      const latest = relistHistory[relistHistory.length - 1];
      const previous = relistHistory[relistHistory.length - 2];
      if (
        latest &&
        previous &&
        previous.new_price != null &&
        previous.new_price > latest.new_price
      ) {
        listPriceText = `${formatUSD(latest.new_price)} (cut from ${formatUSD(previous.new_price)} on ${latest.date})`;
      }
    }
    push("List price", listPriceText);
  }
  if (snapshot?.days_on_market != null) {
    push("Days on market", `${snapshot.days_on_market} days`);
  }
  push("MLS #", snapshot?.mls_number ?? null);
  push("APN", snapshot?.apn ?? null);
  if (snapshot?.hoa_dues_monthly != null) {
    push("HOA dues", `${formatUSD(snapshot.hoa_dues_monthly)} / month`);
  }
  push("Parking", snapshot?.parking ?? null);
  push("Market region", snapshot?.market_region ?? null);
  // Cowork-parity fields populated by the 5f45a99 prompt overhaul.
  push(
    "Hazard zones",
    (snapshot as { hazard_zone_summary?: string | null } | undefined)
      ?.hazard_zone_summary ?? null,
  );
  push(
    "FEMA flood zone",
    (snapshot as { fema_flood_zone?: string | null } | undefined)
      ?.fema_flood_zone ?? null,
  );
  push(
    "Solar",
    (snapshot as { solar_status?: string | null } | undefined)?.solar_status ??
      null,
  );
  push(
    "ADU",
    (snapshot as { adu_status?: string | null } | undefined)?.adu_status ??
      null,
  );
  push(
    "Sellers",
    (snapshot as { named_sellers?: string | null } | undefined)
      ?.named_sellers ?? null,
  );
  push(
    "Listing team",
    (snapshot as { named_listing_team?: string | null } | undefined)
      ?.named_listing_team ?? null,
  );
  push(
    "Package prepared by",
    (snapshot as { disclosure_prep_service?: string | null } | undefined)
      ?.disclosure_prep_service ?? null,
  );
  push(
    "Package date",
    (snapshot as { package_date?: string | null } | undefined)?.package_date ??
      null,
  );

  if (rows.length === 0) return null;

  return (
    <details
      className="rounded-2xl border border-slate-200 bg-white px-5 py-4 group"
      open
    >
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 hover:text-slate-900 mb-3">
        <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
          Property snapshot
        </h3>
        <span
          className="text-slate-400 group-open:rotate-90 transition-transform text-base leading-none"
          aria-hidden="true"
        >
          &rsaquo;
        </span>
      </summary>
      <dl className="divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="py-2 grid grid-cols-3 sm:grid-cols-4 gap-2 text-sm"
          >
            <dt className="font-semibold text-slate-700 col-span-1">{label}</dt>
            <dd className="text-slate-700 col-span-2 sm:col-span-3 break-words">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// Cost summary section. Renders cost_summary.line_items grouped by
// category, plus a bold grand-total footer. Collapsed by default.
function CostSummaryDashboardSection({
  costSummary,
}: {
  costSummary: ReportData["cost_summary"] | null | undefined;
}) {
  if (!costSummary) return null;
  const lineItems = costSummary.line_items ?? [];
  const grand = costSummary.grand_total;
  const hasGrand = grand && (grand.low > 0 || grand.high > 0);
  if (lineItems.length === 0 && !hasGrand) return null;

  return (
    <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 group">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 hover:text-slate-900 mb-3">
        <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
          Cost summary
        </h3>
        <span
          className="text-slate-400 group-open:rotate-90 transition-transform text-base leading-none"
          aria-hidden="true"
        >
          &rsaquo;
        </span>
      </summary>
      {lineItems.length > 0 ? (
        <div className="space-y-4">
          {lineItems.map((group, gi) => (
            <div key={gi}>
              <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mb-1">
                {group.category}
              </p>
              <ul className="divide-y divide-slate-100">
                {group.items.map((it, ii) => (
                  <li
                    key={ii}
                    className="py-1.5 flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="text-slate-700 flex-1 min-w-0 break-words">
                      {it.label}
                    </span>
                    <span className="text-slate-700 tabular-nums shrink-0">
                      {formatUSD(it.cost.low)} to {formatUSD(it.cost.high)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {hasGrand ? (
        <div className="mt-4 pt-3 border-t-2 border-indigo-200 flex items-center justify-between gap-3 text-sm font-bold text-indigo-950">
          <span className="uppercase tracking-wider text-xs">
            Total potential exposure
          </span>
          <span className="tabular-nums text-base">
            {formatUSD(grand.low)} to {formatUSD(grand.high)}
          </span>
        </div>
      ) : null}
    </details>
  );
}

// Permit & compliance review section.
function PermitComplianceDashboardSection({
  reportId,
  permitCompliance,
}: {
  reportId: string;
  permitCompliance: ReportData["permit_compliance"] | null | undefined;
}) {
  if (!permitCompliance) return null;
  const summary = permitCompliance.summary?.trim() ?? "";
  const findings = permitCompliance.findings ?? [];
  if (!summary && findings.length === 0) return null;

  return (
    <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 group">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 hover:text-slate-900 mb-3">
        <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
          Permit &amp; compliance review
        </h3>
        <span
          className="text-slate-400 group-open:rotate-90 transition-transform text-base leading-none"
          aria-hidden="true"
        >
          &rsaquo;
        </span>
      </summary>
      {summary ? (
        <p className="text-sm text-slate-700 leading-relaxed mb-3">
          {summary}
        </p>
      ) : null}
      {findings.length > 0 ? (
        <ul className="divide-y divide-slate-100 mt-2">
          {findings.map((f, i) => (
            <li key={i} className="py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900 text-sm flex-1 min-w-0">
                  {f.title}
                </p>
                <FindingFlagButton
                  reportId={reportId}
                  findingTitle={f.title}
                  findingSeverity={`permit_${f.severity ?? "moderate"}`}
                />
              </div>
              {f.description ? (
                <p className="text-sm text-slate-700 mt-1">{f.description}</p>
              ) : null}
              {f.source ? (
                <p className="text-xs text-slate-500 italic mt-1">
                  Source: {f.source}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

// Moderate findings section, with per-finding flag affordances.
// Previously the dashboard only rendered critical findings as cards
// and the moderate list lived only on the public report. The founder
// wants flags on EVERY finding while we're in beta so quality
// regressions surface across the board.
function ModerateFindingsDashboardSection({
  reportId,
  findings,
}: {
  reportId: string;
  findings: ReportData["moderate_findings"];
}) {
  if (!findings || findings.length === 0) return null;
  return (
    <details className="rounded-2xl border border-amber-200 bg-amber-50/40 px-5 py-4 group" open>
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 hover:text-slate-900 mb-3">
        <h3 className="text-xs font-bold tracking-widest text-amber-800 uppercase">
          Moderate findings ({findings.length})
        </h3>
        <span
          className="text-slate-400 group-open:rotate-90 transition-transform text-base leading-none"
          aria-hidden="true"
        >
          &rsaquo;
        </span>
      </summary>
      <ul className="divide-y divide-amber-100 mt-1">
        {findings.map((f, i) => (
          <li key={i} className="py-2.5">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className="font-semibold text-slate-900 text-sm flex-1 min-w-0">
                {i + 1}. {f.title}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded">
                  {f.severity || "moderate"}
                </span>
                <FindingFlagButton
                  reportId={reportId}
                  findingTitle={f.title}
                  findingSeverity={f.severity || "moderate"}
                />
              </div>
            </div>
            {f.description ? (
              <p className="text-sm text-slate-700 mt-1">{f.description}</p>
            ) : null}
            {f.source ? (
              <p className="text-xs text-slate-500 italic mt-1">
                Source: {f.source}
              </p>
            ) : null}
            {f.cost_estimate &&
            (f.cost_estimate.low > 0 || f.cost_estimate.high > 0) ? (
              <p className="text-xs text-slate-600 mt-1">
                <span className="font-semibold">Est. cost:</span>{" "}
                {formatUSD(f.cost_estimate.low)} to{" "}
                {formatUSD(f.cost_estimate.high)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

// Insurance & lender risk section.
function InsuranceLenderDashboardSection({
  insuranceLenderRisk,
}: {
  insuranceLenderRisk: ReportData["insurance_lender_risk"] | null | undefined;
}) {
  if (!insuranceLenderRisk) return null;
  const summary = insuranceLenderRisk.summary?.trim() ?? "";
  const insurance = insuranceLenderRisk.insurance_concerns ?? [];
  const lender = insuranceLenderRisk.lender_concerns ?? [];
  if (!summary && insurance.length === 0 && lender.length === 0) return null;

  return (
    <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 group">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 hover:text-slate-900 mb-3">
        <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
          Insurance &amp; lender risk
        </h3>
        <span
          className="text-slate-400 group-open:rotate-90 transition-transform text-base leading-none"
          aria-hidden="true"
        >
          &rsaquo;
        </span>
      </summary>
      {summary ? (
        <p className="text-sm text-slate-700 leading-relaxed">{summary}</p>
      ) : null}
      {insurance.length > 0 ? (
        <>
          <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mt-4 mb-1">
            Insurance concerns
          </p>
          <ul className="space-y-1.5 text-sm text-slate-700">
            {insurance.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-400 shrink-0">·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {lender.length > 0 ? (
        <>
          <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mt-4 mb-1">
            Lender concerns
          </p>
          <ul className="space-y-1.5 text-sm text-slate-700">
            {lender.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-400 shrink-0">·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  );
}

// Outstanding questions to ask the listing agent. Renders the
// schema's outstanding_questions string[] as a numbered list.
function OutstandingQuestionsDashboardSection({
  questions,
}: {
  questions: string[];
}) {
  if (!questions || questions.length === 0) return null;
  return (
    <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 group">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 hover:text-slate-900 mb-3">
        <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
          Questions to ask the listing agent ({questions.length})
        </h3>
        <span
          className="text-slate-400 group-open:rotate-90 transition-transform text-base leading-none"
          aria-hidden="true"
        >
          &rsaquo;
        </span>
      </summary>
      <ol className="space-y-2.5 text-sm text-slate-700 list-decimal list-inside">
        {questions.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ol>
    </details>
  );
}

// Document inventory (analyzer's structured view). Distinct from
// the "Uploaded documents" file-management section further down,
// this is the analyzer's read of package completeness with per-doc
// status / date / notes when available.
function DocumentInventoryDashboardSection({
  inventory,
}: {
  inventory: ReportData["document_inventory"] | null | undefined;
}) {
  if (!inventory) return null;
  const provided = inventory.documents_provided ?? [];
  const missing = inventory.documents_missing ?? [];
  if (provided.length === 0 && missing.length === 0) return null;

  return (
    <details className="rounded-2xl border border-slate-200 bg-white px-5 py-4 group">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 hover:text-slate-900 mb-3">
        <h3 className="text-xs font-bold tracking-widest text-slate-700 uppercase">
          Document inventory ({provided.length} provided, {missing.length}{" "}
          missing)
        </h3>
        <span
          className="text-slate-400 group-open:rotate-90 transition-transform text-base leading-none"
          aria-hidden="true"
        >
          &rsaquo;
        </span>
      </summary>
      {provided.length > 0 ? (
        <>
          <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mb-1.5">
            Provided
          </p>
          <ul className="divide-y divide-slate-100 mb-4">
            {provided.map((d, i) => {
              const rawStatus =
                (d as { status?: string | null }).status?.trim() || null;
              const statusTone =
                rawStatus && /stale|partial|coversheet/i.test(rawStatus)
                  ? "text-amber-700 bg-amber-50"
                  : "text-emerald-700 bg-emerald-50";
              const statusLabel = rawStatus || "Provided";
              const notes =
                (d as { notes?: string | null }).notes?.trim() || null;
              return (
                <li key={i} className="py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-700 flex-1 min-w-0 break-words font-medium">
                      {d.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${statusTone}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {notes ? (
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {notes}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {missing.length > 0 ? (
        <>
          <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mb-1.5">
            Still owed
          </p>
          <ul className="divide-y divide-slate-100">
            {missing.map((m, i) => (
              <li
                key={i}
                className="py-1.5 flex items-start justify-between gap-3 text-sm"
              >
                <span className="text-slate-700 flex-1 min-w-0 break-words">
                  {m}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 px-1.5 py-0.5 rounded shrink-0">
                  Missing
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  );
}

// Render a kilobyte count as KB or MB for the uploaded-documents
// inventory. Keeps the right edge tidy when files have wildly
// different sizes.
function formatFileSize(sizeKb: number): string {
  if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(1)} MB`;
  return `${sizeKb} KB`;
}

// Small chain-link affordance shown next to a strengths/concerns row
// when the row is sourced from a specific finding. Clicking the parent
// <a> jumps the page to the matching finding card (CriticalFindingsView
// renders an id="finding-<slug>" anchor on each one). The icon is
// inline-sized at 1em so it sits cleanly against the surrounding
// 14px text without any explicit width tweaking.
function LinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden="true"
      className="inline-block"
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
