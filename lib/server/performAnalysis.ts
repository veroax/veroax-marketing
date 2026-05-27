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
import { countPages, splitPdfIfNeeded } from "@/lib/pdf/split";
import { safeFileMetadata } from "@/lib/audit/safe";

// Must match PDF_PASS_PAGE_BUDGET in lib/anthropic/analyze.ts. Duplicated
// here (not imported) because the in-memory re-split runs BEFORE the
// analyzer sees the files, and the analyzer's per-call bin-packer
// assumes every Document already fits comfortably. Imported from the
// shared module so a 90-page chunk uploaded under an older
// MAX_PAGES_PER_CHUNK gets re-split into <=60-page sub-documents
// before reaching Claude.
import {
  PDF_PASS_PAGE_BUDGET as PDF_PER_CALL_PAGE_BUDGET,
  GROUP_MODE as GROUP_TRANSPORT,
} from "@/lib/pdf/limits";
import {
  classifyDocument,
  passGroupFor,
  DOCUMENT_TYPE_LABEL,
  type PassGroup,
} from "@/lib/pdf/classify";
import type { ReportData } from "@/lib/anthropic/schema";
import { composeAgentStrengthsAndConcerns } from "@/lib/reports/summary";
import { composeExecutiveNarrative } from "@/lib/reports/narrative";
import { generateShareCode } from "@/lib/share/code";
import { consumeReportCredit, freeUpdateWindow } from "@/lib/billing/credits";

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
  // PII rule: do not store raw filenames anywhere audit_log can see
  // them. Each entry holds the safe digest + extension + reason.
  const failedExtractions: Array<{
    filename_sha256_12: string;
    extension: string | null;
    reason: string;
  }> = [];

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
          failedExtractions.push({ ...safeFileMetadata(f.name), reason });
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
              ...safeFileMetadata(f.name),
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
            ...safeFileMetadata(f.name),
            pages: extracted.pages,
            tokens: estimateTokens(extracted.text),
            transport: "pdf_fallback_text",
            uploaded_index: documents.length,
            total_files: pdfs.length,
          },
        });
        continue;
      }

      // Defensive in-memory re-split. Legacy reports were uploaded
      // under MAX_PAGES_PER_CHUNK = 90, but a 90-page native PDF
      // attachment at ~2000 tokens/page is 180K + system-prompt
      // overhead → over the 200K context. We re-split anything
      // larger than PDF_PER_CALL_PAGE_BUDGET into in-memory sub-
      // chunks here so the analyzer's bin-packer doesn't blow the
      // window. New uploads (MAX_PAGES_PER_CHUNK = 60) skip this
      // path entirely; this is a no-op for them.
      const subChunks =
        pages > PDF_PER_CALL_PAGE_BUDGET
          ? await splitPdfIfNeeded(buffer, f.name, PDF_PER_CALL_PAGE_BUDGET)
          : [{ name: f.name, buffer }];

      for (const chunk of subChunks) {
        const chunkPages =
          subChunks.length === 1
            ? pages
            : await countPages(chunk.buffer).catch(() => 0);
        documents.push({
          filename: chunk.name,
          text: "",
          pages: chunkPages,
          // Per-page input-token estimate updated to 2000 to match
          // observed PDF token cost (scanned/image-heavy pages run
          // 1700-2000+; clean text PDFs run lower). This estimate is
          // used by the analyzer's bin-packer only as a budget hint;
          // actual cost is what Claude reports.
          tokens: chunkPages * 2000,
          addedAt,
          pdfBase64: chunk.buffer.toString("base64"),
        });
        await admin.from("audit_log").insert({
          user_id: userId,
          report_id: reportId,
          event_type: "analysis.file_uploaded",
          metadata: {
            ...safeFileMetadata(chunk.name),
            pages: chunkPages,
            tokens: chunkPages * 2000,
            transport: "pdf",
            uploaded_index: documents.length,
            total_files: pdfs.length,
            // Surface in-memory re-splits to the audit log so the
            // agent (and future me) can tell which Documents came
            // from a legacy oversized storage object vs. a clean
            // one-to-one mapping. We log the SOURCE filename hash
            // (not the raw name) for the same PII reason.
            in_memory_subchunk:
              subChunks.length > 1
                ? {
                    ...safeFileMetadata(f.name),
                    total_sub_chunks: subChunks.length,
                  }
                : undefined,
          },
        });
      }
      continue;
    }

    // Text-mode path (hoa, hazards) — unchanged from prior behavior.
    let extracted;
    try {
      extracted = await extractText(buffer);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Text extraction failed";
      failedExtractions.push({ ...safeFileMetadata(f.name), reason });
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
          ...safeFileMetadata(f.name),
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
        ...safeFileMetadata(f.name),
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

  // Generate a public share code if the report doesn't already have
  // one. Generated on first completion and preserved across reruns —
  // the public link stays stable so the agent can hand it to the
  // buyer once and not have to re-share when the analysis is
  // refreshed (re-analysis updates the data the share link
  // resolves to).
  const { data: existing } = await admin
    .from("reports")
    .select("share_code")
    .eq("id", reportId)
    .maybeSingle();
  const existingShareCode =
    typeof (existing as { share_code?: unknown } | null)?.share_code ===
    "string"
      ? ((existing as { share_code: string }).share_code as string)
      : null;
  const shareCode = existingShareCode ?? generateShareCode();

  const { error: updateErr } = await admin
    .from("reports")
    .update({
      status: "qa_pending",
      report_data: result.report,
      property_address: report.property_address ?? extractedAddress,
      analysis_completed_at: new Date().toISOString(),
      share_code: shareCode,
    })
    .eq("id", reportId);
  if (updateErr) {
    throw new Error(`Could not save report: ${updateErr.message}`);
  }

  // Credit consumption — happens AFTER the report data is saved so a
  // failure here doesn't leave us in a "spent the credit but the
  // report didn't actually save" state. Two paths:
  //
  // - Original analysis (no updateContext): always consume a credit.
  //   Sets reports.billable=true (and reports.watermarked=true on the
  //   trial path).
  // - Re-analysis (updateContext present): only consume a credit if
  //   the report is OUTSIDE the 30-day free-update window. freeUpdate-
  //   Window reads reports.created_at.
  //
  // If the report has already been marked billable on a previous run
  // (e.g., admin restart on a completed report), consumption is
  // skipped so we don't double-charge for re-analysis of the same
  // logical report.
  try {
    const { data: existingForBilling } = await admin
      .from("reports")
      .select("billable, created_at")
      .eq("id", reportId)
      .maybeSingle();
    const alreadyBillable = Boolean(
      (existingForBilling as { billable?: boolean } | null)?.billable,
    );
    const createdAt = (existingForBilling as { created_at?: string } | null)
      ?.created_at;

    const isUpdate = Boolean(updateContext);
    const withinFreeWindow =
      isUpdate && createdAt ? freeUpdateWindow(createdAt) : false;

    if (!alreadyBillable && !withinFreeWindow) {
      await consumeReportCredit(userId, reportId);
    } else if (withinFreeWindow) {
      // Audit-log the free use of the update window so the billing
      // dashboard can show it.
      await admin.from("report_credit_ledger").insert({
        user_id: userId,
        amount: 0,
        reason: "free_update_window",
        report_id: reportId,
        metadata: { is_update: true, within_30_days: true },
      });
    }
  } catch (creditErr) {
    // Credit-consumption failure shouldn't fail the analysis — the
    // report data is already saved. Log + continue so an admin can
    // reconcile later.
    console.error(
      "[performAnalysis] credit consumption failed:",
      creditErr instanceof Error ? creditErr.message : creditErr,
    );
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

  // Talking points + strengths/concerns from the SAME helpers that
  // power the dashboard's on-screen summary, the PDF cover's executive
  // summary, and the client-facing email draft. Single source of truth
  // for what shows up across every surface — so the agent's first
  // impression in this email matches what they'll see on the dashboard.
  const narrative = composeExecutiveNarrative(params.report);
  const { strengths, concerns } = composeAgentStrengthsAndConcerns(params.report);

  // Rating drives the hero color so the agent's eye lands on the right
  // signal first. Excellent / Good / Acceptable are green; Significant
  // Concerns is amber; Walk Away is red.
  const ratingTone = ratingToHeroTone(rating);

  // Cost summary — buyer out-of-pocket only (HOA-paid is informational
  // and lives in the PDF). The synthesizer now scopes grand_total to
  // buyer-pays so we can surface it directly.
  const grand = params.report.cost_summary?.grand_total;
  const costLine =
    grand && grand.high > 0
      ? `${formatUsdCompact(grand.low)}–${formatUsdCompact(grand.high)}`
      : null;

  const subject =
    rating === "Walk Away" || rating === "Significant Concerns"
      ? `[${rating}] Veroax report: ${params.propertyAddress}`
      : `Veroax report ready: ${params.propertyAddress}`;

  await resend.emails.send({
    from: "Veroax Reports <contact@veroax.com>",
    to: params.to,
    subject,
    text: buildReportReadyPlainText({
      propertyAddress: params.propertyAddress,
      reportUrl,
      rating,
      criticalCount,
      moderateCount,
      cosmeticCount,
      costLine,
      narrative,
      strengths: strengths.map((s) => s.text),
      concerns: concerns.map((c) => c.text),
    }),
    html: buildReportReadyHtml({
      propertyAddress: params.propertyAddress,
      reportUrl,
      rating,
      ratingBg: ratingTone.bg,
      ratingFg: ratingTone.fg,
      ratingBadge: ratingTone.badge,
      criticalCount,
      moderateCount,
      cosmeticCount,
      costLine,
      narrative,
      strengths: strengths.map((s) => s.text),
      concerns: concerns.map((c) => c.text),
    }),
  });
}

function ratingToHeroTone(rating: string): {
  bg: string;
  fg: string;
  badge: string;
} {
  // Hero band background, text color on it, and the pill background
  // behind the rating label. Chosen for legibility on most email
  // clients (Gmail, Outlook 365, Apple Mail).
  switch (rating) {
    case "Excellent":
    case "Good":
      return { bg: "#065f46", fg: "#ffffff", badge: "#a7f3d0" };
    case "Acceptable":
      return { bg: "#1e1b4b", fg: "#ffffff", badge: "#fcd34d" };
    case "Significant Concerns":
      return { bg: "#9a3412", fg: "#ffffff", badge: "#fed7aa" };
    case "Walk Away":
      return { bg: "#7f1d1d", fg: "#ffffff", badge: "#fecaca" };
    default:
      return { bg: "#1e1b4b", fg: "#ffffff", badge: "#a5b4fc" };
  }
}

function formatUsdCompact(n: number): string {
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

function buildReportReadyPlainText(args: {
  propertyAddress: string;
  reportUrl: string;
  rating: string;
  criticalCount: number;
  moderateCount: number;
  cosmeticCount: number;
  costLine: string | null;
  narrative: string[];
  strengths: string[];
  concerns: string[];
}): string {
  return [
    `Your Veroax disclosure analysis for ${args.propertyAddress} is ready.`,
    "",
    `OVERALL RATING: ${args.rating}`,
    `Findings: ${args.criticalCount} critical/high · ${args.moderateCount} moderate · ${args.cosmeticCount} cosmetic`,
    ...(args.costLine
      ? [`Buyer out-of-pocket exposure: ${args.costLine}`]
      : []),
    "",
    "AGENT SUMMARY",
    ...args.narrative.flatMap((p) => [p, ""]),
    "TOP STRENGTHS",
    ...args.strengths.map((s, i) => `  ${i + 1}. ${s}`),
    "",
    "TOP CONCERNS",
    ...args.concerns.map((c, i) => `  ${i + 1}. ${c}`),
    "",
    `Open the full report: ${args.reportUrl}`,
    "",
    "— Veroax",
    "support@veroax.com · (866) 247-8833",
  ].join("\n");
}

function buildReportReadyHtml(args: {
  propertyAddress: string;
  reportUrl: string;
  rating: string;
  ratingBg: string;
  ratingFg: string;
  ratingBadge: string;
  criticalCount: number;
  moderateCount: number;
  cosmeticCount: number;
  costLine: string | null;
  narrative: string[];
  strengths: string[];
  concerns: string[];
}): string {
  const narrativeHtml = args.narrative
    .map(
      (p) =>
        `<p style="margin:0 0 10px;color:#334155;line-height:1.6;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const liGreen = (items: string[]) =>
    items
      .map(
        (s) =>
          `<li style="margin:0 0 6px;color:#022c22;line-height:1.5;">${escapeHtml(s)}</li>`,
      )
      .join("");
  const liRed = (items: string[]) =>
    items
      .map(
        (s) =>
          `<li style="margin:0 0 6px;color:#450a0a;line-height:1.5;">${escapeHtml(s)}</li>`,
      )
      .join("");

  const costRow = args.costLine
    ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Buyer out-of-pocket</td><td style="padding:6px 0;color:#0f172a;font-weight:700;text-align:right;font-size:13px;">${escapeHtml(args.costLine)}</td></tr>`
    : "";

  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;line-height:1.55;max-width:600px;margin:0 auto;">
    <div style="background-color:${args.ratingBg};color:${args.ratingFg};padding:24px 24px 20px;border-radius:12px 12px 0 0;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.85;margin:0 0 6px;">Veroax · Disclosure Analysis</div>
      <div style="font-size:18px;font-weight:700;line-height:1.3;margin:0 0 14px;">${escapeHtml(args.propertyAddress)}</div>
      <div style="display:inline-block;background-color:${args.ratingBadge};color:#0f172a;font-weight:700;font-size:11px;padding:6px 12px;border-radius:6px;letter-spacing:0.5px;text-transform:uppercase;">${escapeHtml(args.rating)}</div>
    </div>

    <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:20px 22px;">
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Critical / high findings</td><td style="padding:6px 0;color:#0f172a;font-weight:700;text-align:right;font-size:13px;">${args.criticalCount}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Moderate findings</td><td style="padding:6px 0;color:#0f172a;font-weight:700;text-align:right;font-size:13px;">${args.moderateCount}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Cosmetic findings</td><td style="padding:6px 0;color:#0f172a;font-weight:700;text-align:right;font-size:13px;">${args.cosmeticCount}</td></tr>
        ${costRow}
      </table>

      <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 14px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#334155;text-transform:uppercase;margin:0 0 10px;">Agent Summary</div>
        ${narrativeHtml}
      </div>

      <div style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 16px;margin:0 0 12px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#065f46;text-transform:uppercase;margin:0 0 8px;">Top Strengths</div>
        <ol style="margin:0;padding:0 0 0 20px;">${liGreen(args.strengths)}</ol>
      </div>

      <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:0 0 18px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#991b1b;text-transform:uppercase;margin:0 0 8px;">Top Concerns</div>
        <ol style="margin:0;padding:0 0 0 20px;">${liRed(args.concerns)}</ol>
      </div>

      <div style="text-align:center;margin:6px 0 0;">
        <a href="${args.reportUrl}" style="display:inline-block;background:#fbbf24;color:#1e1b4b;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;box-shadow:0 4px 12px rgba(251,191,36,0.25);">Open the full report →</a>
      </div>

      <p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.5;">
        Review the Critical &amp; High-Priority section before sharing with your client. The client-facing PDF preserves the same talking points and findings.
      </p>
    </div>

    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;text-align:center;">
      Veroax, Inc · <a href="mailto:support@veroax.com" style="color:#94a3b8;">support@veroax.com</a> · (866) 247-8833
    </p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
