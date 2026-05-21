import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalysisRunner } from "./_components/AnalysisRunner";
import { RetryButton } from "./_components/RetryButton";
import type {
  ReportData,
  Finding,
  Severity,
  Confidence,
  CostRange,
} from "@/lib/anthropic/schema";

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
    .select(
      "id, status, property_address, source_file_path, report_data, created_at, analysis_completed_at, failure_reason",
    )
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
        <StatusPill status={report.status} />
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
          {sourceGroups.some((g) => g.parts.length > 1) && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              · large files split for processing
            </span>
          )}
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

      {/* Token burn / cost — dev visibility */}
      {usage && <TokenBurnCard usage={usage} />}

      {/* Rendered report */}
      {reportData && <RenderedReport data={reportData} />}
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
  // Arrow is on the right (after the parts count) to keep the visual
  // hierarchy quiet — collapsible disclosure controls trailing is the
  // more common modern pattern.
  return (
    <li>
      <details className="group">
        <summary className="flex items-center gap-3 text-slate-700 cursor-pointer list-none hover:bg-slate-50 -mx-1 px-1 py-0.5 rounded">
          <PdfBadge />
          <span className="flex-1 truncate font-medium">{group.displayName}</span>
          <span className="text-xs text-gray-500">
            {group.parts.length} parts · {fmtKb(group.totalBytes)}
          </span>
          <span className="text-gray-400 text-xs transition-transform group-open:rotate-90 shrink-0 w-3 text-center">
            ▶
          </span>
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

function RenderedReport({ data }: { data: ReportData }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-200">
      {/* Browser chrome */}
      <div className="bg-gray-100 px-4 py-3 flex items-center gap-3 border-b border-gray-200">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 mx-2 bg-white rounded px-3 py-1 text-xs text-gray-400 font-mono truncate">
          Veroax_Disclosure_Analysis_Report.pdf
        </div>
      </div>

      {/* Report body */}
      <div className="bg-[#FAF8F2] p-6 sm:p-10 space-y-8 text-sm">
        <PropertySnapshot data={data} />
        <DocumentInventory data={data} />
        <CompletenessAudit data={data} />
        <FindingsSection
          number="4"
          title="Critical & High-Priority Findings"
          findings={data.critical_findings}
        />
        <FindingsSection
          number="5"
          title="Moderate Findings"
          findings={data.moderate_findings}
        />
        <FindingsSection
          number="6"
          title="Cosmetic Findings"
          findings={data.cosmetic_findings}
        />
        <PermitCompliance data={data} />
        <HoaSection data={data} />
        <EnvironmentalSection data={data} />
        <CostSummary data={data} />
        <NegotiationSection data={data} />
        <InsuranceLenderSection data={data} />
        <OutstandingQuestions data={data} />
        <OverallRating data={data} />
      </div>
    </div>
  );
}

// ============================================================================
// Section renderers
// ============================================================================

