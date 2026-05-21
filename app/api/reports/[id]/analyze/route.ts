import { NextResponse } from "next/server";
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

export const maxDuration = 300;

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
    .select("id, user_id, status, property_address, source_file_path")
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

  return NextResponse.json({ ok: true, status: "qa_pending" });
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
