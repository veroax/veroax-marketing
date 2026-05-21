import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  analyzeDisclosurePackage,
  type Document,
} from "@/lib/anthropic/analyze";
import { extractText, estimateTokens } from "@/lib/pdf/extract";
import {
  classifyDocument,
  passGroupFor,
  DOCUMENT_TYPE_LABEL,
  type PassGroup,
} from "@/lib/pdf/classify";
import type { ReportData } from "@/lib/anthropic/schema";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

// If a report's status is "analyzing" and analysis_started_at is within
// this window, treat it as still-running and don't start a duplicate.
// Past the window, assume the previous Vercel invocation died (timeout,
// deploy, crash) and a fresh run is safe. Matched to the analyze
// function's maxDuration of 800s plus a small safety margin.
const ANALYSIS_LOCK_MINUTES = 15;

// Multi-pass analysis orchestrator. The strategy here is:
//
//   1. Download and text-extract every PDF in the report folder.
//   2. Classify each document by type (TDS/SPQ vs inspection vs HOA vs
//      hazard) using lib/pdf/classify.
//   3. Hand the classified groups to analyzeDisclosurePackage, which
//      runs focused Claude calls per group (in parallel) — each group
//      may also internally sub-split if it exceeds the per-pass budget
//      — and then a final synthesis call produces the 14-section
//      ReportData.
//   4. Save the report and write audit_log rows at each stage so the
//      AnalysisRunner can show real progress.
//
// No documents are skipped — the multi-pass design lets us process
// arbitrary-size disclosure packages even when total content exceeds
// any single context window.

// Maximum runtime for the analyze function. Vercel Pro allows up to 800s.
// Multi-pass analysis on large CA disclosure packages (700-1000 page HOA)
// can run 4-7 minutes — particularly when the largest HOA sub-batch hits
// 175K input tokens and Claude takes 3-4 minutes to process it. 800s
// gives comfortable headroom; truly extreme packages would need a real
// background-job pattern (Inngest, QStash) instead of a long Vercel call.
export const maxDuration = 800;