function PropertySnapshot({ data }: { data: ReportData }) {
  const p = data.property_snapshot;
  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#C9A84C] mb-0.5">
            Disclosure Analysis Report
          </p>
          <h3 className="text-xl font-bold text-[#191970]">
            {p?.address ?? "Address not extracted"}
          </h3>
          <p className="text-[#4A4A4A] text-xs mt-1">
            {[
              p?.property_type,
              p?.year_built,
              p?.square_feet ? `${p.square_feet.toLocaleString()} sq ft` : null,
              p?.bedrooms ? `${p.bedrooms} bed` : null,
              p?.bathrooms ? `${p.bathrooms} bath` : null,
              p?.market_region,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right text-xs text-[#4A4A4A] space-y-0.5 shrink-0">
          {p?.list_price != null && (
            <p>
              <span className="font-semibold">List Price:</span>{" "}
              {formatUSD(p.list_price)}
            </p>
          )}
          {p?.days_on_market != null && (
            <p>
              <span className="font-semibold">Days on Market:</span>{" "}
              {p.days_on_market}
            </p>
          )}
        </div>
      </div>
      <div className="h-px bg-[#C8C8DC]" />
    </div>
  );
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 rounded-sm overflow-hidden">
      <div className="bg-[#191970] text-[#C9A84C] text-xs font-bold px-3 py-2 uppercase tracking-widest shrink-0">
        Section {number}
      </div>
      <p className="text-white bg-[#191970] font-bold text-sm py-2 pr-4 flex-1">
        {title}
      </p>
    </div>
  );
}

function DocumentInventory({ data }: { data: ReportData }) {
  const inv = data.document_inventory;
  return (
    <div>
      <SectionHeader number="2" title="Document Inventory" />
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border border-[#C8C8DC] rounded bg-white p-4">
          <p className="font-bold text-[#191970] text-xs uppercase tracking-wide mb-2">
            Documents Provided
          </p>
          {inv?.documents_provided?.length ? (
            <ul className="space-y-1 text-xs text-[#1A1A2E]">
              {inv.documents_provided.map((d, i) => (
                <li key={i}>
                  <span className="font-semibold">{d.type}:</span> {d.name}
                  {d.pages ? ` (${d.pages} pp)` : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">None identified.</p>
          )}
        </div>
        <div className="border border-[#C8C8DC] rounded bg-white p-4">
          <p className="font-bold text-[#7A2E2E] text-xs uppercase tracking-wide mb-2">
            Documents Missing
          </p>
          {inv?.documents_missing?.length ? (
            <ul className="space-y-1 text-xs text-[#1A1A2E] list-disc list-inside">
              {inv.documents_missing.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">Package appears complete.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CompletenessAudit({ data }: { data: ReportData }) {
  const c = data.completeness_audit;
  return (
    <div>
      <SectionHeader number="3" title="Disclosure Completeness Audit" />
      <div className="border border-[#C8C8DC] rounded bg-white p-4">
        <p className="text-xs text-[#1A1A2E] leading-relaxed mb-2">
          {c?.summary || "Audit summary not provided."}
        </p>
        {c?.issues?.length ? (
          <ul className="text-xs text-[#1A1A2E] list-disc list-inside space-y-1 mt-2">
            {c.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function FindingsSection({
  number,
  title,
  findings,
}: {
  number: string;
  title: string;
  findings: Finding[] | undefined;
}) {
  if (!findings?.length) {
    return (
      <div>
        <SectionHeader number={number} title={title} />
        <p className="text-xs text-[#4A4A4A] italic px-1">None identified.</p>
      </div>
    );
  }
  return (
    <div>
      <SectionHeader number={number} title={title} />
      <div className="space-y-4">
        {findings.map((f, i) => (
          <FindingCard key={i} finding={f} index={i + 1} />
        ))}
      </div>
    </div>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  return (
    <div className="border border-[#C8C8DC] rounded bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#C8C8DC] gap-3">
        <span className="font-bold text-[#191970] text-sm">
          Issue {index}: {finding.title}
        </span>
        <SeverityBadge severity={finding.severity} />
      </div>
      {finding.description && (
        <div className="px-4 py-3 text-[#1A1A2E] text-xs leading-relaxed italic border-b border-[#C8C8DC] bg-[#FAF8F2]">
          {finding.description}
        </div>
      )}
      <div className="divide-y divide-[#C8C8DC]">
        <Row label="Source" value={finding.source} />
        <Row label="Confidence" value={confidenceLabel(finding.confidence)} />
        <Row label="Est. Cost" value={formatCostRange(finding.cost_estimate)} />
        <Row label="Risk if Ignored" value={finding.risk_if_ignored} />
        <Row label="Recommended Action" value={finding.recommended_action} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] text-xs">
      <div className="px-3 py-2 font-semibold text-[#2E4057] bg-[#F5F2EA]">
        {label}
      </div>
      <div className="px-3 py-2 text-[#1A1A2E]">{value}</div>
    </div>
  );
}

function PermitCompliance({ data }: { data: ReportData }) {
  return (
    <div>
      <SectionHeader number="7" title="Permit History & Code Compliance" />
      <div className="border border-[#C8C8DC] rounded bg-white p-4 mb-3">
        <p className="text-xs text-[#1A1A2E] leading-relaxed">
          {data.permit_compliance?.summary || "No permit summary."}
        </p>
      </div>
      {data.permit_compliance?.findings?.length ? (
        <div className="space-y-3">
          {data.permit_compliance.findings.map((f, i) => (
            <FindingCard key={i} finding={f} index={i + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HoaSection({ data }: { data: ReportData }) {
  const hoa = data.hoa;
  return (
    <div>
      <SectionHeader number="8" title="HOA Status & Health" />
      <div className="border border-[#C8C8DC] rounded bg-white p-4">
        {!hoa?.applicable ? (
          <p className="text-xs text-[#1A1A2E]">
            HOA not applicable to this property.
          </p>
        ) : (
          <>
            <p className="text-xs text-[#1A1A2E] leading-relaxed mb-2">
              {hoa.summary}
            </p>
            {hoa.concerns?.length ? (
              <ul className="text-xs text-[#1A1A2E] list-disc list-inside space-y-1">
                {hoa.concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function EnvironmentalSection({ data }: { data: ReportData }) {
  const env = data.environmental;
  return (
    <div>
      <SectionHeader number="9" title="Environmental & Natural Hazards" />
      <div className="border border-[#C8C8DC] rounded bg-white p-4">
        <p className="text-xs text-[#1A1A2E] leading-relaxed mb-3">
          {env?.summary || "No environmental summary."}
        </p>
        {env?.hazards?.length ? (
          <div className="space-y-2">
            {env.hazards.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <SeverityBadge severity={h.severity} compact />
                <span>
                  <span className="font-semibold">{h.name}:</span> {h.notes}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CostSummary({ data }: { data: ReportData }) {
  const cs = data.cost_summary;
  return (
    <div>
      <SectionHeader number="10" title="Repair Cost Summary" />
      <div className="border border-[#C8C8DC] rounded overflow-hidden bg-white">
        <div className="grid grid-cols-[1fr_180px] bg-[#2E4057] text-white text-xs font-bold">
          <div className="px-4 py-2.5">Item</div>
          <div className="px-4 py-2.5 text-right">Est. Cost Range</div>
        </div>
        {cs?.line_items?.map((cat, ci) => (
          <div key={ci}>
            <div className="grid grid-cols-[1fr_180px] text-xs bg-[#2E4057]/10 font-bold text-[#2E4057] border-t border-[#C8C8DC]">
              <div className="px-4 py-2 uppercase tracking-wide">{cat.category}</div>
              <div />
            </div>
            {cat.items?.map((item, ii) => (
              <div
                key={ii}
                className={`grid grid-cols-[1fr_180px] text-xs border-t border-[#C8C8DC] ${
                  ii % 2 === 0 ? "bg-white" : "bg-[#F5F2EA]"
                }`}
              >
                <div className="px-4 py-2">{item.label}</div>
                <div className="px-4 py-2 text-right">
                  {formatCostRange(item.cost)}
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="grid grid-cols-[1fr_180px] text-xs border-t-2 border-[#191970] bg-[#191970] text-white font-bold">
          <div className="px-4 py-3">TOTAL ESTIMATED REPAIR EXPOSURE</div>
          <div className="px-4 py-3 text-right">
            {formatCostRange(cs?.grand_total)}
          </div>
        </div>
      </div>
    </div>
  );
}

function NegotiationSection({ data }: { data: ReportData }) {
  const n = data.negotiation;
  return (
    <div>
      <SectionHeader number="11" title="Negotiation Leverage" />
      <div className="border border-[#C8C8DC] rounded bg-white p-4">
        <p className="text-xs text-[#1A1A2E] leading-relaxed mb-2">
          {n?.summary || "No negotiation summary."}
        </p>
        {n?.leverage_points?.length ? (
          <ul className="text-xs text-[#1A1A2E] list-disc list-inside space-y-1">
            {n.leverage_points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function InsuranceLenderSection({ data }: { data: ReportData }) {
  const r = data.insurance_lender_risk;
  return (
    <div>
      <SectionHeader number="12" title="Insurance & Lender Risk" />
      <div className="border border-[#C8C8DC] rounded bg-white p-4">
        <p className="text-xs text-[#1A1A2E] leading-relaxed mb-3">
          {r?.summary || "No insurance/lender summary."}
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="font-bold text-[#191970] text-xs uppercase tracking-wide mb-2">
              Insurance Concerns
            </p>
            {r?.insurance_concerns?.length ? (
              <ul className="text-xs text-[#1A1A2E] list-disc list-inside space-y-1">
                {r.insurance_concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">None identified.</p>
            )}
          </div>
          <div>
            <p className="font-bold text-[#191970] text-xs uppercase tracking-wide mb-2">
              Lender Concerns
            </p>
            {r?.lender_concerns?.length ? (
              <ul className="text-xs text-[#1A1A2E] list-disc list-inside space-y-1">
                {r.lender_concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">None identified.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OutstandingQuestions({ data }: { data: ReportData }) {
  return (
    <div>
      <SectionHeader number="13" title="Outstanding Questions" />
      <div className="border border-[#C8C8DC] rounded bg-white p-4">
        {data.outstanding_questions?.length ? (
          <ul className="text-xs text-[#1A1A2E] list-decimal list-inside space-y-1.5">
            {data.outstanding_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">No outstanding questions identified.</p>
        )}
      </div>
    </div>
  );
}

function OverallRating({ data }: { data: ReportData }) {
  const r = data.overall_rating;
  const tone = ratingTone(r?.label);
  return (
    <div>
      <SectionHeader number="14" title="Overall Property Rating" />
      <div className="border border-[#C8C8DC] rounded bg-white p-5 flex flex-col sm:flex-row items-start gap-5">
        <div className="shrink-0">
          <div
            className={`text-white text-sm font-bold px-5 py-3 rounded text-center uppercase tracking-wide whitespace-nowrap ${tone}`}
          >
            {r?.label ?? "Unrated"}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[#1A1A2E] text-xs leading-relaxed">
            {r?.summary || "No summary."}
          </p>
          {r?.contingency_advice && (
            <p className="text-[#4A4A4A] text-xs italic leading-relaxed">
              {r.contingency_advice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Small helpers
// ============================================================================

function SeverityBadge({
  severity,
  compact = false,
}: {
  severity: Severity;
  compact?: boolean;
}) {
  const map: Record<Severity, string> = {
    critical: "bg-[#7A2E2E]",
    high: "bg-[#8B5A2B]",
    moderate: "bg-[#4A6A87]",
    cosmetic: "bg-[#6B7280]",
  };
  return (
    <span
      className={`text-xs font-bold text-white px-3 py-1 rounded-sm uppercase tracking-wide ${map[severity]} ${
        compact ? "py-0.5 px-1.5 text-[10px]" : ""
      }`}
    >
      {severity}
    </span>
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

function formatCostRange(r: CostRange | null | undefined): string {
  if (!r) return "—";
  if (r.low === r.high) return formatUSD(r.low);
  return `${formatUSD(r.low)} – ${formatUSD(r.high)}`;
}

function confidenceLabel(c: Confidence): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function ratingTone(label: ReportData["overall_rating"]["label"] | undefined): string {
  switch (label) {
    case "Excellent":
      return "bg-emerald-600";
    case "Good":
      return "bg-emerald-700";
    case "Acceptable":
      return "bg-[#4A6A87]";
    case "Significant Concerns":
      return "bg-[#8B5A2B]";
    case "Walk Away":
      return "bg-[#7A2E2E]";
    default:
      return "bg-slate-500";
  }
}
