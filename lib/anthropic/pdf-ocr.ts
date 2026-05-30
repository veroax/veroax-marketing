import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, ANALYSIS_MODEL } from "./client";

// Claude-vision-based OCR pre-pass.
//
// Why this exists: most California disclosure packages from
// Disclosures.io are born-digital PDFs with a text layer, and our
// hybrid PDF-attachment mode reads them perfectly. BUT some packages
// (especially older listings, or packages run through certain
// disclosure prep services) are scanned without OCR, image-only
// PDFs with no text layer. When the analyzer is fed a scanned PDF
// via Anthropic's PDF-document content block, Claude renders it
// internally as images BUT, for whatever reason (model
// conservatism, edge-case scans), Claude often reports back "this
// document is unreadable, please request OCR versions" instead of
// actually trying to read the rasterized pages. The Cowork skill
// handles this by running ocrmypdf locally before sending text
// to Claude; Vercel can't run ocrmypdf natively.
//
// The workaround: route the scanned PDF through Claude TWICE.
//   1) OCR pre-pass (this module): send the PDF with a vision-only
//      system prompt explicitly asking for verbatim transcription.
//      Claude IS willing to transcribe when told it's an OCR job
//      rather than an analysis job. Returns plain text.
//   2) Existing focused pass: instead of sending the PDF
//      attachment, send the OCR'd text from step 1 as the
//      document's text content. The analyzer now has real text to
//      work with.
//
// Trade-offs:
//   - Adds ~1 Claude call per scanned PDF (parallel-safe). Doubles
//     the per-page cost on scanned packages but is irrelevant on
//     born-digital packages because we don't run this pre-pass on
//     PDFs with a real text layer (caller does the detection).
//   - Adds latency: each OCR call runs ~15-45s for a multi-page
//     PDF. We run them in parallel from the caller so the total
//     wall-clock is the slowest single PDF.
//   - The output is plain text, not a layout-preserving render.
//     Tables and checkboxes get rendered as best-effort plain
//     text. Fine for the analyzer; not for a forensic record.
//
// Safety:
//   - The system prompt does NOT analyze, summarize, or judge the
//     document. It's pure transcription. The "no inventing"
//     discipline from FOCUSED_SYSTEM_BASE applies just as hard:
//     when a page is genuinely illegible, the transcription notes
//     "[PAGE N: illegible]" rather than inventing content.

const OCR_SYSTEM_PROMPT = `You are an OCR engine. The user will send you a scanned PDF document. Your job is to TRANSCRIBE all visible text on every page, preserving the document's structure as faithfully as plain text allows. You are NOT analyzing or summarizing; you are transcribing verbatim.

OUTPUT FORMAT, follow exactly:

1. Each page begins with "===== PAGE N =====" on its own line.
2. Headings and titles preserved on their own lines.
3. Multi-column layouts flattened to single-column reading order (top-to-bottom, left-to-right per column, columns concatenated).
4. Tables represented as plain text with reasonable column separation; use "|" between cells when the original is grid-like; preserve column ordering.
5. Checkboxes: rendered as [X] when checked, [ ] when unchecked. Form-style "Yes/No" questions: render verbatim ("X Yes / __ No" if that's the document's convention; "[X] Yes [ ] No" otherwise).
6. Form-field labels with values rendered as "Label: value" pairs.
7. Signatures: noted as [SIGNATURE: <name>] when a printed name is legible adjacent to the signature; [SIGNATURE] otherwise. Initials similarly: [INITIALS: <letters>] or [INITIALS].
8. Handwritten text: transcribe verbatim where legible. Where partly legible, render the legible part and mark uncertainty with [?]. Where wholly illegible, render [illegible].
9. Stamps, watermarks, page numbers: transcribe inline at their visual position.
10. Hyperlinks: render visible URL text verbatim; don't follow the link.

WHAT NOT TO DO:
- Do NOT analyze the document.
- Do NOT summarize.
- Do NOT skip pages even if they look like boilerplate.
- Do NOT invent content. If a page is wholly illegible at the resolution provided, output "===== PAGE N =====\\n[PAGE N: illegible at provided scan resolution]" and move on.
- Do NOT add commentary about the document's purpose, quality, or content.

The transcription will be consumed by another AI agent that performs the actual analysis; your output is its input. Faithful transcription enables that analysis. Output ONLY the transcription, no preface, no postface, no explanation.`;

export type OcrResult = {
  text: string;
  pages_estimated: number;
  input_tokens: number;
  output_tokens: number;
  // True when the model's output looked like a real transcription
  // (>= 50 chars per estimated page on average). False when the
  // output was suspiciously short, suggesting the model gave up
  // (in which case the caller can decide whether to try again or
  // fall back to attaching the raw PDF anyway).
  appears_substantive: boolean;
};

export async function ocrPdfWithClaude(args: {
  pdfBase64: string;
  pages: number;
  filename: string;
  client?: Anthropic;
}): Promise<OcrResult> {
  const client = args.client ?? getAnthropicClient();

  // Token budget: each rendered page is ~1500-2500 input tokens
  // through Anthropic's PDF endpoint. OCR transcription output is
  // typically ~500-1500 tokens per page (form-heavy disclosure
  // pages have a lot of text). Cap output at 12K tokens so a 50-
  // page scanned doc fits; the caller is expected to feed in
  // already-sub-batched PDFs (PDF_PASS_PAGE_BUDGET = 60).
  const response = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 12000,
    // temperature: 0 for reproducible transcription. Same posture
    // as every other Claude call in the analyzer pipeline.
    temperature: 0,
    system: OCR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: args.pdfBase64,
            },
            title: args.filename,
          },
          {
            type: "text",
            text: `Transcribe ${args.filename} (${args.pages} pages). Output ONLY the page-by-page transcription per the system prompt's format. Begin output with "===== PAGE 1 =====".`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find(
    (c): c is Anthropic.Messages.TextBlock => c.type === "text",
  );
  const text = textBlock?.text ?? "";
  const charsPerPage = args.pages > 0 ? text.length / args.pages : text.length;
  return {
    text,
    pages_estimated: args.pages,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    appears_substantive: charsPerPage >= 50,
  };
}

// Heuristic: a PDF is "likely a scan" when our local text
// extraction produced very little text relative to page count.
// Born-digital CA disclosure forms run hundreds to thousands of
// chars per page; a scan (no text layer) typically produces <30
// chars per page (maybe a few from page numbers or a barcode
// label). The threshold is conservative to avoid false positives
// on layout-heavy born-digital docs.
export function looksLikeScannedPdf(args: {
  extractedText: string;
  pages: number;
}): boolean {
  if (args.pages <= 0) return false;
  const charsPerPage = args.extractedText.trim().length / args.pages;
  return charsPerPage < 40;
}
