import { PDFDocument } from "pdf-lib";

// Claude's hard limit is 100 pages per PDF document attachment. We split
// to 80 pages with a generous safety margin in case downstream processing
// or alternative page counters disagree with pdf-lib (rotation pages,
// signature pages, blank pages, layered PDFs, etc.).
export const MAX_PAGES_PER_CHUNK = 80;

export type PdfChunk = {
  name: string;
  buffer: Buffer;
  partNumber?: number;
  totalParts?: number;
};

/**
 * Inspects a PDF buffer and returns either:
 *   - One chunk (the original) if it's at or below MAX_PAGES_PER_CHUNK
 *   - Multiple chunks (each ≤ MAX_PAGES_PER_CHUNK) named
 *     `{basename}_part_{n}.pdf`
 *
 * The page ordering is preserved; the first chunk has pages 1..90, the
 * second has 91..180, etc.
 */
export async function splitPdfIfNeeded(
  pdfBuffer: Buffer,
  baseName: string,
): Promise<PdfChunk[]> {
  const srcDoc = await PDFDocument.load(pdfBuffer, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= MAX_PAGES_PER_CHUNK) {
    return [{ name: baseName, buffer: pdfBuffer }];
  }

  const chunks: PdfChunk[] = [];
  const baseWithoutExt = baseName.replace(/\.pdf$/i, "");
  const totalParts = Math.ceil(totalPages / MAX_PAGES_PER_CHUNK);

  for (let start = 0; start < totalPages; start += MAX_PAGES_PER_CHUNK) {
    const end = Math.min(start + MAX_PAGES_PER_CHUNK, totalPages);
    const partNumber = Math.floor(start / MAX_PAGES_PER_CHUNK) + 1;

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
