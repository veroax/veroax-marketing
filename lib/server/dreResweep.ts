// Quarterly DRE re-verification sweep.
//
// Walks profiles that have a DRE license on file and re-runs the
// public-site lookup against the DRE. Catches:
//   - Licenses that have expired since the agent's initial sign-up
//   - Renewals that flipped a previously expired/suspended row back
//     to LICENSED
//   - Parser failures from earlier runs (status='error') that we want
//     to retry without bothering the agent
//   - Name updates on either side (profile or DRE)
//
// Selection rule: pick rows where dre_license is set AND any of:
//   a) dre_verification_checked_at IS NULL (never checked, edge case)
//   b) dre_verification_checked_at older than RESWEEP_INTERVAL_DAYS
//   c) dre_verification_status = 'error' (always retry)
//
// Capped at MAX_PER_RUN per invocation so a single cron tick can't
// fan out to thousands of HTTP calls against the DRE site. Sequenced
// (not parallel) with a small inter-request delay so we stay polite.
// At 50 profiles per day and a 90-day TTL the steady-state pool is
// ~4,500 active DRE-licensed agents, which is plenty of headroom for
// the foreseeable future, well past initial product-market fit.
//
// Idempotent: re-running it inside the same day picks up at most a
// few rows that happen to cross the 90-day threshold between runs.
// Per-row audit_log entries record outcome so the admin can see a
// clean trail of "license expired between checks" events.

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  verifyDreLicense,
  persistDreResult,
  type DreVerificationStatus,
} from "@/lib/server/dreVerify";

export type DreResweepResult = {
  interval_days: number;
  candidate_count: number;
  checked_count: number;
  outcomes: Record<DreVerificationStatus, number>;
  // IDs that flipped from 'verified' to something else this run.
  // These are the ones an admin probably wants to follow up on
  // (license lapsed, name changed at the DRE, etc.).
  newly_unverified_ids: string[];
};

// 90 days, matches the user-specified quarterly cadence.
const RESWEEP_INTERVAL_DAYS = 90;

// Per-invocation cap. Cron runs daily; with this limit + the 90-day
// TTL we can comfortably handle ~4,500 active DRE-licensed accounts
// in steady state before the queue starts backing up.
const MAX_PER_RUN = 50;

// Small spacing between DRE requests so we don't hammer the public
// site. The DRE form is slow (~1-2s response), so this is mostly
// belt-and-suspenders, but it costs nothing to be polite.
const INTER_REQUEST_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyOutcomes(): Record<DreVerificationStatus, number> {
  return {
    verified: 0,
    mismatch: 0,
    inactive: 0,
    expired: 0,
    suspended: 0,
    revoked: 0,
    not_found: 0,
    error: 0,
  };
}

export async function runDreResweep(opts?: {
  intervalDays?: number;
  limit?: number;
}): Promise<DreResweepResult> {
  const intervalDays = opts?.intervalDays ?? RESWEEP_INTERVAL_DAYS;
  const limit = opts?.limit ?? MAX_PER_RUN;
  const admin = createServiceRoleClient();
  const cutoffIso = new Date(
    Date.now() - intervalDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Query candidates. The .or() expression covers the "never checked",
  // "stale", and "error" branches in a single round-trip. Order by
  // checked_at ASC NULLS FIRST so the never-checked rows + the oldest
  // rechecks come up first, this is what we want as soon as the cron
  // starts picking up real traffic.
  const { data: candidatesRaw, error: selErr } = await admin
    .from("profiles")
    .select(
      "id, dre_license, full_name, dre_verification_status, dre_verification_checked_at",
    )
    .not("dre_license", "is", null)
    .or(
      `dre_verification_checked_at.is.null,dre_verification_checked_at.lt.${cutoffIso},dre_verification_status.eq.error`,
    )
    .order("dre_verification_checked_at", {
      ascending: true,
      nullsFirst: true,
    })
    .limit(limit);

  if (selErr) {
    console.error("[dre-resweep] candidate select failed:", selErr);
    return {
      interval_days: intervalDays,
      candidate_count: 0,
      checked_count: 0,
      outcomes: emptyOutcomes(),
      newly_unverified_ids: [],
    };
  }

  const candidates = (candidatesRaw ?? []) as Array<{
    id: string;
    dre_license: string | null;
    full_name: string | null;
    dre_verification_status: DreVerificationStatus | null;
    dre_verification_checked_at: string | null;
  }>;

  // Heartbeat: always write a cron.dre_resweep_ran row so /admin/health
  // can prove the scheduler is alive even on no-op runs.
  try {
    await admin.from("audit_log").insert({
      user_id: null,
      event_type: "cron.dre_resweep_ran",
      metadata: {
        interval_days: intervalDays,
        candidate_count: candidates.length,
        cutoff_iso: cutoffIso,
      },
    });
  } catch (err) {
    console.error("[dre-resweep] heartbeat audit insert failed:", err);
  }

  if (candidates.length === 0) {
    return {
      interval_days: intervalDays,
      candidate_count: 0,
      checked_count: 0,
      outcomes: emptyOutcomes(),
      newly_unverified_ids: [],
    };
  }

  const outcomes = emptyOutcomes();
  const newlyUnverifiedIds: string[] = [];
  let checkedCount = 0;

  for (const row of candidates) {
    if (!row.dre_license) continue;
    try {
      const previousStatus = row.dre_verification_status;
      const result = await verifyDreLicense({
        licenseId: row.dre_license,
        agentFullName: row.full_name,
      });
      await persistDreResult(admin, row.id, result);
      outcomes[result.status] += 1;
      checkedCount += 1;

      // Track the "this used to be fine and now it isn't" set so
      // /admin/health can highlight the actionable cases.
      if (
        previousStatus === "verified" &&
        result.status !== "verified"
      ) {
        newlyUnverifiedIds.push(row.id);
        try {
          await admin.from("audit_log").insert({
            user_id: row.id,
            event_type: "dre.resweep_flagged",
            metadata: {
              previous_status: previousStatus,
              new_status: result.status,
              remote_status: result.remote_status,
              remote_name: result.remote_name,
              error_message: result.error_message,
            },
          });
        } catch (err) {
          console.error(
            "[dre-resweep] flag audit insert failed for",
            row.id,
            err,
          );
        }
      }
    } catch (err) {
      console.error("[dre-resweep] check failed for", row.id, err);
      outcomes.error += 1;
    }

    // Be polite to the DRE site.
    if (INTER_REQUEST_DELAY_MS > 0) {
      await sleep(INTER_REQUEST_DELAY_MS);
    }
  }

  return {
    interval_days: intervalDays,
    candidate_count: candidates.length,
    checked_count: checkedCount,
    outcomes,
    newly_unverified_ids: newlyUnverifiedIds,
  };
}
