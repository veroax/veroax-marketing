import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportPDF, type AgentBranding } from "@/lib/pdf-render/ReportPDF";
import type { ReportData } from "@/lib/anthropic/schema";

// Streams a downloadable PDF for a finished report. Auth-gated by the
// user-scoped supabase client; only the owner can fetch its PDF.
// Renders to a Buffer (simpler than streaming) and returns the bytes
// directly — fast enough for our document sizes (typically <300 KB).

export const dynamic = "force-dynamic";
// PDF rendering can take a few seconds for long reports.
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

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
      .select("id, status, property_address, report_data")
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

    const reportData = report.report_data as ReportData;
    const propertyAddress =
      report.property_address ??
      reportData.property_snapshot?.address ??
      "Disclosure Analysis";

    const buffer = await renderToBuffer(
      <ReportPDF
        report={reportData}
        property={propertyAddress}
        agent={agent}
        reportId={reportId}
        generatedAt={new Date()}
      />,
    );

    const filename = filenameForReport(propertyAddress);
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

function filenameForReport(propertyAddress: string): string {
  const safe = propertyAddress
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 80);
  return `${safe || "Veroax_Report"}_Disclosure_Analysis.pdf`;
}
