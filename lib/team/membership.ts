// Helpers for the team-management feature, rebuilt on top of the
// brokerage/team schema introduced in migration 0021.
//
// The schema now has three concepts that USED to all be called
// "organization":
//   - brokerages: top-level, custom-priced, site-admin-managed.
//   - teams: up to 10 members on the Team tier OR a child of a brokerage.
//   - team_members / brokerage_admins / brokerage_agents: membership rows.
//
// This file is the team-facing surface. Brokerage-specific lookups
// live in lib/brokerage/admin.ts. The two cooperate when a team is
// part of a brokerage.
//
// One-team-per-user is enforced at the schema level (unique index on
// team_members.user_id), so getCurrentUserMembership returns at most
// one row.

import { randomBytes } from "node:crypto";

export type TeamRole = "owner" | "admin" | "agent";
// Backwards-compatible alias. A few callers still import OrgRole.
export type OrgRole = TeamRole;

export type TeamMembership = {
  team: {
    id: string;
    name: string;
    slug: string | null;
    owner_user_id: string;
    brokerage_id: string | null;
    logo_url: string | null;
    brand_accent_hex: string | null;
    seat_limit: number;
    created_at: string;
  };
  role: TeamRole;
  joined_at: string;
};

// Backwards-compatible alias for the old return shape that exposed
// the team under the `organization` key.
export type OrgMembership = {
  organization: TeamMembership["team"] & { plan_tier: string | null };
  role: TeamRole;
  joined_at: string;
};

export type TeamMemberWithProfile = {
  user_id: string;
  role: TeamRole;
  joined_at: string;
  email: string;
  full_name: string | null;
  is_suspended: boolean | null;
};
export type OrgMemberWithProfile = TeamMemberWithProfile;

export type PendingInvite = {
  id: string;
  email: string;
  role: "admin" | "agent";
  invited_by: string | null;
  inviter_email: string | null;
  inviter_full_name: string | null;
  token: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
};

// Generate a 32-character URL-safe invite token. ~190 bits of
// entropy, plenty to make brute-force token guessing infeasible.
export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

// Supabase client surface we touch. Typed as `any` to dodge
// "Type instantiation is excessively deep" diagnostics that the
// generated Supabase types emit when this is used inside long
// chains. Callers pass either createClient() (user-scoped) or
// createServiceRoleClient() (bypasses RLS); both satisfy this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

/**
 * Fetch the current user's team membership (team row + role).
 * Returns null when the user is not on any team. A user can be a
 * direct brokerage agent without being on a team; this helper does
 * NOT cover that case (see lib/brokerage/admin.ts).
 */
export async function getCurrentUserMembership(
  client: DbClient,
  userId: string,
): Promise<TeamMembership | null> {
  const memberRes = await client
    .from("team_members")
    .select("team_id, role, joined_at")
    .eq("user_id", userId)
    .maybeSingle();
  const memberRow = memberRes.data as
    | { team_id: string; role: TeamRole; joined_at: string }
    | null;
  if (!memberRow) return null;

  const teamRes = await client
    .from("teams")
    .select(
      "id, name, slug, owner_user_id, brokerage_id, logo_url, brand_accent_hex, seat_limit, created_at",
    )
    .eq("id", memberRow.team_id)
    .maybeSingle();
  const teamRow = teamRes.data as TeamMembership["team"] | null;
  if (!teamRow) return null;

  return {
    team: teamRow,
    role: memberRow.role,
    joined_at: memberRow.joined_at,
  };
}

/**
 * Roles that have admin-level powers within a team. The current spec
 * is owner + admin; expand if we add more granular roles later.
 */
export function isTeamAdminRole(role: TeamRole | null): boolean {
  return role === "owner" || role === "admin";
}

// Old name kept around for the small number of callers that still
// import it (no behavioral difference; team admins are the same set
// of roles as the old "org admins" were).
export const isOrgAdminRole = isTeamAdminRole;
