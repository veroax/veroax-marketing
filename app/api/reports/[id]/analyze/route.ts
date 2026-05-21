import { NextResponse, after } from "next/server";
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

// Concurrency lock window. Matched to the analyze function's maxDuration
// (800s) plus a small safety margin.
const ANALYSIS_LOCK_MINUTES = 15;

// Max function runtime. Vercel Pro supports up to 800s. We use after()
// to run the actual analysis work AFTER the HTTP response is sent so we
// don't hit Vercel's gateway timeout (~5min) — the function keeps
// executing in the background until maxDuration or completion.
export const maxDuration = 800;

// ============================================================================
// POST handler — performs the synchronous validation + lock-taking, then
// kicks off the heavy analysis work via after() and returns 202 immediately.
// ============================================================================

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
  // duplicate.
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

  // Take the lock by stamping analysis_started_at.
  await supabase
    .from("reports")
    .update({
      status: "analyzing",
      analysis_started_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq("id", reportId);

  // Schedule the heavy work to run AFTER the response is sent. Vercel's
  // HTTP gateway times out around 5 minutes regardless of maxDuration,
  // so running the work synchronously inside the request handler gives
  // the client a 504 even though the function is still alive. after()
  // keeps the function running for up to maxDuration (800s) while the
  // response goes out immediately.
  //
  // The user object and report are captured by closure; we use the
  // service-role client inside the background block for DB writes so
  // we don't depend on session cookies that may not survive past the
  // response.
  after(async () => {
    const admin = createServiceRoleClient();
    try {
      await performAnalysis({
        admin,
        userId: user.id,
        userEmail: user.email ?? null,
        report: {
          id: report.id,
          property_address: report.property_address,
          source_file_path: report.source_file_path,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Analysis failed.";
      try {
        await admin
          .from("reports")
          .update({ status: "failed", failure_reason: message })
          .eq("id", reportId);
      } catch (markErr) {
        console.error("[analyze] failed to mark report as failed:", markErr);
      }
      console.error("[analyze] background work failed:", err);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      status: "analyzing",
      note: "Analysis started — polling will detect completion.",
    },
    { status: 202 },
  );
}

// ============================================================================
// Background analysis worker — runs inside after() so it can take as long
// as it needs (up to maxDuration) without the HTTP client waiting.
// ============================================================================

async function performAnalysis(params: {
  admin: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  userEmail: string | null;
  report: {
    id: string;
    property_address: string | null;
    source_file_path: string | null;
  };
}): Promise<void> {
  const { admin, userId, userEmail, report } = params;
  const reportId = report.id;
  const folder = report.source_file_path ?? `${userId}/${reportId}`;

  // List PDFs in the report folder.
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

  // Stage event: extraction starting.
  await admin.from("audit_log").insert({
    user_id: userId,
    report_id: reportId,
    event_type: "analysis.upload_started",
    metadata: { total_files: pdfs.length },
  });

  // Extract text from every PDF.
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
      });
      await admin.from("audit_log").insert({
        user_id: userId,
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
      user_id: userId,
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
    user_id: userId,
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
  const result = await analyzeDisclosurePackage({
    groups,
    propertyAddressHint: report.property_address,
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

  // Stage event: combined totals.
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

  // Extract address from synthesis output to back-fill the report row
  // when the user didn't enter one at upload time.
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

  // Final audit-log summary row.
  await admin.from("audit_log").insert({
    user_id: userId,
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

  // Fire-and-forget email notification to the agent.
  if (userEmail) {
    try {
      await sendReportReadyEmail({
        to: userEmail,
        reportId,
        propertyAddress:
          report.property_address ?? extractedAddress ?? "your property",
        report: result.report,
      });
    } catch (err) {
      console.error("[analyze] report-ready email failed:", err);
    }
  }
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
