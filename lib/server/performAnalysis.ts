// Background analysis worker shared by /api/reports/[id]/analyze
// (first-time analysis) and /api/reports/[id]/update (re-analysis on
// added documents). Both routes set up state in their handler, take
// the concurrency lock, and then call performAnalysis inside next/server's
// after() block so the heavy work outlives the HTTP response.

import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  analyzeDisclosurePackage,
  type Document,
  type UpdateContext,
} from "@/lib/anthropic/analyze";
import { extractText, estimateTokens } from "@/lib/pdf/extract";
import { countPages } from "@/lib/pdf/split";
import {
  classifyDocument,
  passGroupFor,
  DOCUMENT_TYPE_LABEL,
  type PassGroup,
} from "@/lib/pdf/classify";

// Which groups send native PDF attachments to Claude vs. extracted
// text. Must stay in sync with GROUP_MODE in lib/anthropic/analyze.ts.
// Duplicated here (not imported) because performAnalysis processes
// files BEFORE the analyzer sees them — it has to know which storage
// pull-path to take per file.
const GROUP_TRANSPORT: Record<PassGroup, "pdf" | "text"> = {
  seller_disclosures: "pdf",
  inspections: "pdf",
  hoa: "text",
  hazards: "text",
};
import type { ReportData } from "@/lib/anthropic/schema";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

export type PerformAnalysisInput = {
  admin: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  userEmail: string | null;
  report: {
    id: string;
    property_address: string | null;
    source_file_path: string | null;
  };
  // When set, signals re-analysis triggered by added documents.
  // analyzeDisclosurePackage uses this to date-tag findings and
  // compose the report's update_note banner.
  updateContext?: UpdateContext | null;
  // Skip the "your report is ready" email. Updates use this so the
  // agent isn't double-pinged for a re-run.
  skipNotificationEmail?: boolean;
};

