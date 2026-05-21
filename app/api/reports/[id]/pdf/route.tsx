import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import {
  ReportPDF,
  type AgentBranding,
  type OriginalFile,
} from "@/lib/pdf-render/ReportPDF";
import type { ReportData } from "@/lib/anthropic/schema";

// Streams a downloadable PDF for a finished report. Auth-gated by the
// user-scoped supabase client; only the owner can fetch its PDF.
// Renders to a Buffer (simpler than streaming) and returns the bytes
// directly — fast enough for our document sizes (typically <300 KB).

export const dynamic = "force-dynamic";
// PDF rendering can take a few seconds for long reports.
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

  // ?version=N — render a previously-snapshotted version instead of the
  // current report. The frontend wraps this URL with a confirmation
  // modal so the agent has to explicitly affirm they're downloading a
  // superseded version. Server still validates the param + bounds.
  const url = new URL(request.url);
  const versionParam = url.searchParams.get("version");
  const requestedVersion =
    versionParam && /^\d+$/.test(versionParam) ? Number(versionParam) : null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response("Not authenticated.", { status: 401 });
    }

    const { data: report, error } = await supabase
      .from("reports")
      .select("id, status, property_address, report_data, original_files, report_name, client_name, versions")
      .eq("id", reportId)
      .maybeSingle();
    if (error || !report) {
      return new Response("Report not found.", { status: 404 });
    }
    if (!report.report_data) {
      return new Response(
        "Report has no analysis data yet — wait for the analysis to finish before downloading.",
        { status: 409 },
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, brokerage, dre_license, brokerage_dre, phone")
      .eq("id", user.id)
      .maybeSingle();

    const agent: AgentBranding = {
      fullName: profile?.full_name ?? null,
      brokerage: profile?.brokerage ?? null,
      dreLicense: profile?.dre_license ?? null,
      brokerageDre:
        (profile as { brokerage_dre?: string | null } | null)
          ?.brokerage_dre ?? null,
      phone: profile?.phone ?? null,
      email: user.email ?? null,
    };

    // If a version was requested, swap in the snapshotted data
    // (report_data + original_files) from versions[version_number].
    // The current row still drives identity fields (report_name,
    // client_name, agent profile) because those are owned by the
    // agent today, not the historical snapshot.
    type VersionSnapshot = {
      version_number: number;
      snapshotted_at: string;
      report_data: ReportData | null;
      original_files?: unknown;
      source_file_path?: string | null;
      status?: string | null;
    };
    let snapshotInUse: VersionSnapshot | null = null;
    if (requestedVersion !== null) {
      const versions = Array.isArray(
        (report as { versions?: unknown }).versions,
      )
        ? ((report as { versions: VersionSnapshot[] }).versions)
        : [];
      const match = versions.find((v) => v?.version_number === requestedVersion);
      if (!match) {
        return new Response(
          `Version ${requestedVersion} not found for this report.`,
          { status: 404 },
        );
      }
      if (!match.report_data) {
        return new Response(
          `Version ${requestedVersion} has no report data — it was snapshotted before the first analysis completed.`,
          { status: 409 },
        );
      }
      snapshotInUse = match;
    }

    const reportData = (snapshotInUse?.report_data ?? report.report_data) as ReportData;
    // Source of truth for the cover address is the disclosure documents
    // themselves (property_snapshot.address). property_address is now
    // deprecated as user-input — we only keep it as a last-resort
    // fallback for legacy reports that pre-date the new upload form.
    const propertyAddress =
      reportData.property_snapshot?.address ??
      report.property_address ??
      "Disclosure Analysis";

    const reportName =
      typeof (report as { report_name?: unknown }).report_name === "string"
        ? ((report as { report_name?: string }).report_name as string)
        : null;
    const clientName =
      typeof (report as { client_name?: unknown }).client_name === "string"
        ? ((report as { client_name?: string }).client_name as string)
        : null;

    // original_files is captured in /finalize as the canonical
    // pre-split file inventory. Tolerate odd legacy shapes by passing
    // through only entries that match the expected schema. When
    // rendering a historical snapshot, use the snapshot's frozen
    // inventory.
    const originalFilesRaw = (
      snapshotInUse?.original_files ?? report.original_files
    ) as unknown;
    const originalFiles: OriginalFile[] | null = Array.isArray(originalFilesRaw)
      ? (originalFilesRaw as unknown[])
          .filter(
            (e): e is OriginalFile =>
              typeof e === "object" &&
              e !== null &&
              typeof (e as { name?: unknown }).name === "string",
          )
          .map((e) => ({
            name: (e as OriginalFile).name,
            pages: Number((e as OriginalFile).pages) || 0,
            size_kb: Number((e as OriginalFile).size_kb) || 0,
          }))
      : null;

    const buffer = await renderToBuffer(
      <ReportPDF
        report={reportData}
        property={propertyAddress}
        agent={agent}
        reportId={reportId}
        generatedAt={new Date()}
        originalFiles={originalFiles}
        reportName={reportName}
        clientName={clientName}
      />,
    );

    const filename = filenameForReport(
      propertyAddress,
      snapshotInUse?.version_number ?? null,
    );
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    // Surface the actual error so we can diagnose. PDF render failures
    // are usually programmer errors (invalid props, missing fields)
    // rather than security-sensitive — safe to expose during dev.
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[pdf] render failed:", err);
    return new Response(
      JSON.stringify(
        {
          error: "PDF render failed",
          message,
          stack: stack?.split("\n").slice(0, 12),
        },
        null,
        2,
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

function filenameForReport(
  propertyAddress: string,
  versionNumber: number | null,
): string {
  const safe = propertyAddress
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 80);
  const base = safe || "Veroax_Report";
  const versionSuffix =
    versionNumber !== null ? `_v${versionNumber}_archived` : "";
  return `${base}_Disclosure_Analysis${versionSuffix}.pdf`;
}
