// PDF text extraction. pdf-parse v2 uses a class-based API backed by
// Mozilla's pdf.js. We send Claude the extracted text instead of PDF
// document attachments because Anthropic's API enforces a 100-page
// total cap across all PDF document blocks per request — easily
// exceeded by a typical CA disclosure package.

import { PDFParse } from "pdf-parse";

export type ExtractedDocument = {
  text: string;
  pages: number;
  bytes: number;
};

/**
 * Extracts plain text from a PDF buffer.
 * Throws if the PDF is encrypted or otherwise unreadable.
 * Returns an empty `text` string if the PDF is image-only without an
 * embedded OCR layer (most title-company exports OCR before delivery).
 */
export async function extractText(pdfBuffer: Buffer): Promise<ExtractedDocument> {
  // pdf-parse expects ArrayBuffer or TypedArray. Construct a Uint8Array
  // backed by the same memory as the Buffer.
  const data = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return {
      text: (result.text || "").trim(),
      pages: result.total ?? 0,
      bytes: pdfBuffer.length,
    };
  } finally {
    // Release the worker / pdfjs resources.
    await parser.destroy().catch(() => {});
  }
}

/**
 * Rough token-count estimator (chars / 4). Good enough for budget checks
 * before we commit to an Anthropic request.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
