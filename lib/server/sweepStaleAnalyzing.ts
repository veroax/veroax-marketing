// Sweep reports stuck in status='analyzing' past a hard timeout.
//
// performAnalysis() catches errors and flips the row to 'failed' with
// a failure_reason — so this sweep only fires when the FUNCTION ITSELF
// is killed mid-flight (Vercel serverless timeout, OOM, network blip
// during the Anthropic call, etc). In those cases the status row stays
// 'analyzing' forever because no code path runs the cleanup.
//
// Threshold is 30 minutes by default. The longest realistic analysis
// is ~3 minutes for a heavy multi-PDF HOA-bundled package; 30 minutes
// is comfortably safe AND short enough that an agent sees a failure
// state worth retrying rather than a forever spinner.
//
// Idempotent: re-running it does nothing on the second pass. Writes
// an audit_log row per swept report so we have a trail of "Vercel
// killed this one before it finished" incidents to investigate.

import { createServiceRoleClient } from "@/lib/supabase/server";
import { notifyAlert } from "@/lib/server/alerting";

export type StaleSweepResult = {
  threshold_minutes: number;
  swept_count: number;
  swept_ids: string[];
};

const DEFAULT_THRESHOLD_MINUTES = 30;

export async function sweepStaleAnalyzing(opts?: {
  thresholdMinutes?: number;
}): Promise<StaleSweepResult> {
  const thresholdMinutes =
    opts?.thresholdMinutes ?? DEFAULT_THRESHOLD_MINUTES;
  const admin = createServiceRoleClient();
  const cutoffIso = new Date(
    Date.now() - thresholdMinutes * 60 * 1000,
  ).toISOString();

  // Find stale rows first so we can write per-row audit entries.
  const { data: staleRows, error: selErr } = await admin
    .from("reports")
    .select("id, user_id, analysis_started_at, created_at")
    .eq("status", "analyzing")
    .lt("analysis_started_at", cutoffIso);

  if (selErr) {
    console.error("[sweep] select stale failed:", selErr);
    return { threshold_minutes: thresholdMinutes, swept_count: 0, swept_ids: [] };
  }

  const rows = (staleRows ?? []) as Array<{
    id: string;
    user_id: string;
    analysis_started_at: string | null;
    created_at: string;
  }>;

  // Always write a heartbeat audit_log row so the admin health page
  // can show "cron last fired at X" even when nothing needed sweeping.
  // This is what proves the scheduler is alive.
  try {
    await admin.from("audit_log").insert({
      user_id: null,
      event_type: "cron.sweep_ran",
      metadata: {
        threshold_minutes: thresholdMinutes,
        candidate_count: rows.length,
      },
    });
  } catch (err) {
    console.error("[sweep] heartbeat audit insert failed:", err);
  }

  if (rows.length === 0) {
    return { threshold_minutes: thresholdMinutes, swept_count: 0, swept_ids: [] };
  }

  const ids = rows.map((r) => r.id);
  const failureReason = `Timed out: analysis ran longer than ${thresholdMinutes} minutes without completing. The serverless function was probably killed mid-flight. Re-run the analysis from the dashboard.`;

  const { error: updErr } = await admin
    .from("reports")
    .update({
      status: "failed",
      failure_reason: failureReason,
    })
    .in("id", ids);

  if (updErr) {
    console.error("[sweep] update failed:", updErr);
    return { threshold_minutes: thresholdMinutes, swept_count: 0, swept_ids: [] };
  }

  // Per-row audit entries. PII rule respected: only operational data.
  for (const row of rows) {
    try {
      await admin.from("audit_log").insert({
        user_id: row.user_id,
        report_id: row.id,
        event_type: "report.auto_failed_stale",
        metadata: {
          threshold_minutes: thresholdMinutes,
          analysis_started_at: row.analysis_started_at,
          age_minutes_at_sweep: row.analysis_started_at
            ? Math.round(
                (Date.now() - new Date(row.analysis_started_at).getTime()) /
                  60000,
              )
            : null,
        },
      });
    } catch (err) {
      console.error("[sweep] audit insert failed for", row.id, err);
    }
  }

  // Fire an alert when we sweep three or more reports at once.
  // That's the threshold where "one weird package timed out" tips
  // into "something systemic is broken". One-off sweeps are noisy;
  // batch sweeps are signal.
  if (rows.length >= 3) {
    await notifyAlert({
      alert_key: "sweep.batch_failures",
      severity: "warning",
      status: "firing",
      subject: `Stale-sweep flipped ${rows.length} analyses to failed`,
      body: `The stale-analyzing watchdog just swept ${rows.length} reports that had been in 'analyzing' for more than ${thresholdMinutes} minutes. That's the threshold for "probably systemic" rather than a one-off Vercel kill.\n\nThings to check, in order:\n  1. /admin/health → Synthetic heartbeats. Is Anthropic showing flaky or down?\n  2. Vercel function logs. Look for OOM or timeout patterns.\n  3. Recent failure_reason values on /admin/health → Failed section.`,
      metadata: {
        swept_count: rows.length,
        threshold_minutes: thresholdMinutes,
        swept_ids: ids.slice(0, 20), // truncate large batches
      },
    }).catch((err) => {
      console.error("[sweep] alert dispatch failed:", err);
    });
  }

  return { threshold_minutes: thresholdMinutes, swept_count: rows.length, swept_ids: ids };
}
