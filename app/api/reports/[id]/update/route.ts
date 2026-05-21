import { NextResponse, after } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { performAnalysis } from "@/lib/server/performAnalysis";
import { countPages } from "@/lib/pdf/split";

// Append additional documents to an existing report and trigger
// full-package re-analysis.
//
// Pricing rule (per agreed product decisions):
//   - Updates within 30 DAYS of reports.created_at are FREE.
//   - Outside that window, the update consumes a report credit the
//     SAME way /api/reports/create does.
//
//   Today, /api/reports/create does NOT enforce a credit gate
//   (subscription billing is via Stripe; usage counting lives in the
//   roadmap, not in code). To preserve parity, /update also does NOT
//   block — it logs a billable.update_outside_30d event into
//   audit_log so usage tracking can settle the balance later. When
//   /create grows real credit checks, /update will mirror them.

export const maxDuration = 800;

const ANALYSIS_LOCK_MINUTES = 15;
const FREE_UPDATE_WINDOW_DAYS = 30;

export async function POST(
  request: Request,
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
    .select("id, user_id, status, property_address, source_file_path, created_at, report_data, original_files, update_count, analysis_started_at")
    .eq("id", reportId)
    .single();
  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Don't allow updates while a previous analysis is mid-flight.
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
          "An analysis is already in progress for this report. " +
          "Wait for it to finish before adding documents.",
      },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
  if (paths.length === 0) {
    return NextResponse.json(
      { error: "No file paths supplied." },
      { status: 400 },
    );
  }

  // ----- Pricing gate ------------------------------------------------
  // Compute days since original analysis. Outside the free window we
  // log a billable event but don't block today — see header comment.
  const createdAtMs = new Date(report.created_at).getTime();
  const ageDays = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
  const insideFreeWindow = ageDays <= FREE_UPDATE_WINDOW_DAYS;

  const admin = createServiceRoleClient();
  if (!insideFreeWindow) {
    // TODO(credit-gate): when /api/reports/create enforces credit
    // availability, mirror that check here and return 402 with
    // {"error":"Update requires a report credit. Upgrade your plan or
    // pay an overage."} if the user has insufficient balance.
    await admin.from("audit_log").insert({
      user_id: user.id,
      report_id: reportId,
      event_type: "billable.update_outside_30d",
      metadata: {
        age_days: Math.round(ageDays),
        new_paths_count: paths.length,
      },
    });
  }

  // ----- Snapshot current state -------------------------------------
  // Capture an immutable copy of the report as it stands BEFORE this
  // re-analysis kicks off. The agent will be able to download this
  // snapshot from the Version history disclosure on the report page,
  // with an explicit "this isn't the latest version" affirmation.
  const updateCount = (report.update_count ?? 0) + 1;
  const snapshot = {
    version_number: updateCount,
    snapshotted_at: new Date().toISOString(),
    report_data: report.report_data ?? null,
    original_files: report.original_files ?? null,
    source_file_path: report.source_file_path ?? null,
    status: report.status,
    pdf_blob_path: null as string | null,
  };

  // Append snapshot via service-role client because RLS on `versions`
  // would otherwise block jsonb array mutation across the snapshot.
  const { data: current } = await admin
    .from("reports")
    .select("versions")
    .eq("id", reportId)
    .single();
  const existingVersions = Array.isArray(current?.versions)
    ? current!.versions
    : [];
  const newVersions = [...existingVersions, snapshot];

  // ----- Count pages on the newly-added files + merge into inventory
  const folder = `${user.id}/${reportId}`;
  const addedFilenames: string[] = [];
  const addedFileEntries: Array<{
    name: string;
    pages: number;
    size_kb: number;
  }> = [];

  for (const p of paths) {
    const filename = p.split("/").pop() ?? p;
    addedFilenames.push(filename);

    try {
      const { data: blob, error: dlErr } = await admin.storage
        .from("disclosures")
        .download(p);
      if (dlErr || !blob) {
        throw new Error(dlErr?.message ?? "Could not download.");
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      const pages = await countPages(buffer);
      addedFileEntries.push({
        name: filename,
        pages,
        size_kb: Math.round(buffer.length / 1024),
      });
    } catch (err) {
      // Inventory failure here is non-fatal — the analyze step will
      // still see the file in storage. Log it and continue.
      console.error("[update] page-count failed for", p, err);
      addedFileEntries.push({
        name: filename,
        pages: 0,
        size_kb: 0,
      });
    }
  }

  const existingOriginalFiles = Array.isArray(report.original_files)
    ? (report.original_files as Array<{
        name: string;
        pages: number;
        size_kb: number;
      }>)
    : [];
  // Dedupe by filename — if the agent re-uploads a file with the same
  // name, the new metadata overrides the older entry.
  const nameSet = new Set(addedFileEntries.map((e) => e.name));
  const mergedOriginalFiles = [
    ...existingOriginalFiles.filter((e) => !nameSet.has(e.name)),
    ...addedFileEntries,
  ];

  // ----- Flip status to analyzing + persist ---------------------------
  const originalAnalysisDate = (
    report.report_data &&
    typeof report.report_data === "object" &&
    "analysis_completed_at" in (report.report_data as Record<string, unknown>)
      ? ((report.report_data as { analysis_completed_at?: string })
          .analysis_completed_at as string | undefined)
      : null
  ) ?? new Date(report.created_at).toISOString();

  const updateDate = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("reports")
    .update({
      status: "analyzing",
      analysis_started_at: updateDate,
      last_updated_at: updateDate,
      update_count: updateCount,
      versions: newVersions,
      original_files: mergedOriginalFiles,
      failure_reason: null,
    })
    .eq("id", reportId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await admin.from("audit_log").insert({
    user_id: user.id,
    report_id: reportId,
    event_type: "report.update_started",
    metadata: {
      update_count: updateCount,
      added_filenames: addedFilenames,
      inside_free_window: insideFreeWindow,
      age_days: Math.round(ageDays),
    },
  });

  // ----- Kick off the re-analysis in the background -------------------
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
        updateContext: {
          originalAnalysisDate,
          updateDate,
          addedFilenames,
        },
        // Don't double-email the agent for re-analysis. The update is
        // initiated by them from the dashboard; they're already watching
        // the page.
        skipNotificationEmail: true,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Update analysis failed.";
      try {
        await admin
          .from("reports")
          .update({ status: "failed", failure_reason: message })
          .eq("id", reportId);
      } catch (markErr) {
        console.error("[update] failed to mark report as failed:", markErr);
      }
      console.error("[update] background work failed:", err);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      status: "analyzing",
      update_count: updateCount,
      inside_free_window: insideFreeWindow,
      added_count: addedFilenames.length,
    },
    { status: 202 },
  );
}
