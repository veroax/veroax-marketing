// Helpers for the team-management feature. All reads use the
// caller-supplied client (RLS-respecting for user-facing pages,
// service-role for admin + API routes).
//
// MVP scope:
//   - getCurrentUserMembership(): returns the org + role for the
//     signed-in user, or null if they're not in a team
//   - listOrgMembers(): full member list with profile details
//   - listOrgPendingInvites(): pending invites for the org
//   - newInviteToken(): generate a URL-safe random token
//
// One-org-per-user is enforced at the schema level (unique index on
// organization_members.user_id), so getCurrentUserMembership returns
// at most one row.

import { randomBytes } from "node:crypto";

export type OrgRole = "owner" | "admin" | "agent";

export type OrgMembership = {
  organization: {
    id: string;
    name: string;
    slug: string | null;
    owner_user_id: string;
    plan_tier: string | null;
    seat_limit: number;
    created_at: string;
  };
  role: OrgRole;
  joined_at: string;
};

export type OrgMemberWithProfile = {
  user_id: string;
  role: OrgRole;
  joined_at: string;
  email: string;
  full_name: string | null;
  is_suspended: boolean | null;
};

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
 * Fetch the current user's org membership (org row + role).
 * Returns null when the user is not in any team.
 */
export async function getCurrentUserMembership(
  client: DbClient,
  userId: string,
): Promise<OrgMembership | null> {
  // Pull the member row first; its organization_id gives us the org.
  const memberRes = await client
    .from("organization_members")
    .select("organization_id, role, joined_at")
    .eq("user_id", userId)
    .maybeSingle();
  const memberRow = memberRes.data as
    | { organization_id: string; role: OrgRole; joined_at: string }
    | null;
  if (!memberRow) return null;

  const orgRes = await client
    .from("organizations")
    .select(
      "id, name, slug, owner_user_id, plan_tier, seat_limit, created_at",
    )
    .eq("id", memberRow.organization_id)
    .maybeSingle();
  const orgRow = orgRes.data as
    | {
        id: string;
        name: string;
        slug: string | null;
        owner_user_id: string;
        plan_tier: string | null;
        seat_limit: number;
        created_at: string;
      }
    | null;
  if (!orgRow) return null;

  return {
    organization: orgRow,
    role: memberRow.role,
    joined_at: memberRow.joined_at,
  };
}

/**
 * Roles that have admin-level powers within an org. The current
 * spec is owner + admin; expand if we add more granular roles
 * later.
 */
export function isOrgAdminRole(role: OrgRole | null): boolean {
  return role === "owner" || role === "admin";
}
