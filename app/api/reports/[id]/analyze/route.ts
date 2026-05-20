import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { analyzeDisclosurePackage } from "@/lib/anthropic/analyze";
import { extractText, estimateTokens } from "@/lib/pdf/extract";

// Sonnet context window. We leave headroom for the system prompt,
// tool schema, and the model's reasoning, so we cap document content
// at a value below the raw 200K limit.
const DOCUMENT_TOKEN_BUDGET = 150_000;

// Runs the disclosure analysis for a report whose source PDFs are already
// in Supabase Storage. Called by the client AnalysisRunner component once
// the user lands on /dashboard/reports/[id] with status="analyzing".

// Vercel function timeout. Free tier caps at 60s; Pro allows up to 300s.
// On free tier, large disclosure packages may exceed 60s -- the analyze
// route will return a 504-ish error and the user can retry. Upgrading to
// Pro removes this constraint.
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

  // Load the report and confirm ownership.
  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, user_id, status, property_address, source_file_path")
    .eq("id", reportId)
    .single();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Allow analysis from 'analyzing' (initial trigger from upload flow) or
  // 'failed' (retry after a previous failure). Reject if already further
  // along to avoid duplicate runs.
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
  const pdfs = (files ?? []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 0) {
    return await fail(supabase, reportId, "No PDF files found for this report.");
  }

  // Extract text from each PDF. We send Claude the text content rather
  // than PDF document attachments because Anthropic enforces a 100-page
  // total cap across all PDF document blocks in a single request — a
  // typical CA disclosure package (TDS, SPQ, AVID, NHD, HOA docs,
  // inspection report) blows past that easily. Text content blocks
  // have no equivalent page limit; only the model's context window
  // applies. Trade-off: we lose form-field/checkbox visual fidelity
  // (TDS/SPQ specifically), but pick that back up later via a hybrid
  // approach that mixes a few short PDFs with text content.
  const documents: Array<{ filename: string; text: string; pages: number }> = [];
  let totalEstimatedTokens = 0;
  const skipped: Array<{ filename: string; reason: string }> = [];

  for (const f of pdfs) {
    const path = `${folder}/${f.name}`;
    const { data: blob, error: dlErr } = await admin.storage
      .from("disclosures")
      .download(path);
    if (dlErr || !blob) {
      return await fail(
        supabase,
        reportId,
        `Could not download ${f.name}: ${dlErr?.message ?? "unknown error"}`,
      );
    }
    const buffer = Buffer.from(await blob.arrayBuffer());

    let extracted;
    try {
      extracted = await extractText(buffer);
    } catch (err) {
      // Don't fail the whole analysis on one bad PDF — extract what we
      // can and note the others in the audit log. The system prompt's
      // grounded-in-source rule will keep findings tied to documents
      // that DID extract cleanly.
      skipped.push({
        filename: f.name,
        reason: err instanceof Error ? err.message : "parse failed",
      });
      continue;
    }

    const docTokens = estimateTokens(extracted.text);

    // If adding this document would exceed budget, skip it and continue
    // with what we have. Doing this in filename order gives reasonable
    // behavior for typical packages where the most important documents
    // come first (TDS, SPQ, inspections), with HOA package boilerplate
    // last.
    if (totalEstimatedTokens + docTokens > DOCUMENT_TOKEN_BUDGET) {
      skipped.push({
        filename: f.name,
        reason: `Would exceed context budget (~${docTokens.toLocaleString()} tokens)`,
      });
      continue;
    }

    documents.push({
      filename: f.name,
      text: extracted.text,
      pages: extracted.pages,
    });
    totalEstimatedTokens += docTokens;
  }

  if (documents.length === 0) {
    return await fail(
      supabase,
      reportId,
      "Could not extract text from any of the uploaded documents.",
    );
  }

  // Run the Claude analysis.
  let result;
  try {
    result = await analyzeDisclosurePackage({
      documents,
      propertyAddressHint: report.property_address,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    return await fail(supabase, reportId, message);
  }

  // Pull the extracted property address back into the report row so it
  // shows up in the dashboard table even when the agent didn't enter one.
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

  // Audit log entry — record what we processed and how many tokens it cost.
  // Stored as metadata only; the report content lives on the reports row.
  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "report.analyzed",
    metadata: {
      pdf_count: pdfs.length,
      documents_used: documents.length,
      documents_skipped: skipped,
      estimated_input_tokens: totalEstimatedTokens,
      model: result.model,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      critical_count: result.report.critical_findings?.length ?? 0,
      moderate_count: result.report.moderate_findings?.length ?? 0,
      overall_rating: result.report.overall_rating?.label,
    },
  });

  return NextResponse.json({ ok: true, status: "qa_pending" });
}

// Helper: mark the report as failed with a reason and return a 500.
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
