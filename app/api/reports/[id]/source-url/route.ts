import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// GET /api/reports/[id]/source-url?file=<filename>
//
// Returns a short-lived signed URL for a source PDF in this report's
// storage folder. Used by the dashboard's click-to-source side panel:
// the agent clicks "Source: CalPro Home Inspection p.10" and the panel
// opens this URL in an <iframe> with #page=10 appended.
//
// Auth: report owner OR admin. The URL itself is signed with a short
// TTL (5 minutes) so even if the agent's browser caches it, the link
// can't be passed around indefinitely.

export const dynamic = "force-dynamic";

const SIGN_TTL_SECONDS = 5 * 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;
  const url = new URL(request.url);
  const filename = (url.searchParams.get("file") ?? "").trim();
  if (!filename) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(
    (profile as { is_admin?: boolean } | null)?.is_admin,
  );

  const reader = isAdmin ? createServiceRoleClient() : supabase;
  const { data: report } = await reader
    .from("reports")
    .select("id, user_id, source_file_path")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (report.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // The disclosure files live under disclosures/{user_id}/{report_id}/.
  // Some reports may have stale source_file_path (set during finalize);
  // when null we compose from the FK.
  const folder = report.source_file_path ?? `${report.user_id}/${reportId}`;

  // Defensive filename check — block traversal attempts.
  if (filename.includes("/") || filename.includes("..") || filename.length > 200) {
    return NextResponse.json(
      { error: "Invalid filename." },
      { status: 400 },
    );
  }

  // The user-visible filename may map to multiple `_part_N` files in
  // storage if the file was split at upload. The viewer side panel
  // doesn't care — we resolve the FIRST part (or the unsplit file)
  // since that's the start of the document. Page numbers in citations
  // refer to the original document's page numbering, not the chunk's.
  const admin = createServiceRoleClient();
  const { data: files } = await admin.storage
    .from("disclosures")
    .list(folder, { limit: 1000 });
  const baseNoExt = filename.replace(/\.pdf$/i, "");
  const candidate =
    (files ?? []).find((f) => f.name === filename) ??
    (files ?? []).find(
      (f) =>
        f.name.toLowerCase().startsWith(baseNoExt.toLowerCase() + "_part_") &&
        f.name.toLowerCase().endsWith(".pdf"),
    );
  if (!candidate) {
    return NextResponse.json(
      { error: `Source file "${filename}" not found in report storage.` },
      { status: 404 },
    );
  }

  const path = `${folder}/${candidate.name}`;
  const { data: signed, error: signErr } = await admin.storage
    .from("disclosures")
    .createSignedUrl(path, SIGN_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      {
        error: `Could not create signed URL: ${signErr?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    filename: candidate.name,
    base_filename: filename,
  });
}
