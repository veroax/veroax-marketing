import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalysisRunner } from "./_components/AnalysisRunner";
import { RetryButton } from "./_components/RetryButton";
import { AgentActions } from "./_components/AgentActions";
import { VersionDownloadButton } from "./_components/VersionDownloadButton";
import type { ReportData } from "@/lib/anthropic/schema";

type Params = Promise<{ id: string }>;

export default async function ReportDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: report } = await supabase
    .from("reports")
    .select("id, status, property_address, source_file_path, report_data, created_at, analysis_completed_at, failure_reason, report_name, client_name, last_updated_at, update_count, versions, original_files")
    .eq("id", id)
    .maybeSingle();
  if (!report) notFound();

  const folder = `${user.id}/${report.id}`;
  const { data: files } = await supabase.storage.from("disclosures").list(folder);
  const pdfs = (files ?? []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
  const sourceGroups = groupSplitFiles(pdfs);

  const reportData = report.report_data as ReportData | null;

  // Pull token/cost-related audit_log rows. We surface partial data even
  // when the analysis didn't complete fully — if Claude succeeded but a
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/dashboard"
            className="text-xs text-gray-500 hover:text-slate-900 mb-2 inline-block"
          >
            ← All reports
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            {report.property_address ??
              reportData?.property_snapshot?.address ??
              "Untitled report"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Created{" "}
            {new Date(report.created_at).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {report.analysis_completed_at && (
              <>
                {" · Analyzed "}
                {new Date(report.analysis_completed_at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Note: the prominent "Download full PDF report" button lives
              inside AgentSummary's action row below. The top-of-page
              chrome only shows the status pill now — duplicating the
              CTA in two places competed for attention. */}
          <StatusPill status={report.status} />
        </div>
      </div>

      {/* Analyzing state — render the client runner that triggers + polls */}
      {report.status === "analyzing" && <AnalysisRunner reportId={report.id} />}

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

      {/* Source documents — always shown */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Source documents ({sourceGroups.length})
        </h2>
        {sourceGroups.length === 0 ? (
          <p className="text-sm text-gray-500">No PDFs found in the report folder.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {sourceGroups.map((group) => (
              <SourceGroupRow key={group.displayName} group={group} />
            ))}
          </ul>
        )}
      </section>

      {/* Agent-focused summary view — replaces the old inline 14-section
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
        />
      )}

      {/* Token burn / cost — dev visibility */}
      {usage && <TokenBurnCard usage={usage} />}
    </div>
  );
}

// Sonnet pricing — $3/M input, $15/M output. Update if we switch models.
// ============================================================================
// Source documents grouping (collapses _part_N.pdf chunks back under
// the user's original filename in the UI)
// ============================================================================

type SourcePart = {
  name: string;
  sizeBytes: number;
  partNumber?: number;
};

type SourceGroup = {
  displayName: string; // e.g. "5._HOA_Docs.pdf"
  parts: SourcePart[];
  totalBytes: number;
};

type StorageFileLike = {
  name: string;
  metadata?: { size?: number | null } | null;
};

function groupSplitFiles(files: StorageFileLike[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();

  for (const f of files) {
    const sizeBytes = f.metadata?.size ?? 0;
    // Match split-suffix pattern: anything ending in _part_<N>.pdf
    const match = f.name.match(/^(.+)_part_(\d+)\.pdf$/i);
    if (match) {
      const baseName = `${match[1]}.pdf`;
      const partNumber = parseInt(match[2], 10);
      const existing = groups.get(baseName);
      if (existing) {
        existing.parts.push({ name: f.name, sizeBytes, partNumber });
        existing.totalBytes += sizeBytes;
      } else {
        groups.set(baseName, {
          displayName: baseName,
          parts: [{ name: f.name, sizeBytes, partNumber }],
          totalBytes: sizeBytes,
        });
      }
    } else {
      groups.set(f.name, {
        displayName: f.name,
        parts: [{ name: f.name, sizeBytes }],
        totalBytes: sizeBytes,
      });
    }
  }

  // Sort parts within each group, and sort groups by displayName.
  const result = Array.from(groups.values());
  for (const g of result) {
    g.parts.sort((a, b) => (a.partNumber ?? 0) - (b.partNumber ?? 0));
  }
  result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return result;
}

function fmtKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

function PdfBadge() {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded shrink-0">
      PDF
    </span>
  );
}

function SourceGroupRow({ group }: { group: SourceGroup }) {
  // Single-part files render as a flat row.
  if (group.parts.length === 1) {
    return (
      <li className="flex items-center gap-3 text-slate-700">
        <PdfBadge />
        <span className="flex-1 truncate">{group.displayName}</span>
        <span className="text-xs text-gray-400">{fmtKb(group.totalBytes)}</span>
      </li>
    );
  }

  // Multi-part files collapse into a native <details> disclosure.
  // Layout choices:
  //  - Arrow lives immediately after the filename so the disclosure
  //    control is anchored to the thing it discloses.
  //  - "N parts" label hidden until expanded — most users don't need
  //    to know the file was split; they just need to see their report.
  //  - File size always visible on the right for consistency with
  //    flat (non-split) source-document rows.
  return (
    <li>
      <details className="group">
        <summary className="flex items-center gap-3 text-slate-700 cursor-pointer list-none hover:bg-slate-50 -mx-1 px-1 py-0.5 rounded">
          <PdfBadge />
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="font-medium truncate">{group.displayName}</span>
            <span className="text-gray-400 text-xs transition-transform group-open:rotate-90 shrink-0 inline-block w-3 text-center select-none">
              ▶
            </span>
            <span className="text-xs text-gray-500 shrink-0 hidden group-open:inline">
              {group.parts.length} parts
            </span>
          </div>
          <span className="text-xs text-gray-400 shrink-0">{fmtKb(group.totalBytes)}</span>
        </summary>
        <ul className="mt-1.5 ml-8 space-y-1 text-xs text-slate-500">
          {group.parts.map((p) => (
            <li key={p.name} className="flex items-center gap-2.5">
              <span className="text-gray-400">part {p.partNumber}</span>
              <span className="flex-1 truncate font-mono text-gray-400">{p.name}</span>
              <span className="text-gray-400">{fmtKb(p.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

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
      : "—");
  const displayOutput = usage.output_tokens?.toLocaleString() ?? "—";
  const displayCost = hasActual
    ? estimateUsd(usage.input_tokens, usage.output_tokens)
    : usage.estimated_input_tokens != null
      ? `~${estimateUsd(usage.estimated_input_tokens, 5000)} est.`
      : "—";

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
        <span className="text-xs text-slate-400 font-mono">{usage.model ?? "—"}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <Stat label="Input tokens" value={displayInput} />
        <Stat label="Output tokens" value={displayOutput} />
        <Stat label="Est. cost" value={displayCost} highlight />
        <Stat label="Files used" value={String(usage.files_uploaded ?? "—")} />
      </div>
      {usage.files_skipped && usage.files_skipped.length > 0 && (
        <details className="text-xs text-slate-300">
          <summary className="cursor-pointer hover:text-white">
            {usage.files_skipped.length} file(s) skipped
          </summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc text-slate-400">
            {usage.files_skipped.map((f, i) => (
              <li key={i}>
                <span className="font-mono text-slate-300">{f.filename}</span> — {f.reason}
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
  if (input == null || output == null) return "—";
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
  const map: Record<string, { label: string; tone: string }> = {
    uploaded: { label: "Uploaded", tone: "bg-slate-100 text-slate-700" },
    analyzing: { label: "Analyzing", tone: "bg-indigo-100 text-indigo-700" },
    qa_pending: { label: "QA pending", tone: "bg-amber-100 text-amber-700" },
    qa_approved: { label: "QA approved", tone: "bg-emerald-100 text-emerald-700" },
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
// Agent-focused summary view — replaces the inline 14-section PDF preview.
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
  lastUpdatedAt,
  versions,
}: {
  reportId: string;
  userId: string;
  reportData: ReportData;
  reportName: string | null;
  clientName: string | null;
  createdAt: string;
  lastUpdatedAt: string | null;
  versions: ReportVersionSnapshot[];
}) {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
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
          <span>
            <span className="font-semibold text-slate-700">Created</span>{" "}
            {formatDate(createdAt)}
          </span>
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
              {formatUSD(grandTotal.low)} – {formatUSD(grandTotal.high)}
            </span>
          )}
        </div>
      </div>

      {/* ----- Update banner ------------------------------------- */}
      {reportData.update_note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 flex items-start gap-3">
          <span className="text-amber-500 text-base leading-none mt-0.5">↻</span>
          <span>{reportData.update_note}</span>
        </div>
      )}

      {/* ----- Strengths / Concerns dual block ------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <h3 className="text-xs font-bold tracking-widest text-emerald-800 uppercase mb-3">
            Top Strengths
          </h3>
          <ol className="space-y-2.5 text-sm text-emerald-950">
            {strengths.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="font-bold text-emerald-700 shrink-0">{i + 1}.</span>
                <span>{s}</span>
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
              <li key={i} className="flex gap-2.5">
                <span className="font-bold text-red-700 shrink-0">{i + 1}.</span>
                <span>{c}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

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

      {/* ----- Action row (client component for modal state) ---- */}
      <AgentActions reportId={reportId} userId={userId} ageDays={ageDays} />


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
            report — the current view always reflects the latest re-analysis.
          </p>
        </details>
      )}
    </section>
  );
}

// Pick three substantive strengths and three concerns from the report
// data — used by the agent summary above the action row and reused
// later as the seed content for the "draft email to client" modal.
function composeAgentStrengthsAndConcerns(report: ReportData): {
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
