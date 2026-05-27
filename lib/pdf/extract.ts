// PDF text extraction using unpdf, a serverless-friendly build of
// Mozilla's pdf.js. We were using pdf-parse v2 but its underlying
// pdf.js worker file didn't survive Vercel's bundler, causing the
// analyze and inspect routes to crash at module load.
// unpdf is purpose-built for Vercel-style serverless environments
// and ships without a worker dependency.

import { extractText as unpdfExtract, getDocumentProxy } from "unpdf";

export type ExtractedDocument = {
  text: string;
  pages: number;
  bytes: number;
};

/**
 * Extracts plain text from a PDF buffer.
 * Throws if the PDF is unreadable.
 * Returns an empty `text` string if the PDF is image-only without an
 * embedded OCR layer (most title-company exports OCR before delivery).
 */
export async function extractText(pdfBuffer: Buffer): Promise<ExtractedDocument> {
  const data = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
  const pdf = await getDocumentProxy(data);
  const result = await unpdfExtract(pdf, { mergePages: true });
  return {
    text: (typeof result.text === "string" ? result.text : "").trim(),
    pages: result.totalPages ?? 0,
    bytes: pdfBuffer.length,
  };
}

/**
 * Rough token-count estimator (chars / 4). Good enough for budget checks
 * before we commit to an Anthropic request.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
