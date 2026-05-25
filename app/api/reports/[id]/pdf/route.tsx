import { renderToBuffer } from "@react-pdf/renderer";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  ReportPDF,
  type OriginalFile,
} from "@/lib/pdf-render/ReportPDF";
import {
  resolveReportBranding,
  type BrokerageBranding,
  type TeamBranding,
} from "@/lib/pdf-render/branding";
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
      .select("id, status, property_address, report_data, original_files, report_name, client_name, versions, created_at, watermarked, credit_source, brokerage_id, team_id")
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
      .select("full_name, brokerage, dre_license, brokerage_dre, phone, display_email, brokerage_logo_url, headshot_url, brand_accent_hex, tagline, website_url, office_address")
      .eq("id", user.id)
      .maybeSingle();

    // Profile is a hard precondition for download. Name / DRE /
    // brokerage are printed on every cover; blanks here would make
    // the PDF look unfinished. 412 surfaces a clear, actionable error
    // pointing the agent at /dashboard/settings.
    const missing: string[] = [];
    if (!profile?.full_name?.trim()) missing.push("full name");
    if (!profile?.dre_license?.trim()) missing.push("DRE license");
    if (!profile?.brokerage?.trim()) missing.push("brokerage");
    if (missing.length > 0) {
      return new Response(
        `Complete your agent profile before downloading reports — missing ${missing.join(", ")}. Visit /dashboard/settings to add them.`,
        { status: 412 },
      );
    }

    // Resolve brokerage + team branding overrides from the report's
    // attribution columns (added in migration 0021). The override
    // hierarchy lives in lib/pdf-render/branding.ts: team logo/accent
    // wins, then brokerage logo/accent, then the agent's profile.
    // Solo + Pro reports have null brokerage_id + team_id; the
    // resolver falls through cleanly to the agent's profile.
    const reportBrokerageId =
      (report as { brokerage_id?: string | null }).brokerage_id ?? null;
    const reportTeamId =
      (report as { team_id?: string | null }).team_id ?? null;
    let brokerageBranding: BrokerageBranding | null = null;
    let teamBranding: TeamBranding | null = null;
    if (reportBrokerageId || reportTeamId) {
      const adminClient = createServiceRoleClient();
      if (reportBrokerageId) {
        const { data: brokerageRow } = await adminClient
          .from("brokerages")
          .select("name, dre_license, logo_url, brand_accent_hex")
          .eq("id", reportBrokerageId)
          .maybeSingle();
        brokerageBranding = brokerageRow as BrokerageBranding | null;
      }
      if (reportTeamId) {
        const { data: teamRow } = await adminClient
          .from("teams")
          .select("name, logo_url, brand_accent_hex")
          .eq("id", reportTeamId)
          .maybeSingle();
        teamBranding = teamRow as TeamBranding | null;
      }
    }

    const agent = resolveReportBranding({
      profile: profile as Parameters<typeof resolveReportBranding>[0]["profile"],
      brokerage: brokerageBranding,
      team: teamBranding,
      authEmail: user.email ?? null,
    });

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
    // Legacy reports persisted original_files without uploaded_at.
    // Fall back to the report's created_at so the new "Uploaded" line
    // in the Document Inventory section always shows a date — original
    // upload predates the per-file timestamp feature.
    const fallbackUploadedAt =
      typeof (report as { created_at?: unknown }).created_at === "string"
        ? ((report as { created_at: string }).created_at)
        : null;
    const originalFiles: OriginalFile[] | null = Array.isArray(originalFilesRaw)
      ? (originalFilesRaw as unknown[])
          .filter(
            (e): e is OriginalFile =>
              typeof e === "object" &&
              e !== null &&
              typeof (e as { name?: unknown }).name === "string",
          )
          .map((e) => {
            const entry = e as OriginalFile & { uploaded_at?: unknown };
            return {
              name: entry.name,
              pages: Number(entry.pages) || 0,
              size_kb: Number(entry.size_kb) || 0,
              uploaded_at:
                typeof entry.uploaded_at === "string"
                  ? entry.uploaded_at
                  : fallbackUploadedAt,
            };
          })
      : null;

    // credit_source drives the PDF chrome tier. Subscription / VIP /
    // null (legacy) reports get full agent branding; oneoff (PAYG)
    // reports get the stripped Veroax-cobranded cover. See ReportPDF
    // prop docs.
    const creditSource =
      ((report as { credit_source?: string | null } | null)?.credit_source ??
        null) as "subscription" | "oneoff" | "trial" | "vip" | null;

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
        watermarked={Boolean(
          (report as { watermarked?: boolean } | null)?.watermarked,
        )}
        creditSource={creditSource}
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
    // Log the full error server-side for diagnosis. NEVER include
    // message or stack in the response body. PDF render failures are
    // usually programmer errors (invalid props, missing fields) but
    // some error messages embed report data, which would leak across
    // a security boundary if exposed to the client. In dev,
    // NODE_ENV !== production, attach the message back for debugging.
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[pdf] render failed:", err, stack);
    const body: Record<string, unknown> = {
      error: "PDF render failed",
    };
    if (process.env.NODE_ENV !== "production") {
      body.message = message;
      body.stack = stack?.split("\n").slice(0, 12);
    }
    return new Response(JSON.stringify(body, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
