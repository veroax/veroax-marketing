import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// GET /api/r/[code]/source-url?file=<filename>
//
// Public-share variant of /api/reports/[id]/source-url. Resolves a
// signed URL for a source PDF inside the report whose share_code
// matches. Used by the public report view at /r/[code] so the
// buyer (or whoever the agent handed the share link to) can click
// any finding's "Source: X" line and open the underlying inspection
// or disclosure PDF, just like the agent's dashboard does.
//
// Auth model: the share_code itself IS the auth token. Anyone with
// the share link has access to the analysis AND access to its
// source documents. This matches what the agent intends when they
// hand a buyer the share link, the buyer should be able to see
// what's behind every claim. If a brokerage later wants to gate
// source access separately (e.g., "buyer can see analysis but not
// raw inspection PDFs"), we'll add an opt-out flag.
//
// Signed URLs themselves have a 5-minute TTL so passing them around
// doesn't grant indefinite access.

export const dynamic = "force-dynamic";

const SIGN_TTL_SECONDS = 5 * 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const url = new URL(request.url);
  const filename = (url.searchParams.get("file") ?? "").trim();
  if (!filename) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (!code || code.length < 4) {
    return NextResponse.json({ error: "Invalid share code." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: report } = await admin
    .from("reports")
    .select("id, user_id, source_file_path, deleted_at")
    .eq("share_code", code)
    .maybeSingle();
  if (!report || (report as { deleted_at?: string | null }).deleted_at) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const folder =
    report.source_file_path ?? `${report.user_id}/${report.id}`;

  // Defensive filename check, block traversal attempts.
  if (
    filename.includes("/") ||
    filename.includes("..") ||
    filename.length > 200
  ) {
    return NextResponse.json({ error: "Invalid filename." }, { status: 400 });
  }

  // Same token-overlap match used by the auth-gated source-url
  // endpoint. The analyzer cites documents by their human-readable
  // names ("CalPro Home Inspection") which don't match storage
  // filenames ("5._CalPro_Home_Inspection.pdf") byte-for-byte; the
  // matcher tokenizes both sides and picks the highest-overlap file.
  const { data: files } = await admin.storage
    .from("disclosures")
    .list(folder, { limit: 1000 });
  const allFiles = (files ?? []).filter((f) =>
    f.name.toLowerCase().endsWith(".pdf"),
  );

  let candidate: { name: string } | undefined =
    allFiles.find((f) => f.name === filename) ??
    allFiles.find((f) => f.name.toLowerCase() === filename.toLowerCase());
  if (!candidate) {
    candidate = pickBestFileMatch(filename, allFiles) ?? undefined;
  }
  if (!candidate) {
    return NextResponse.json(
      {
        error: `Could not match "${filename}" to a file in this report.`,
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
    const partMatch = file.name.match(/_part_(\d+)\.pdf$/i);
    const partNumber = partMatch ? parseInt(partMatch[1], 10) : 0;
    scored.push({ file, score: overlap, partNumber });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.partNumber - b.partNumber;
  });
  return scored[0].file;
}

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
        if (/^\d+$/.test(tok)) return false;
        return true;
      }),
  );
}

function stripFilenameNoise(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/_part_\d+$/i, "")
    .replace(/^\d+[._\-\s]+/, "")
    .replace(/[_\-]+/g, " ")
    .trim();
}
