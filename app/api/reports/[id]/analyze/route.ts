import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { analyzeDisclosurePackage } from "@/lib/anthropic/analyze";
import { getAnthropicClient } from "@/lib/anthropic/client";
import { toFile } from "@anthropic-ai/sdk";
import { countPages } from "@/lib/pdf/split";

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

  // Upload each PDF to Anthropic's Files API and collect the file_ids.
  // This is the same path the Claude Cowork app uses. Referencing files
  // by file_id avoids the inline-document 100-page total cap that hits
  // when PDFs are attached via base64 or URL sources in a single
  // Messages request.
  const anthropic = getAnthropicClient();
  const uploadedFiles: Array<{ filename: string; file_id: string; pages: number }> = [];
  const uploadedIdsForCleanup: string[] = [];
  const skipped: Array<{ filename: string; reason: string }> = [];

  // Emit a stage event so the client can show "uploading 0 of N"
  // immediately rather than waiting for the first upload to complete.
  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "analysis.upload_started",
    metadata: { total_files: pdfs.length },
  });

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

    // Count pages best-effort for diagnostics; don't fail if we can't.
    let pages = 0;
    try {
      pages = await countPages(buffer);
    } catch {
      // ignore — pages remains 0
    }

    try {
      const file = await anthropic.beta.files.upload(
        {
          file: await toFile(buffer, f.name, { type: "application/pdf" }),
        },
        {
          headers: { "anthropic-beta": "files-api-2025-04-14" },
        },
      );
      uploadedFiles.push({ filename: f.name, file_id: file.id, pages });
      uploadedIdsForCleanup.push(file.id);

      // Per-file progress event so the client can show "uploaded X of N".
      await admin.from("audit_log").insert({
        user_id: user.id,
        report_id: reportId,
        event_type: "analysis.file_uploaded",
        metadata: {
          filename: f.name,
          pages,
          uploaded_index: uploadedFiles.length,
          total_files: pdfs.length,
        },
      });
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Anthropic upload failed";
      skipped.push({ filename: f.name, reason });
    }
  }

  if (uploadedFiles.length === 0) {
    return await fail(
      supabase,
      reportId,
      "Could not upload any documents to Anthropic. " +
        (skipped.length > 0 ? `First reason: ${skipped[0].reason}` : ""),
    );
  }

  // Stage event: starting Claude analysis.
  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "analysis.claude_started",
    metadata: { uploaded_count: uploadedFiles.length },
  });

  // Run the Claude analysis.
  let result;
  try {
    result = await analyzeDisclosurePackage({
      files: uploadedFiles,
      propertyAddressHint: report.property_address,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    // Best-effort cleanup of uploaded files on failure so we don't
    // accumulate dead state in Anthropic's file store.
    void cleanupFiles(uploadedIdsForCleanup);
    return await fail(supabase, reportId, message);
  }

  // Stage event: Claude analysis complete.
  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "analysis.claude_completed",
    metadata: {
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      model: result.model,
    },
  });

  // Successful analysis — schedule cleanup of the uploaded files. They've
  // served their purpose; the structured report is now persisted in our
  // DB and we don't need to retain copies on Anthropic's side.
  void cleanupFiles(uploadedIdsForCleanup);

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
      files_uploaded: uploadedFiles.length,
      files_skipped: skipped,
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

// Best-effort cleanup of files uploaded to Anthropic for a single analysis.
// Errors are swallowed because they shouldn't block the user-facing flow.
async function cleanupFiles(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const anthropic = getAnthropicClient();
  for (const id of fileIds) {
    try {
      await anthropic.beta.files.delete(id, null, {
        headers: { "anthropic-beta": "files-api-2025-04-14" },
      });
    } catch {
      // ignore — files will age out per Anthropic's retention
    }
  }
}
