import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  ReportPDF,
  type AgentBranding,
  type OriginalFile,
} from "@/lib/pdf-render/ReportPDF";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ReportData } from "@/lib/anthropic/schema";
import { looksLikeShareCode } from "@/lib/share/code";

// Public-facing PDF download from a share-code URL. Mirrors the
// authenticated /api/reports/[id]/pdf flow but resolves by share_code
// instead of report id. No auth — the URL is the bearer token.
//
// The PDF reflects the CURRENT report_data (re-renders on every hit).
// Past versions are archived via the dashboard's versions[] download
// path — the public link is always "latest."

export const runtime = "nodejs";

type Params = Promise<{ code: string }>;

export async function GET(_req: Request, context: { params: Params }) {
  const { code } = await context.params;
  if (!code || !looksLikeShareCode(code)) {
    return NextResponse.json({ error: "Bad code." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: report, error } = await admin
    .from("reports")
    .select(
      "id, user_id, status, property_address, report_name, client_name, report_data, share_code, archived, original_files, created_at",
    )
    .eq("share_code", code)
    .maybeSingle();
  if (error || !report) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (
    !["qa_pending", "qa_approved", "delivered"].includes(report.status) ||
    report.archived
  ) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  const reportData = report.report_data as ReportData | null;
  if (!reportData) {
    return NextResponse.json({ error: "Not ready." }, { status: 404 });
  }

  // Agent profile for branding.
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "full_name, brokerage, dre_license, phone, display_email, email, brokerage_logo_url, headshot_url, brand_accent_hex, tagline, website_url, brokerage_dre, office_address",
    )
    .eq("id", report.user_id)
    .maybeSingle();

  const p = profile as Record<string, unknown> | null;
  const agent: AgentBranding = {
    fullName: (p?.full_name as string) ?? null,
    brokerage: (p?.brokerage as string) ?? null,
    dreLicense: (p?.dre_license as string) ?? null,
    brokerageDre: (p?.brokerage_dre as string) ?? null,
    phone: (p?.phone as string) ?? null,
    email:
      ((p?.display_email as string) || (p?.email as string)) ?? null,
    brokerageLogoUrl: (p?.brokerage_logo_url as string) ?? null,
    headshotUrl: (p?.headshot_url as string) ?? null,
    brandAccentHex: (p?.brand_accent_hex as string) ?? null,
    tagline: (p?.tagline as string) ?? null,
    websiteUrl: (p?.website_url as string) ?? null,
    officeAddress: (p?.office_address as string) ?? null,
  };

  // Same original_files coercion as /api/reports/[id]/pdf — keep the
  // shape consistent so the renderer doesn't have a code path for
  // public vs authenticated PDFs.
  const fallbackUploadedAt =
    typeof report.created_at === "string" ? report.created_at : null;
  const originalFilesRaw = report.original_files as unknown;
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

  const property =
    report.property_address?.trim() ||
    reportData.property_snapshot?.address?.trim() ||
    "the property";

  try {
    const buffer = await renderToBuffer(
      <ReportPDF
        report={reportData}
        property={property}
        agent={agent}
        reportId={report.id}
        generatedAt={new Date()}
        originalFiles={originalFiles}
        reportName={report.report_name ?? null}
        clientName={report.client_name ?? null}
      />,
    );
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${propertyToFilename(property)}-disclosure-analysis.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function propertyToFilename(s: string): string {
  return (
    s
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .toLowerCase() || "report"
  );
}
