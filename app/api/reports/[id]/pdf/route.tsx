import { renderToStream } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportPDF, type AgentBranding } from "@/lib/pdf-render/ReportPDF";
import type { ReportData } from "@/lib/anthropic/schema";

// Streams a downloadable PDF for a finished report. Auth-gated by the
// user-scoped supabase client; only the owner of the report can fetch
// its PDF. The PDF is generated on-demand each request (cheap because
// @react-pdf/renderer is fast and serverless-friendly).

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Not authenticated.", { status: 401 });
  }

  // RLS-gated select — only succeeds for the report owner.
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

  // Pull agent branding from profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, brokerage, dre_license, brokerage_dre, phone")
    .eq("id", user.id)
    .maybeSingle();

  const agent: AgentBranding = {
    fullName: profile?.full_name ?? null,
    brokerage: profile?.brokerage ?? null,
    dreLicense: profile?.dre_license ?? null,
    brokerageDre: profile?.brokerage_dre ?? null,
    phone: profile?.phone ?? null,
    email: user.email ?? null,
  };

  const reportData = report.report_data as ReportData;
  const propertyAddress =
    report.property_address ??
    reportData.property_snapshot?.address ??
    "Disclosure Analysis";

  // Render the PDF to a Node stream.
  const stream = await renderToStream(
    <ReportPDF
      report={reportData}
      property={propertyAddress}
      agent={agent}
      reportId={reportId}
      generatedAt={new Date()}
    />,
  );

  // Convert the Node Readable into a Web ReadableStream that the Response
  // constructor accepts. Node 20+ on Vercel supports Readable.toWeb().
  const { Readable } = await import("node:stream");
  const webStream = Readable.toWeb(stream as unknown as InstanceType<typeof Readable>);

  const filename = filenameForReport(propertyAddress);
  return new Response(webStream as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function filenameForReport(propertyAddress: string): string {
  // Keep filenames safe and predictable: strip punctuation, collapse spaces.
  const safe = propertyAddress
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 80);
  return `${safe || "Veroax_Report"}_Disclosure_Analysis.pdf`;
}
