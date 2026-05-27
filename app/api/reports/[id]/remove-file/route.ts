import { NextResponse, after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { performAnalysis } from "@/lib/server/performAnalysis";
import { safeFileMetadata } from "@/lib/audit/safe";
import { requireUser } from "@/lib/auth/require";

// POST /api/reports/[id]/remove-file
//
// Removes a single file the agent uploaded to this report (and any
// _part_N split siblings created by lib/pdf/split.ts), then forces
// a full-package re-analysis on the remaining files. Same shape as
// /update, snapshot the current state into versions[], flip status
// to analyzing, kick the heavy work into after().
//
// Body: { filename: string }
//   filename: the name as it appears in reports.original_files (the
//   user-visible name, e.g. "1._Disclosures.pdf"). The route handles
//   the _part_N siblings automatically.

export const maxDuration = 800;

const ANALYSIS_LOCK_MINUTES = 15;
const FREE_UPDATE_WINDOW_DAYS = 30;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const body = await request.json().catch(() => ({}));
  const filename =
    typeof body?.filename === "string" ? body.filename.trim() : "";
  if (!filename) {
    return NextResponse.json(
      { error: "filename is required." },
      { status: 400 },
    );
  }

  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, user_id, status, property_address, source_file_path, created_at, report_data, original_files, update_count, analysis_started_at")
    .eq("id", reportId)
    .single();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Don't allow file removal while a previous analysis is running.
  const startedAt = report.analysis_started_at
    ? new Date(report.analysis_started_at)
    : null;
  const isWithinLock =
    startedAt &&
    Date.now() - startedAt.getTime() < ANALYSIS_LOCK_MINUTES * 60 * 1000;
  if (report.status === "analyzing" && isWithinLock) {
    return NextResponse.json(
      {
        error:
          "An analysis is already running for this report. Wait for it to finish before removing a file.",
      },
      { status: 409 },
    );
  }

  // Reject removal that would leave no files behind, at that point
  // the agent should just delete the report (or upload fresh
  // documents via /upload). Returning an error keeps the rest of
  // the system in a coherent state.
  const existingOriginalFiles = Array.isArray(report.original_files)
    ? (report.original_files as Array<{
        name: string;
        pages: number;
        size_kb: number;
      }>)
    : [];
  const matchedEntry = existingOriginalFiles.find((e) => e.name === filename);
  if (!matchedEntry) {
    return NextResponse.json(
      { error: `Could not find "${filename}" on this report.` },
      { status: 404 },
    );
  }
  if (existingOriginalFiles.length === 1) {
    return NextResponse.json(
      {
        error:
          "Can't remove the last remaining file, at least one disclosure file must stay on the report. Archive the report or start a new one if you need to replace everything.",
      },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const folder = report.source_file_path ?? `${user.id}/${reportId}`;
  const createdAtMs = new Date(report.created_at).getTime();
  const ageDays = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
  const insideFreeWindow = ageDays <= FREE_UPDATE_WINDOW_DAYS;

  if (!insideFreeWindow) {
    // Same pattern as /update, log a billable event for the
    // future credit-gate code to consume; don't block today.
    await admin.from("audit_log").insert({
      user_id: user.id,
      report_id: reportId,
      event_type: "billable.file_removal_outside_30d",
      metadata: {
        age_days: Math.round(ageDays),
        filename,
      },
    });
  }

  // ----- Snapshot the prior state into versions[] ------------------
  // Same shape as /update so the version-download path works the
  // same way for a file-removal-driven snapshot as an add-docs one.
  const updateCount = (report.update_count ?? 0) + 1;
  const snapshot = {
    version_number: updateCount,
    snapshotted_at: new Date().toISOString(),
    report_data: report.report_data ?? null,
    original_files: existingOriginalFiles,
    source_file_path: report.source_file_path ?? null,
    status: report.status,
    pdf_blob_path: null as string | null,
    removed_filename: filename,
  };
  const { data: current } = await admin
    .from("reports")
    .select("versions")
    .eq("id", reportId)
    .single();
  const versions = Array.isArray(current?.versions)
    ? current!.versions
    : [];
  const newVersions = [...versions, snapshot];

  // ----- Find storage objects to delete ---------------------------
  // The filename in original_files matches the storage object name
  // for non-split files. For split files, the original was
  // "<base>.pdf" but the stored objects are "<base>_part_<N>.pdf".
  // List the folder, match by exact name OR by the
  // <base>_part_<N>.pdf pattern, then remove all.
  const { data: storedFiles, error: listErr } = await admin.storage
    .from("disclosures")
    .list(folder, { limit: 100 });
  if (listErr) {
    return NextResponse.json(
      { error: `Could not list storage folder: ${listErr.message}` },
      { status: 500 },
    );
  }

  const baseWithoutExt = filename.replace(/\.pdf$/i, "");
  const partPattern = new RegExp(
    `^${baseWithoutExt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_part_\\d+\\.pdf$`,
    "i",
  );

  const pathsToDelete = (storedFiles ?? [])
    .filter((f) => f.name === filename || partPattern.test(f.name))
    .map((f) => `${folder}/${f.name}`);

  if (pathsToDelete.length === 0) {
    // The DB row referenced the file but storage didn't have it.
    // Continue, still drop the row from original_files; this is
    // probably a stale entry from an interrupted upload.
    console.warn(
      `[remove-file] no storage objects matched for ${filename} on report ${reportId}`,
    );
  } else {
    const { error: rmErr } = await admin.storage
      .from("disclosures")
      .remove(pathsToDelete);
    if (rmErr) {
      return NextResponse.json(
        {
          error: `Could not delete storage objects: ${rmErr.message}`,
        },
        { status: 500 },
      );
    }
  }

  // ----- Drop the file from original_files ------------------------
  const remainingOriginalFiles = existingOriginalFiles.filter(
    (e) => e.name !== filename,
  );

  // ----- Flip status to analyzing + persist -----------------------
  const updateDate = new Date().toISOString();
  const originalAnalysisDate =
    typeof (report.report_data as { analysis_completed_at?: string } | null)
      ?.analysis_completed_at === "string"
      ? ((report.report_data as { analysis_completed_at?: string })
          .analysis_completed_at as string)
      : new Date(report.created_at).toISOString();

  const { error: updateErr } = await admin
    .from("reports")
    .update({
      status: "analyzing",
      analysis_started_at: updateDate,
      last_updated_at: updateDate,
      update_count: updateCount,
      versions: newVersions,
      original_files: remainingOriginalFiles,
      failure_reason: null,
    })
    .eq("id", reportId);
  if (updateErr) {
    return NextResponse.json(
      { error: `Could not save report: ${updateErr.message}` },
      { status: 500 },
    );
  }

  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "report.file_removed",
    metadata: {
      // PII rule: store the hashed filename, not the raw name.
      removed_file: safeFileMetadata(filename),
      remaining_count: remainingOriginalFiles.length,
      storage_objects_deleted: pathsToDelete.length,
      update_count: updateCount,
      inside_free_window: insideFreeWindow,
    },
  });

  // ----- Kick off re-analysis in the background --------------------
  // No updateContext, this isn't an "added docs" scenario, it's a
  // re-analysis on the leaner package. The findings should simply
  // reflect what's left.
  after(async () => {
    try {
      await performAnalysis({
        admin,
        userId: user.id,
        userEmail: user.email ?? null,
        report: {
          id: report.id,
          property_address: report.property_address,
          source_file_path: report.source_file_path ?? folder,
        },
        // We don't pass updateContext here, there are no new added
        // files, just fewer existing ones. The analyzer reads
        // whatever PDFs remain in the folder.
        updateContext: null,
        skipNotificationEmail: true,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Re-analysis failed.";
      try {
        await admin
          .from("reports")
          .update({ status: "failed", failure_reason: message })
          .eq("id", reportId);
      } catch (markErr) {
        console.error(
          "[remove-file] failed to mark report as failed:",
          markErr,
        );
      }
      console.error("[remove-file] background work failed:", err);
    }
    // After-the-fact suppression for unused variable in this scope
    void originalAnalysisDate;
  });

  return NextResponse.json(
    {
      ok: true,
      status: "analyzing",
      removed: filename,
      remaining: remainingOriginalFiles.length,
      storage_objects_deleted: pathsToDelete.length,
      inside_free_window: insideFreeWindow,
    },
    { status: 202 },
  );
}
