import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { countPages, MAX_PAGES_PER_CHUNK } from "@/lib/pdf/split";
import { extractText, estimateTokens } from "@/lib/pdf/extract";

// Diagnostic endpoint: inspects every PDF in a report's storage folder
// and reports each file's page count + whether it would be eligible
// for splitting. Surfaces unparseable PDFs by their filename. Use this
// to debug "100 PDF pages" errors from Claude where the splitter
// silently let an oversized PDF through.
//
// Auth-gated to the report's owner (RLS via the user-scoped Supabase
// client). The actual file downloads use the service-role client because
// signed URLs aren't needed for server-side reads.

export const maxDuration = 120;

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
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // RLS-bound select confirms the report belongs to this user.
  const { data: report } = await supabase
    .from("reports")
    .select("id")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const admin = createServiceRoleClient();
  const folder = `${user.id}/${reportId}`;
  const { data: files, error: listErr } = await admin.storage
    .from("disclosures")
    .list(folder, { limit: 200 });
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const pdfs = (files ?? []).filter((f) =>
    f.name.toLowerCase().endsWith(".pdf"),
  );

  type Row = {
    filename: string;
    size_kb: number;
    pages?: number;
    exceeds_limit?: boolean;
    text_chars?: number;
    text_tokens?: number;
    text_extract_error?: string;
    error?: string;
  };

  const results: Row[] = [];
  let pdfParseImportError: string | null = null;

  // Probe pdf-parse import once up front to surface bundling issues
  // distinctly from per-file extraction failures.
  try {
    // The actual extract path imports lazily on first call.
    await extractText(Buffer.from([0x25, 0x50, 0x44, 0x46])).catch(() => null);
  } catch (err) {
    pdfParseImportError = err instanceof Error ? err.message : String(err);
  }

  for (const f of pdfs) {
    const path = `${folder}/${f.name}`;
    const size_kb = Math.round((f.metadata?.size ?? 0) / 1024);

    try {
      const { data: blob, error: dlErr } = await admin.storage
        .from("disclosures")
        .download(path);
      if (dlErr || !blob) {
        results.push({
          filename: f.name,
          size_kb,
          error: `Download failed: ${dlErr?.message ?? "unknown"}`,
        });
        continue;
      }
      const buffer = Buffer.from(await blob.arrayBuffer());

      const row: Row = { filename: f.name, size_kb };

      try {
        row.pages = await countPages(buffer);
        row.exceeds_limit = row.pages > MAX_PAGES_PER_CHUNK;
      } catch (err) {
        row.error = err instanceof Error ? err.message : "PDF parse failed";
      }

      // Try text extraction too so we can verify pdf-parse works per-file.
      try {
        const ext = await extractText(buffer);
        row.text_chars = ext.text.length;
        row.text_tokens = estimateTokens(ext.text);
      } catch (err) {
        row.text_extract_error =
          err instanceof Error ? err.message : "extractText failed";
      }

      results.push(row);
    } catch (err) {
      results.push({
        filename: f.name,
        size_kb,
        error: err instanceof Error ? err.message : "Inspection failed",
      });
    }
  }

  return NextResponse.json({
    folder,
    pdf_count: pdfs.length,
    max_pages_per_chunk_threshold: MAX_PAGES_PER_CHUNK,
    pdf_parse_import_error: pdfParseImportError,
    files: results,
  });
}
