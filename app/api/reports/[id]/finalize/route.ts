import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { splitPdfIfNeeded, countPages, MAX_PAGES_PER_CHUNK } from "@/lib/pdf/split";

// Called after client-side uploads to "disclosures/{user_id}/{report_id}/..."
// finish. Server's job:
//   1. Auth-check that the report belongs to the caller
//   2. Find any uploaded ZIPs, download them, extract PDFs, re-upload as
//      siblings, delete the ZIP
//   3. Split any PDFs over Anthropic's 100-page limit into chunks
//   4. Mark the report status as "analyzing" and trigger analysis
//
// We use the service-role client for storage operations because the user's
// session token isn't always available inside Vercel functions for large
// downloads — but we keep RLS-respecting access for the reports table check.

// PDF splitting can take a few seconds per long document. 300s ceiling
// gives us headroom for multi-document HOA packages.
export const maxDuration = 300;

export async function POST(
  request: Request,
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

  // Verify the report belongs to this user — RLS enforces this anyway,
  // but the explicit check gives a clean 404 instead of a confusing
  // empty result.
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, user_id, status")
    .eq("id", reportId)
    .single();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "No files to finalize." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const zipPaths = paths.filter((p) => p.toLowerCase().endsWith(".zip"));

  // Extract each ZIP into the same folder, then delete the original.
  for (const zipPath of zipPaths) {
    try {
      const { data: zipBlob, error: dlErr } = await admin.storage
        .from("disclosures")
        .download(zipPath);
      if (dlErr || !zipBlob) {
        throw new Error(dlErr?.message ?? "Could not download ZIP.");
      }

      const buffer = Buffer.from(await zipBlob.arrayBuffer());
      const zip = new AdmZip(buffer);
      const entries = zip
        .getEntries()
        .filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".pdf"));

      const baseDir = zipPath.substring(0, zipPath.lastIndexOf("/"));

      for (const entry of entries) {
        // Flatten directory structure inside the zip — we only care about the
        // PDFs themselves, not their folder organization within the archive.
        const safeName = entry.entryName
          .split("/")
          .pop()!
          .replace(/[^a-zA-Z0-9._-]/g, "_");
        const targetPath = `${baseDir}/${safeName}`;

        const { error: upErr } = await admin.storage
          .from("disclosures")
          .upload(targetPath, entry.getData(), {
            contentType: "application/pdf",
            upsert: true,
          });
        if (upErr) {
          throw new Error(`Could not upload ${safeName}: ${upErr.message}`);
        }
      }

      // Delete the original ZIP — only PDFs need to remain in storage.
      await admin.storage.from("disclosures").remove([zipPath]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "ZIP extraction failed.";
      await supabase
        .from("reports")
        .update({ status: "failed", failure_reason: message })
        .eq("id", reportId);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const folder = `${user.id}/${reportId}`;

  // Split any PDF that exceeds Claude's 100-page-per-document limit into
  // 90-page chunks. This makes HOA CC&Rs, Bylaws, and other long documents
  // analyzable without ever bumping into the per-document page cap.
  let pagesSplitTotal = 0;
  let pdfsSplitCount = 0;
  try {
    const { data: extractedFiles } = await admin.storage
      .from("disclosures")
      .list(folder, { limit: 100 });
    const pdfsToCheck = (extractedFiles ?? []).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf"),
    );

    for (const file of pdfsToCheck) {
      const path = `${folder}/${file.name}`;
      const { data: blob, error: dlErr } = await admin.storage
        .from("disclosures")
        .download(path);
      if (dlErr || !blob) {
        throw new Error(
          `Could not download ${file.name} from storage: ${dlErr?.message ?? "unknown"}`,
        );
      }
      const buffer = Buffer.from(await blob.arrayBuffer());

      let pageCount: number;
      try {
        pageCount = await countPages(buffer);
      } catch (err) {
        // Loud failure with the specific filename. Previous behavior was
        // to silently skip, which left oversized PDFs in storage to fail
        // later at the analyze step with a generic "100 pages" error.
        const why = err instanceof Error ? err.message : "unknown parse error";
        throw new Error(
          `Could not parse "${file.name}" with pdf-lib (${why}). ` +
            `The PDF may be encrypted, password-protected, or use a non-standard ` +
            `structure. Re-export the document as a standard unprotected PDF and ` +
            `try again.`,
        );
      }

      // Audit per-file page count for debugging future issues.
      try {
        await admin.from("audit_log").insert({
          user_id: user.id,
          report_id: reportId,
          event_type: "pdf.inspected",
          metadata: {
            filename: file.name,
            page_count: pageCount,
            needs_split: pageCount > MAX_PAGES_PER_CHUNK,
          },
        });
      } catch {
        // Audit logging failure shouldn't block report processing.
      }

      if (pageCount <= MAX_PAGES_PER_CHUNK) continue;

      const chunks = await splitPdfIfNeeded(buffer, file.name);
      if (chunks.length <= 1) continue;

      // Upload each chunk into the same folder.
      for (const chunk of chunks) {
        const chunkPath = `${folder}/${chunk.name}`;
        const { error: upErr } = await admin.storage
          .from("disclosures")
          .upload(chunkPath, chunk.buffer, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (upErr) {
          throw new Error(
            `Could not upload chunk ${chunk.name}: ${upErr.message}`,
          );
        }
      }

      // Remove the oversized original now that the chunks exist.
      await admin.storage.from("disclosures").remove([path]);

      pagesSplitTotal += pageCount;
      pdfsSplitCount += 1;
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "PDF splitting failed.";
    await supabase
      .from("reports")
      .update({ status: "failed", failure_reason: message })
      .eq("id", reportId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // List final set of PDFs in the report folder for the audit log.
  const { data: finalFiles } = await admin.storage
    .from("disclosures")
    .list(folder, { limit: 100 });
  const pdfCount =
    finalFiles?.filter((f) => f.name.toLowerCase().endsWith(".pdf")).length ?? 0;

  // Mark the report as ready for analysis. The actual analysis worker
  // runs in slice 3 — for now we just transition the status so the UI
  // can show a "processing" state.
  const { error: updateErr } = await supabase
    .from("reports")
    .update({
      status: "analyzing",
      analysis_started_at: new Date().toISOString(),
      source_file_path: folder,
    })
    .eq("id", reportId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Audit log entry (non-PII).
  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "report.finalized",
    metadata: {
      pdf_count: pdfCount,
      zip_count: zipPaths.length,
      pdfs_split: pdfsSplitCount,
      pages_split: pagesSplitTotal,
    },
  });

  return NextResponse.json({
    ok: true,
    pdf_count: pdfCount,
    zip_count_extracted: zipPaths.length,
    pdfs_split: pdfsSplitCount,
  });
}
