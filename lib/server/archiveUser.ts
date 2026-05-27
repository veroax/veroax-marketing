// User archive (soft-delete) helpers. All four entry points go
// through here so the archive/restore semantics live in one place:
//
//   archiveUser       single, requires not-already-archived + not a team owner
//   restoreUser       single, requires currently archived + scope-respecting
//   bulkArchiveUsers  many at once, capped at MAX_BULK; partial success allowed
//   archiveUserSelf   special case (currently unused but reserved)
//
// Archive semantics:
//   1. profiles.archived_at, archived_by, archived_scope, archived_reason set
//   2. reports.share_code nulled for every report owned by the user
//      (revokes any public share URLs the agent had given out)
//   3. The user's team_members / brokerage_agents / brokerage_admins
//      rows are PRESERVED (restore puts them back in place)
//   4. Audit log entries written for the archive + the share-code
//      revocation count
//
// Restore semantics:
//   1. profiles.archived_* fields all cleared
//   2. Share codes are NOT regenerated. The agent's old links stay
//      dead. They can issue fresh share codes per-report if needed.
//   3. The user can log in again on the next sign-in attempt
//
// Login gating (the actual "can't log in" enforcement) happens in
// middleware.ts where every authenticated request checks the user's
// archived_at column.

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, "public", any>;

export type ArchiveScope = "brokerage" | "site";

export const MAX_BULK_ARCHIVE = 50;

type ArchiveResult =
  | { ok: true; share_codes_revoked: number }
  | { ok: false; error: string };

type BulkResult =
  | {
      ok: true;
      archived: number;
      skipped: Array<{ userId: string; reason: string }>;
    }
  | { ok: false; error: string };

/**
 * Archive a single user. Returns ok with the count of share codes
 * revoked, or an error string explaining why the archive could not
 * proceed (already archived; owns a team; DB error).
 */
export async function archiveUser({
  admin,
  targetUserId,
  actorUserId,
  actorEmail,
  scope,
  reason,
}: {
  admin: Admin;
  targetUserId: string;
  actorUserId: string;
  actorEmail: string | null;
  scope: ArchiveScope;
  reason?: string | null;
}): Promise<ArchiveResult> {
  // 1. Read current state.
  const { data: profileRow, error: readErr } = await admin
    .from("profiles")
    .select("id, full_name, email, archived_at")
    .eq("id", targetUserId)
    .maybeSingle();
  if (readErr) {
    return { ok: false, error: `Could not read profile: ${readErr.message}` };
  }
  const profile = profileRow as
    | {
        id: string;
        full_name: string | null;
        email: string;
        archived_at: string | null;
      }
    | null;
  if (!profile) {
    return { ok: false, error: "User not found." };
  }
  if (profile.archived_at) {
    return { ok: false, error: "User is already archived." };
  }

  // 2. Block archive if the user owns any team.
  const { data: ownedTeamsData } = await admin
    .from("teams")
    .select("id, name")
    .eq("owner_user_id", targetUserId)
    .limit(1);
  const ownedTeams = (ownedTeamsData ?? []) as Array<{
    id: string;
    name: string;
  }>;
  if (ownedTeams.length > 0) {
    return {
      ok: false,
      error: `Cannot archive ${profile.full_name?.trim() || profile.email}: they own team "${ownedTeams[0].name}". Transfer team ownership first.`,
    };
  }

  // 3. Revoke share codes by setting reports.share_code to NULL for
  //    every report owned by this user. The /r/[code] route uses
  //    share_code as the bearer token; nulling it makes every public
  //    link 404 immediately. Two-step: count first (head:true is
  //    cheap), then update. Supabase's update().select() in this SDK
  //    version doesn't accept a count modifier on the same call.
  const nowIso = new Date().toISOString();
  let shareCodesRevoked = 0;
  try {
    const { count } = await admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .not("share_code", "is", null);
    shareCodesRevoked = count ?? 0;
    if (shareCodesRevoked > 0) {
      const { error: revokeErr } = await admin
        .from("reports")
        .update({ share_code: null })
        .eq("user_id", targetUserId)
        .not("share_code", "is", null);
      if (revokeErr) {
        console.error(
          "[archiveUser] share-code revocation failed:",
          revokeErr.message,
        );
        shareCodesRevoked = 0;
      }
    }
  } catch (err) {
    console.error("[archiveUser] share-code revocation threw:", err);
    // Continue: archive is still the right move even if share-code
    // revocation hits a transient error. The archive_at flag below
    // is what gates login; the share-code revocation is a nicety.
  }

  // 4. Set the archive columns.
  const { error: updateErr } = await admin
    .from("profiles")
    .update({
      archived_at: nowIso,
      archived_by: actorUserId,
      archived_scope: scope,
      archived_reason: reason?.toString().slice(0, 500) ?? null,
    })
    .eq("id", targetUserId);
  if (updateErr) {
    return {
      ok: false,
      error: `Archive failed: ${updateErr.message}`,
    };
  }

  // 5. Audit.
  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: "user.archived",
      metadata: {
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        scope,
        reason: reason ?? null,
        share_codes_revoked: shareCodesRevoked,
      },
    });
  } catch (err) {
    console.error("[archiveUser] audit insert failed:", err);
  }

  return { ok: true, share_codes_revoked: shareCodesRevoked };
}