export async function performAnalysis(
  params: PerformAnalysisInput,
): Promise<void> {
  const {
    admin,
    userId,
    userEmail,
    report,
    updateContext = null,
    skipNotificationEmail = false,
  } = params;
  const reportId = report.id;
  const folder = report.source_file_path ?? `${userId}/${reportId}`;

  // List PDFs in the report folder. For updates, this includes both
  // the original files and the newly-added ones; both are analyzed
  // together (the user's "full package re-analysis" preference).
  const { data: files, error: listErr } = await admin.storage
    .from("disclosures")
    .list(folder, { limit: 100 });
  if (listErr) {
    throw new Error(`Could not list source files: ${listErr.message}`);
  }
  const pdfs = (files ?? [])
    .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (pdfs.length === 0) {
    throw new Error("No PDF files found for this report.");
  }

  await admin.from("audit_log").insert({
    user_id: userId,
    report_id: reportId,
    event_type: updateContext
      ? "analysis.update_started"
      : "analysis.upload_started",
    metadata: { total_files: pdfs.length, is_update: Boolean(updateContext) },
  });

  // Build the set of added filenames so we can stamp doc.addedAt on
  // newer documents. For first-time analysis, the set is empty.
  const addedSet = new Set(
    (updateContext?.addedFilenames ?? []).map((n) => n.toLowerCase()),
  );

  const documents: Document[] = [];
  const failedExtractions: Array<{ filename: string; reason: string }> = [];

  for (const f of pdfs) {
    const path = `${folder}/${f.name}`;
    const { data: blob, error: dlErr } = await admin.storage
      .from("disclosures")
      .download(path);
    if (dlErr || !blob) {
      throw new Error(
        `Could not download ${f.name}: ${dlErr?.message ?? "unknown"}`,
      );
    }
    const buffer = Buffer.from(await blob.arrayBuffer());

    // Classify by filename FIRST so we know whether this file goes
    // to Claude as a native PDF attachment or as extracted text. The
    // two paths have different storage shapes on the Document, so we
    // can't unify them earlier.
    const docType = classifyDocument(f.name);
    const group = passGroupFor(docType);
    const transport = GROUP_TRANSPORT[group];
    const addedAt = addedSet.has(f.name.toLowerCase())
      ? updateContext?.updateDate
      : null;

    if (transport === "pdf") {
      // PDF-mode: skip text extraction entirely. Just count pages
      // (for the sub-batch budget) and base64-encode the buffer.
      let pages = 0;
      try {
        pages = await countPages(buffer);
      } catch {
        // If pdf-lib can't read the file, fall back to text mode for
        // this single document so the run isn't blocked.
        let extracted;
        try {
          extracted = await extractText(buffer);
        } catch (err) {
          const reason =
            err instanceof Error ? err.message : "PDF unreadable";
          failedExtractions.push({ filename: f.name, reason });
          documents.push({
            filename: f.name,
            text: "",
            pages: 0,
            tokens: 0,
            addedAt,
          });
          await admin.from("audit_log").insert({
            user_id: userId,
            report_id: reportId,
            event_type: "analysis.file_uploaded",
            metadata: {
              filename: f.name,
              extract_error: reason,
              transport: "pdf_fallback_text",
              uploaded_index: documents.length,
              total_files: pdfs.length,
            },
          });
          continue;
        }
        documents.push({
          filename: f.name,
          text: extracted.text,
          pages: extracted.pages,
          tokens: estimateTokens(extracted.text),
          addedAt,
        });
        await admin.from("audit_log").insert({
          user_id: userId,
          report_id: reportId,
          event_type: "analysis.file_uploaded",
          metadata: {
            filename: f.name,
            pages: extracted.pages,
            tokens: estimateTokens(extracted.text),
            transport: "pdf_fallback_text",
            uploaded_index: documents.length,
            total_files: pdfs.length,
          },
        });
        continue;
      }

      documents.push({
        filename: f.name,
        text: "",
        pages,
        // tokens estimate just for visibility/audit; real PDF token
        // cost is computed by Claude. ~1500/page is the rule of
        // thumb for native PDF attachment input cost.
        tokens: pages * 1500,
        addedAt,
        pdfBase64: buffer.toString("base64"),
      });
      await admin.from("audit_log").insert({
        user_id: userId,
        report_id: reportId,
        event_type: "analysis.file_uploaded",
        metadata: {
          filename: f.name,
          pages,
          tokens: pages * 1500,
          transport: "pdf",
          uploaded_index: documents.length,
          total_files: pdfs.length,
        },
      });
      continue;
    }

    // Text-mode path (hoa, hazards) — unchanged from prior behavior.
    let extracted;
    try {
      extracted = await extractText(buffer);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Text extraction failed";
      failedExtractions.push({ filename: f.name, reason });
      documents.push({
        filename: f.name,
        text: "",
        pages: 0,
        tokens: 0,
        addedAt,
      });
      await admin.from("audit_log").insert({
        user_id: userId,
        report_id: reportId,
        event_type: "analysis.file_uploaded",
        metadata: {
          filename: f.name,
          extract_error: reason,
          transport: "text",
          uploaded_index: documents.length,
          total_files: pdfs.length,
        },
      });
      continue;
    }

    documents.push({
      filename: f.name,
      text: extracted.text,
      pages: extracted.pages,
      tokens: estimateTokens(extracted.text),
      addedAt,
    });
    await admin.from("audit_log").insert({
      user_id: userId,
      report_id: reportId,
      event_type: "analysis.file_uploaded",
      metadata: {
        filename: f.name,
        pages: extracted.pages,
        tokens: estimateTokens(extracted.text),
        transport: "text",
        uploaded_index: documents.length,
        total_files: pdfs.length,
      },
    });
  }

  const groups: Record<PassGroup, Document[]> = {
    seller_disclosures: [],
    inspections: [],
    hoa: [],
    hazards: [],
  };
  for (const doc of documents) {
    const docType = classifyDocument(doc.filename);
    const group = passGroupFor(docType);
    groups[group].push(doc);
  }

  const totalTokens = documents.reduce((s, d) => s + d.tokens, 0);
  await admin.from("audit_log").insert({
    user_id: userId,
    report_id: reportId,
    event_type: "analysis.claude_started",
    metadata: {
      document_count: documents.length,
      estimated_tokens: totalTokens,
      is_update: Boolean(updateContext),
      group_counts: {
        seller_disclosures: groups.seller_disclosures.length,
        inspections: groups.inspections.length,
        hoa: groups.hoa.length,
        hazards: groups.hazards.length,
      },
    },
  });

  const result = await analyzeDisclosurePackage({
    groups,
    propertyAddressHint: report.property_address,
    updateContext,
    onPassStarted: async (group, subIndex, subTotal) => {
      await admin.from("audit_log").insert({
        user_id: userId,
        report_id: reportId,
        event_type: "analysis.pass_started",
        metadata: {
          group,
          group_label: DOCUMENT_TYPE_LABEL[group],
          sub_index: subIndex,
          sub_total: subTotal,
        },
      });
    },
    onPassCompleted: async (group, subIndex, subTotal, usage) => {
      await admin.from("audit_log").insert({
        user_id: userId,
        report_id: reportId,
        event_type: "analysis.pass_completed",
        metadata: {
          group,
          group_label: DOCUMENT_TYPE_LABEL[group],
          sub_index: subIndex,
          sub_total: subTotal,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        },
      });
    },
    onSynthesisStarted: async () => {
      await admin.from("audit_log").insert({
        user_id: userId,
        report_id: reportId,
        event_type: "analysis.synthesis_started",
        metadata: {},
      });
    },
    onSynthesisCompleted: async (usage) => {
      await admin.from("audit_log").insert({
        user_id: userId,
        report_id: reportId,
        event_type: "analysis.synthesis_completed",
        metadata: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        },
      });
    },
  });

  await admin.from("audit_log").insert({
    user_id: userId,
    report_id: reportId,
    event_type: "analysis.claude_completed",
    metadata: {
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      model: result.model,
      pass_count: result.passes.length,
    },
  });

  const extractedAddress =
    result.report.property_snapshot?.address?.trim() || null;

  const { error: updateErr } = await admin
    .from("reports")
    .update({
      status: "qa_pending",
      report_data: result.report,
      property_address: report.property_address ?? extractedAddress,
      analysis_completed_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (updateErr) {
    throw new Error(`Could not save report: ${updateErr.message}`);
  }

  await admin.from("audit_log").insert({
    user_id: userId,
    report_id: reportId,
    event_type: updateContext ? "report.updated" : "report.analyzed",
    metadata: {
      pdf_count: pdfs.length,
      files_uploaded: documents.length,
      files_skipped: failedExtractions,
      estimated_input_tokens: totalTokens,
      model: result.model,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      pass_count: result.passes.length,
      passes: result.passes,
      critical_count: result.report.critical_findings?.length ?? 0,
      moderate_count: result.report.moderate_findings?.length ?? 0,
      overall_rating: result.report.overall_rating?.label,
      is_update: Boolean(updateContext),
    },
  });

  if (userEmail && !skipNotificationEmail) {
    try {
      await sendReportReadyEmail({
        to: userEmail,
        reportId,
        propertyAddress:
          report.property_address ?? extractedAddress ?? "your property",
        report: result.report,
      });
    } catch (err) {
      console.error("[performAnalysis] report-ready email failed:", err);
    }
  }
}

async function sendReportReadyEmail(params: {
  to: string;
  reportId: string;
  propertyAddress: string;
  report: ReportData;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  const reportUrl = `${SITE_URL}/dashboard/reports/${params.reportId}`;
  const rating = params.report.overall_rating?.label ?? "Unrated";
  const criticalCount = params.report.critical_findings?.length ?? 0;
  const moderateCount = params.report.moderate_findings?.length ?? 0;
  const cosmeticCount = params.report.cosmetic_findings?.length ?? 0;

  await resend.emails.send({
    from: "Veroax Reports <contact@veroax.com>",
    to: params.to,
    subject: `Your Veroax report is ready: ${params.propertyAddress}`,
    text:
      `Your disclosure analysis for ${params.propertyAddress} is ready to review.\n\n` +
      `View the report: ${reportUrl}\n\n` +
      `Summary:\n` +
      `  Overall rating: ${rating}\n` +
      `  Critical / high findings: ${criticalCount}\n` +
      `  Moderate findings: ${moderateCount}\n` +
      `  Cosmetic findings: ${cosmeticCount}\n\n` +
      `The report is in "QA pending" status — review the findings before sharing with your client.\n\n` +
      `— Veroax\n` +
      `support@veroax.com · (866) 247-8833`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:bold;letter-spacing:-0.01em;">Veroax</h1>
          <p style="margin:6px 0 0;color:#a5b4fc;font-size:13px;">Your disclosure analysis is ready</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:24px;">
          <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a;">${escapeHtml(params.propertyAddress)}</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;">Your 14-section analysis is complete and ready to review.</p>

          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Overall rating</td>
              <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-weight:600;text-align:right;">${escapeHtml(rating)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Critical / high findings</td>
              <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-weight:600;text-align:right;">${criticalCount}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Moderate findings</td>
              <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-weight:600;text-align:right;">${moderateCount}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;">Cosmetic findings</td>
              <td style="padding:8px 0;color:#0f172a;font-weight:600;text-align:right;">${cosmeticCount}</td>
            </tr>
          </table>

          <a href="${reportUrl}" style="display:inline-block;background:#fbbf24;color:#1e1b4b;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;box-shadow:0 4px 12px rgba(251,191,36,0.25);">
            Open the full report →
          </a>

          <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.5;">
            The report is in <strong>QA pending</strong> status. Review the
            findings — especially the Critical &amp; High-Priority section —
            before sharing with your client.
          </p>
        </div>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;text-align:center;">
          Veroax, Inc · <a href="mailto:support@veroax.com" style="color:#94a3b8;">support@veroax.com</a> · (866) 247-8833
        </p>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
