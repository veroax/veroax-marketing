import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { looksLikeShareCode } from "@/lib/share/code";
import type { ReportData } from "@/lib/anthropic/schema";
import { composeAgentStrengthsAndConcerns } from "@/lib/reports/summary";
import { composeExecutiveNarrative } from "@/lib/reports/narrative";
import { PublicReportView } from "./_components/PublicReportView";

// Public report view at /r/{code}.
//
// No auth required. The 12-char share code is the access control —
// long enough to be unguessable, easy to dictate. The agent generates
// the link from their dashboard and hands it to the buyer. The page
// resolves the share code via the service-role client (bypassing RLS
// since the URL itself is the bearer token) and renders a mobile-
// first responsive view of the report.
//
// Re-runs of the same report update what this URL resolves to —
// the share code stays stable across reruns so the agent only has
// to share the link once. Older versions are accessible to the agent
// from the dashboard via the version-download path; the public URL
// always shows the latest analysis.

type Params = Promise<{ code: string }>;

export const dynamic = "force-dynamic";

// Tell search engines not to crawl/index share URLs — these are
// meant to be passed agent-to-buyer, not discovered. Static
// metadata only (generateMetadata is mutually exclusive in Next 16).
export const metadata = {
  title: "Disclosure analysis — Veroax",
  robots: { index: false, follow: false },
};

type ReportRow = {
  id: string;
  user_id: string;
  status: string;
  property_address: string | null;
  report_name: string | null;
  client_name: string | null;
  report_data: unknown;
  share_code: string | null;
  analysis_completed_at: string | null;
  archived: boolean | null;
  original_files: unknown;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  brokerage: string | null;
  dre_license: string | null;
  phone: string | null;
  display_email: string | null;
  brokerage_logo_url: string | null;
  headshot_url: string | null;
  brand_accent_hex: string | null;
  tagline: string | null;
  website_url: string | null;
  brokerage_dre: string | null;
  office_address: string | null;
};

export default async function PublicReportPage({
  params,
}: {
  params: Params;
}) {
  const { code } = await params;
  if (!code || !looksLikeShareCode(code)) {
    notFound();
  }

  const admin = createServiceRoleClient();

  const { data: report } = await admin
    .from("reports")
    .select(
      "id, user_id, status, property_address, report_name, client_name, report_data, share_code, analysis_completed_at, archived, original_files, created_at",
    )
    .eq("share_code", code)
    .maybeSingle<ReportRow>();

  // Resolve to 404 if the code doesn't exist, the report isn't ready
  // yet (uploaded/analyzing/failed), or the owner archived it. We
  // treat archived as "not shareable" — archive is the agent's
  // "remove from active list" action and they probably don't want
  // the link still working.
  if (!report) notFound();
  if (
    report.status !== "qa_pending" &&
    report.status !== "qa_approved" &&
    report.status !== "delivered"
  ) {
    notFound();
  }
  if (report.archived) notFound();

  const reportData = report.report_data as ReportData | null;
  if (!reportData) notFound();

  const { data: profile } = await admin
    .from("profiles")
    .select(
      // NOTE: we intentionally do NOT select profiles.email here.
      // The public share page must not leak the agent's signup
      // mailbox to anonymous link recipients. Only display_email
      // (which the agent set as their contact-of-record) is shown.
      "id, full_name, brokerage, dre_license, phone, display_email, brokerage_logo_url, headshot_url, brand_accent_hex, tagline, website_url, brokerage_dre, office_address",
    )
    .eq("id", report.user_id)
    .maybeSingle<ProfileRow>();

  // Same single-source-of-truth helpers the dashboard + PDF use.
  const narrative = composeExecutiveNarrative(reportData);
  const { strengths, concerns } = composeAgentStrengthsAndConcerns(reportData);

  const propertyAddress =
    report.property_address?.trim() ||
    reportData.property_snapshot?.address?.trim() ||
    "Property";

  return (
    <PublicReportView
      reportId={report.id}
      shareCode={code}
      propertyAddress={propertyAddress}
      reportName={report.report_name}
      clientName={report.client_name}
      analysisCompletedAt={report.analysis_completed_at}
      reportData={reportData}
      narrative={narrative}
      strengths={strengths.map((s) => s.text)}
      concerns={concerns.map((c) => c.text)}
      profile={profile}
    />
  );
}

// The Next file-router resolves notFound() against app/r/[code]/not-found.tsx
// so we don't need an inline fallback here.
