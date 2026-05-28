// Vercel cron endpoint for permanently purging soft-deleted
// reports past the 30-day grace window.
//
// Triggered daily by vercel.json. Auth matches the other cron
// endpoints (sweep-stale-reports, dre-resweep, synthetic-
// heartbeat): in production the Bearer CRON_SECRET is required;
// in dev unauthenticated calls are allowed for local testing.
//
// Sequence per row:
//   1. List files in disclosures/{user_id}/{report_id}/ via the
//      service-role storage client.
//   2. Remove all listed paths in one storage.remove() call.
//   3. Delete the reports row.
//   4. Write a "report.permanently_purged" audit_log entry.
//
// Capped at PURGE_BATCH_SIZE per invocation so a single cron tick
// can't fan out unbounded. At 50 per day the system can absorb
// roughly 1,500 monthly deletions in steady state, well above
// anything we'll see at current scale.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

const PURGE_BATCH_SIZE = 50;
export const maxDuration = 300; // 5 minutes; storage listing + delete is the slow part

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && cronSecret) {
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  // Heartbeat row so /admin/health can prove the cron is firing
  // even when there's nothing to purge.
  try {
    await admin.from("audit_log").insert({
      user_id: null,
      event_type: "cron.purge_deleted_ran",
      metadata: { batch_size: PURGE_BATCH_SIZE },
    });
  } catch (err) {
    console.error("[purge-deleted-reports] heartbeat insert failed:", err);
  }

  const { data: dueRowsRaw, error: selErr } = await admin
    .from("reports")
    .select("id, user_id, source_file_path")
    .not("deleted_at", "is", null)
    .lte("purge_after", nowIso)
    .limit(PURGE_BATCH_SIZE);
  if (selErr) {
    console.error("[purge-deleted-reports] select failed:", selErr);
    return NextResponse.json(
      { error: `Select failed: ${selErr.message}` },
      { status: 500 },
    );
  }

  const rows = (dueRowsRaw ?? []) as Array<{
    id: string;
    user_id: string;
    source_file_path: string | null;
  }>;
  let purged = 0;
  let failed = 0;

  for (const r of rows) {
    try {
      // Storage cleanup. Folder convention used everywhere else
      // in the app: disclosures/{user_id}/{report_id}/. Falls back
      // to the report's source_file_path when set (legacy rows).
      const folder = r.source_file_path ?? `${r.user_id}/${r.id}`;
      const { data: files } = await admin.storage
        .from("disclosures")
        .list(folder, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${folder}/${f.name}`);
      if (paths.length > 0) {
        await admin.storage.from("disclosures").remove(paths);
      }

      const { error: delErr } = await admin
        .from("reports")
        .delete()
        .eq("id", r.id);
      if (delErr) {
        console.error(
          `[purge-deleted-reports] delete failed on ${r.id}:`,
          delErr,
        );
        failed += 1;
        continue;
      }

      try {
        await admin.from("audit_log").insert({
          user_id: null,
          report_id: r.id,
          event_type: "report.permanently_purged",
          metadata: {
            report_owner_id: r.user_id,
            file_count: paths.length,
            folder,
          },
        });
      } catch (err) {
        console.error(
          `[purge-deleted-reports] audit insert failed on ${r.id}:`,
          err,
        );
      }

      purged += 1;
    } catch (err) {
      console.error(`[purge-deleted-reports] threw on ${r.id}:`, err);
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: rows.length,
    purged,
    failed,
  });
}