/**
 * Restore an archived user. Returns ok or an error string.
 *
 * Scope rule:
 *   - profile.archived_scope === 'brokerage': either the brokerage's
 *     admin OR a site admin can restore. (This helper does NOT
 *     verify the caller's role; the caller is responsible. Pass
 *     callerIsSiteAdmin = true when the actor is the site admin.)
 *   - profile.archived_scope === 'site': only a site admin can
 *     restore. callerIsSiteAdmin must be true.
 */
export async function restoreUser({
  admin,
  targetUserId,
  actorUserId,
  actorEmail,
  callerIsSiteAdmin,
}: {
  admin: Admin;
  targetUserId: string;
  actorUserId: string;
  actorEmail: string | null;
  callerIsSiteAdmin: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profileRow } = await admin
    .from("profiles")
    .select("id, archived_at, archived_scope")
    .eq("id", targetUserId)
    .maybeSingle();
  const profile = profileRow as
    | {
        id: string;
        archived_at: string | null;
        archived_scope: "brokerage" | "site" | null;
      }
    | null;
  if (!profile) return { ok: false, error: "User not found." };
  if (!profile.archived_at) {
    return { ok: false, error: "User is not archived." };
  }
  if (profile.archived_scope === "site" && !callerIsSiteAdmin) {
    return {
      ok: false,
      error:
        "This user was archived by a site admin. Contact support to restore.",
    };
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update({
      archived_at: null,
      archived_by: null,
      archived_scope: null,
      archived_reason: null,
    })
    .eq("id", targetUserId);
  if (updateErr) {
    return { ok: false, error: `Restore failed: ${updateErr.message}` };
  }

  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: "user.restored",
      metadata: {
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        was_scope: profile.archived_scope,
      },
    });
  } catch (err) {
    console.error("[restoreUser] audit insert failed:", err);
  }

  return { ok: true };
}

/**
 * Archive multiple users in one call. Each target goes through the
 * single-user archiveUser() so the same validation runs (skip
 * already-archived, skip team owners, etc.). Returns a count of
 * actually-archived rows and a list of skipped rows with reasons.
 *
 * Cap: MAX_BULK_ARCHIVE. Callers must enforce this upstream too so
 * the UI doesn't paginate a huge selection into a slow request.
 */
export async function bulkArchiveUsers({
  admin,
  targetUserIds,
  actorUserId,
  actorEmail,
  scope,
  reason,
}: {
  admin: Admin;
  targetUserIds: string[];
  actorUserId: string;
  actorEmail: string | null;
  scope: ArchiveScope;
  reason?: string | null;
}): Promise<BulkResult> {
  // Dedupe + cap.
  const unique = Array.from(new Set(targetUserIds));
  if (unique.length === 0) {
    return { ok: false, error: "No users to archive." };
  }
  if (unique.length > MAX_BULK_ARCHIVE) {
    return {
      ok: false,
      error: `Too many users selected. Maximum ${MAX_BULK_ARCHIVE} per request.`,
    };
  }

  let archived = 0;
  const skipped: Array<{ userId: string; reason: string }> = [];

  for (const userId of unique) {
    const r = await archiveUser({
      admin,
      targetUserId: userId,
      actorUserId,
      actorEmail,
      scope,
      reason,
    });
    if (r.ok) {
      archived += 1;
    } else {
      skipped.push({ userId, reason: r.error });
    }
  }

  return { ok: true, archived, skipped };
}
