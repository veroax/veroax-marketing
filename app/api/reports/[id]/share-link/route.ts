import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateShareCode } from "@/lib/share/code";
import { requireUser } from "@/lib/auth/require";

// POST /api/reports/[id]/share-link
//
// Returns the report's public share code, generating one on demand
// when the report doesn't yet have one. Used by the dashboard's
// "Copy share link" button — agents only see this after the analysis
// has completed, but legacy reports (created before commit X) won't
// have had a share code auto-assigned at completion. This endpoint
// gives them one without requiring a full re-run.
//
// Auth: report owner OR admin.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(
    (profile as { is_admin?: boolean } | null)?.is_admin,
  );

  const reader = isAdmin ? createServiceRoleClient() : supabase;
  const { data: report, error: readErr } = await reader
    .from("reports")
    .select("id, user_id, share_code, status")
    .eq("id", reportId)
    .maybeSingle();
  if (readErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (report.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (report.status === "analyzing" || report.status === "uploaded") {
    return NextResponse.json(
      {
        error:
          "The analysis isn't complete yet. Share links become available once the report is Ready.",
      },
      { status: 409 },
    );
  }

  // Reuse the existing code when present; only generate when absent.
  let shareCode =
    typeof report.share_code === "string" && report.share_code.trim()
      ? report.share_code.trim()
      : null;
  if (!shareCode) {
    shareCode = generateShareCode();
    const admin = createServiceRoleClient();
    const { error: updErr } = await admin
      .from("reports")
      .update({ share_code: shareCode })
      .eq("id", reportId);
    if (updErr) {
      return NextResponse.json(
        { error: `Could not save share code: ${updErr.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    share_code: shareCode,
    url: `${SITE_URL}/r/${shareCode}`,
  });
}
