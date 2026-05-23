import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require";

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

  // Source citations from the analyzer are human-readable
  // ("CalPro Home Inspection", "AVID", "Able Exterminators")
  // and won't match storage filenames byte-for-byte. The matcher
  // tokenizes both sides and picks the file with the best token
  // overlap. Handles all the common citation styles we see:
  // - "Property Inspection" → matches "5._Property_Inspection.pdf"
  // - "CalPro Home Inspection" → matches "5._CalPro_Home_Inspection.pdf"
  // - "AVID" → matches "3._AVID.pdf"
  // - "AVID p.4" → page already stripped by caller, "AVID" remains
  // For split docs we prefer the first part so the iframe lands on
  // the original document's start.
  const admin = createServiceRoleClient();
  const { data: files } = await admin.storage
    .from("disclosures")
    .list(folder, { limit: 1000 });
  const allFiles = (files ?? []).filter((f) =>
    f.name.toLowerCase().endsWith(".pdf"),
  );

  // Try exact match first (fast path for citations that happen to be
  // verbatim filenames). Fall through to token-overlap scoring when
  // the citation is human-readable. `candidate` is a minimal
  // {name: string} shape — Supabase's FileObject and our matcher's
  // return type share that subset.
  let candidate: { name: string } | undefined =
    allFiles.find((f) => f.name === filename) ??
    allFiles.find((f) => f.name.toLowerCase() === filename.toLowerCase());

  if (!candidate) {
    candidate = pickBestFileMatch(filename, allFiles) ?? undefined;
  }

  if (!candidate) {
    const available = allFiles.map((f) => f.name).join(", ");
    return NextResponse.json(
      {
        error: `Couldn't match "${filename}" to a file in this report. Files in storage: ${available || "(none)"}`,
      },
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

// Token-overlap scorer for source-citation → storage-filename
// matching. Citations are human-readable ("CalPro Home Inspection",
// "AVID", "Property Inspection") and rarely match storage filenames
// verbatim (which look like "5._Property_Inspection.pdf"). We
// tokenize both sides, drop noise (numeric prefixes, _part_N
// suffixes, short words, common stop words), and pick the file with
// the most overlapping tokens. Ties prefer the unsplit file or the
// first part.
function pickBestFileMatch(
  hint: string,
  files: Array<{ name: string }>,
): { name: string } | null {
  const hintTokens = tokenize(hint);
  if (hintTokens.size === 0) return null;

  type Scored = { file: { name: string }; score: number; partNumber: number };
  const scored: Scored[] = [];
  for (const file of files) {
    const fileTokens = tokenize(stripFilenameNoise(file.name));
    let overlap = 0;
    for (const t of hintTokens) if (fileTokens.has(t)) overlap += 1;
    if (overlap === 0) continue;
    // Extract _part_N number (0 if unsplit) so ties go to part 1
    // first, then part 2, etc.
    const partMatch = file.name.match(/_part_(\d+)\.pdf$/i);
    const partNumber = partMatch ? parseInt(partMatch[1], 10) : 0;
    scored.push({ file, score: overlap, partNumber });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Same overlap: prefer unsplit (partNumber=0) or earlier parts.
    return a.partNumber - b.partNumber;
  });
  return scored[0].file;
}

// Stop words common in disclosure filenames + citations that don't
// help discriminate between docs.
const STOP_TOKENS = new Set([
  "the",
  "and",
  "for",
  "report",
  "reports",
  "pdf",
  "doc",
  "docs",
  "document",
  "documents",
  "page",
  "pages",
  "section",
  "sec",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((tok) => {
        if (tok.length < 3) return false;
        if (STOP_TOKENS.has(tok)) return false;
        if (/^\d+$/.test(tok)) return false; // bare numbers
        return true;
      }),
  );
}

// Strip noise from a storage filename so the token set reflects the
// document name proper. Drops `.pdf`, `_part_N` suffix, leading
// numeric prefixes ("5._", "10._"), and trailing version digits.
function stripFilenameNoise(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/_part_\d+$/i, "")
    .replace(/^\d+[._\-\s]+/, "")
    .replace(/[_\-]+/g, " ")
    .trim();
}
