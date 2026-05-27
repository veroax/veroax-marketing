import { PDFDocument } from "pdf-lib";

// Upload-time chunk ceiling. We split files larger than this into
// {basename}_part_{n}.pdf parts before writing to storage so no single
// stored object exceeds Claude's per-PDF rendering limit.
//
// History: 60 → 90 → 60. We bumped to 90 after concluding the earlier
// 60-page cap was chasing a per-request total cap (now handled at the
// per-call packing layer). But the per-call analysis budget itself
// caps at 60 pages now (see PDF_PASS_PAGE_BUDGET in lib/anthropic/
// analyze.ts) because real-world per-page token cost lands closer to
// 2000 than the 1500 we'd estimated. Matching the storage chunk size
// to the per-call budget avoids the in-memory re-split path firing
// on every new upload, it stays as a safety net for legacy 90-page
// chunks already in storage.
export const MAX_PAGES_PER_CHUNK = 60;

export type PdfChunk = {
  name: string;
  buffer: Buffer;
  partNumber?: number;
  totalParts?: number;
};

/**
 * Inspects a PDF buffer and returns either:
 *   - One chunk (the original) if it's at or below maxPagesPerChunk
 *   - Multiple chunks (each ≤ maxPagesPerChunk) named
 *     `{basename}_part_{n}.pdf`
 *
 * The page ordering is preserved; the first chunk has pages 1..N, the
 * second N+1..2N, etc.
 *
 * maxPagesPerChunk defaults to the module's MAX_PAGES_PER_CHUNK (60).
 * Pass a smaller value at analyze-time to defensively re-split legacy
 * storage objects that were uploaded under the previous 90-page cap;
 * the names will reuse the `_part_n` convention so citations stay
 * readable.
 */
export async function splitPdfIfNeeded(
  pdfBuffer: Buffer,
  baseName: string,
  maxPagesPerChunk: number = MAX_PAGES_PER_CHUNK,
): Promise<PdfChunk[]> {
  const srcDoc = await PDFDocument.load(pdfBuffer, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= maxPagesPerChunk) {
    return [{ name: baseName, buffer: pdfBuffer }];
  }

  const chunks: PdfChunk[] = [];
  const baseWithoutExt = baseName.replace(/\.pdf$/i, "");
  const totalParts = Math.ceil(totalPages / maxPagesPerChunk);

  for (let start = 0; start < totalPages; start += maxPagesPerChunk) {
    const end = Math.min(start + maxPagesPerChunk, totalPages);
    const partNumber = Math.floor(start / maxPagesPerChunk) + 1;

    const newDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await newDoc.copyPages(srcDoc, indices);
    pages.forEach((p) => newDoc.addPage(p));

    const partName = `${baseWithoutExt}_part_${partNumber}.pdf`;
    const bytes = await newDoc.save({ useObjectStreams: false });
    chunks.push({
      name: partName,
      buffer: Buffer.from(bytes),
      partNumber,
      totalParts,
    });
  }

  return chunks;
}

/**
 * Returns the page count of a PDF without producing chunks.
 * Used for diagnostics and the audit log.
 */
export async function countPages(pdfBuffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdfBuffer, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  return doc.getPageCount();
}