export async function POST(
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

  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select(
      "id, user_id, status, property_address, source_file_path, analysis_started_at",
    )
    .eq("id", reportId)
    .single();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (!["analyzing", "failed"].includes(report.status)) {
    return NextResponse.json(
      { error: `Report is already ${report.status}.`, status: report.status },
      { status: 409 },
    );
  }

  // Concurrency lock: if status="analyzing" and the previous run was
  // started recently, assume it's still in flight and don't spawn a
  // duplicate. The user can safely close the tab — the original
  // server function continues until completion and sends the email.
  const startedAt = report.analysis_started_at
    ? new Date(report.analysis_started_at)
    : null;
  const lockWindowMs = ANALYSIS_LOCK_MINUTES * 60 * 1000;
  const isWithinLock =
    startedAt && Date.now() - startedAt.getTime() < lockWindowMs;
  if (report.status === "analyzing" && isWithinLock) {
    return NextResponse.json(
      {
        ok: true,
        status: "analyzing",
        note: "Analysis already running — polling will detect completion.",
      },
      { status: 202 },
    );
  }

  // Take the lock: stamp analysis_started_at to now. This serves as the
  // concurrency guard above for any concurrent retry attempts. Also
  // clears any previous failure_reason since we're starting fresh.
  await supabase
    .from("reports")
    .update({
      status: "analyzing",
      analysis_started_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq("id", reportId);

  const admin = createServiceRoleClient();
  const folder = report.source_file_path ?? `${user.id}/${report.id}`;

  // List PDFs in the report folder.
  const { data: files, error: listErr } = await admin.storage
    .from("disclosures")
    .list(folder, { limit: 100 });
  if (listErr) {
    return await fail(supabase, reportId, `Could not list source files: ${listErr.message}`);
  }
  const pdfs = (files ?? [])
    .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (pdfs.length === 0) {
    return await fail(supabase, reportId, "No PDF files found for this report.");
  }

  // Stage event: extraction starting.
  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "analysis.upload_started",
    metadata: { total_files: pdfs.length },
  });

  // Extract text from every PDF. We do this serially because each call
  // is short, and serial keeps memory bounded. No skipping — every PDF
  // is included in classification regardless of size; multi-pass handles
  // any single-context overruns at the analysis stage.
  const documents: Document[] = [];
  const failedExtractions: Array<{ filename: string; reason: string }> = [];

  for (const f of pdfs) {
    const path = `${folder}/${f.name}`;
    const { data: blob, error: dlErr } = await admin.storage
      .from("disclosures")
      .download(path);
    if (dlErr || !blob) {
      return await fail(
        supabase,
        reportId,
        `Could not download ${f.name}: ${dlErr?.message ?? "unknown"}`,
      );
    }
    const buffer = Buffer.from(await blob.arrayBuffer());

    let extracted;
    try {
      extracted = await extractText(buffer);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Text extraction failed";
      failedExtractions.push({ filename: f.name, reason });
      // Still create a placeholder so classification + synthesis know
      // the document exists.
      documents.push({
        filename: f.name,
        text: "",
        pages: 0,
        tokens: 0,
      });
      await admin.from("audit_log").insert({
        user_id: user.id,
        report_id: reportId,
        event_type: "analysis.file_uploaded",
        metadata: {
          filename: f.name,
          extract_error: reason,
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
    });

    await admin.from("audit_log").insert({
      user_id: user.id,
      report_id: reportId,
      event_type: "analysis.file_uploaded",
      metadata: {
        filename: f.name,
        pages: extracted.pages,
        tokens: estimateTokens(extracted.text),
        uploaded_index: documents.length,
        total_files: pdfs.length,
      },
    });
  }

  // Classify documents into pass groups.
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

  // Stage event: classification done, multi-pass starting.
  const totalTokens = documents.reduce((s, d) => s + d.tokens, 0);
  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "analysis.claude_started",
    metadata: {
      document_count: documents.length,
      estimated_tokens: totalTokens,
      group_counts: {
        seller_disclosures: groups.seller_disclosures.length,
        inspections: groups.inspections.length,
        hoa: groups.hoa.length,
        hazards: groups.hazards.length,
      },
    },
  });

  // Run multi-pass analysis with progress callbacks.
  let result;
  try {
    result = await analyzeDisclosurePackage({
      groups,
      propertyAddressHint: report.property_address,
      onPassStarted: async (group, subIndex, subTotal) => {
        await admin.from("audit_log").insert({
          user_id: user.id,
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
          user_id: user.id,
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
          user_id: user.id,
          report_id: reportId,
          event_type: "analysis.synthesis_started",
          metadata: {},
        });
      },
      onSynthesisCompleted: async (usage) => {
        await admin.from("audit_log").insert({
          user_id: user.id,
          report_id: reportId,
          event_type: "analysis.synthesis_completed",
          metadata: {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
          },
        });
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    return await fail(supabase, reportId, message);
  }

  // Final stage event with combined totals (back-compat with the old
  // analysis.claude_completed event the UI already polls for).
  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "analysis.claude_completed",
    metadata: {
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      model: result.model,
      pass_count: result.passes.length,
    },
  });

  // Extract address from the synthesized report so it shows up in the
  // dashboard list when the user didn't type one at upload time.
  const extractedAddress =
    result.report.property_snapshot?.address?.trim() || null;

  const { error: updateErr } = await supabase
    .from("reports")
    .update({
      status: "qa_pending",
      report_data: result.report,
      property_address: report.property_address ?? extractedAddress,
      analysis_completed_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (updateErr) {
    return await fail(supabase, reportId, `Could not save report: ${updateErr.message}`);
  }

  // Final audit-log summary row.
  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "report.analyzed",
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
    },
  });

  // Fire-and-forget email notification to the agent. We don't await it
  // because the user already sees a "complete" indicator in their UI;
  // the email is just a nice-to-have for users who closed the tab.
  if (user.email) {
    void sendReportReadyEmail({
      to: user.email,
      reportId,
      propertyAddress:
        report.property_address ?? extractedAddress ?? "your property",
      report: result.report,
    });
  }

  return NextResponse.json({ ok: true, status: "qa_pending" });
}

// ============================================================================
// Email: report ready
// ============================================================================

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

  try {
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
  } catch (err) {
    // Don't fail the analysis if the email send fails. Log to Vercel
    // function logs for visibility.
    console.error("[analyze] report-ready email failed:", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportId: string,
  reason: string,
) {
  await supabase
    .from("reports")
    .update({ status: "failed", failure_reason: reason })
    .eq("id", reportId);
  return NextResponse.json({ error: reason }, { status: 500 });
}
