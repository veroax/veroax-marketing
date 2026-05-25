// Brokerage-side membership helpers. Mirrors lib/team/membership.ts
// for the brokerage layer added in migration 0021.
//
// A user can be one of these things at most:
//   - a team_member (team-only, no brokerage)
//   - a team_member whose team belongs to a brokerage (cascades up)
//   - a brokerage_agent directly under a brokerage (no team)
//   - a brokerage_admin (owner/admin of the brokerage itself)
//   - nothing at all (solo)
//
// A brokerage admin may ALSO be a team member somewhere; that's
// allowed because brokerage_admins gates admin access by ownership
// not by team membership.

export type BrokerageRole = "owner" | "admin";

export type BrokerageContext = {
  brokerage: {
    id: string;
    name: string;
    slug: string | null;
    dre_license: string | null;
    logo_url: string | null;
    brand_accent_hex: string | null;
    agent_seat_limit: number;
    reports_per_month: number;
    per_report_overage_cents: number;
    status: "active" | "paused" | "archived";
    created_at: string;
  };
  // The user's relationship to the brokerage. `admin_role` is set if
  // they're an owner/admin of the brokerage; `is_direct_agent` is
  // true if they're listed as a direct brokerage_agents row; `via_team`
  // is true if they're on a team that belongs to the brokerage.
  admin_role: BrokerageRole | null;
  is_direct_agent: boolean;
  via_team: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

/**
 * Resolve the caller's brokerage context. Returns null when the user
 * has no relationship to any brokerage. When the user belongs to
 * MULTIPLE brokerages (theoretically possible via the admin role
 * across a brokerage they don't agent for), prefers the admin role.
 */
export async function getCurrentUserBrokerageContext(
  client: DbClient,
  userId: string,
): Promise<BrokerageContext | null> {
  // 1. Brokerage admin row wins. A user is at most one row in each
  //    table; the schema does not unique-index brokerage_admins on
  //    user_id alone (a user could in principle admin two brokerages),
  //    but the founder rule is one brokerage per admin in practice.
  const adminRes = await client
    .from("brokerage_admins")
    .select("brokerage_id, role")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const adminRow = adminRes.data as
    | { brokerage_id: string; role: BrokerageRole }
    | null;

  // 2. Direct brokerage agent.
  const agentRes = await client
    .from("brokerage_agents")
    .select("brokerage_id")
    .eq("user_id", userId)
    .maybeSingle();
  const agentRow = agentRes.data as { brokerage_id: string } | null;

  // 3. Team -> brokerage cascade.
  const teamMemberRes = await client
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();
  const teamMember = teamMemberRes.data as { team_id: string } | null;
  let teamBrokerageId: string | null = null;
  if (teamMember?.team_id) {
    const teamRes = await client
      .from("teams")
      .select("brokerage_id")
      .eq("id", teamMember.team_id)
      .maybeSingle();
    teamBrokerageId =
      (teamRes.data as { brokerage_id: string | null } | null)
        ?.brokerage_id ?? null;
  }

  // Decide which brokerage we return. Admin wins, then direct agent,
  // then cascaded team. If multiple disagree, prefer the admin row.
  const brokerageId =
    adminRow?.brokerage_id ?? agentRow?.brokerage_id ?? teamBrokerageId;
  if (!brokerageId) return null;

  const brokerageRes = await client
    .from("brokerages")
    .select(
      "id, name, slug, dre_license, logo_url, brand_accent_hex, agent_seat_limit, reports_per_month, per_report_overage_cents, status, created_at",
    )
    .eq("id", brokerageId)
    .maybeSingle();
  const brokerageRow = brokerageRes.data as
    | BrokerageContext["brokerage"]
    | null;
  if (!brokerageRow) return null;

  return {
    brokerage: brokerageRow,
    admin_role:
      adminRow?.brokerage_id === brokerageId ? adminRow.role : null,
    is_direct_agent:
      agentRow?.brokerage_id === brokerageId,
    via_team: teamBrokerageId === brokerageId,
  };
}

/**
 * Strict admin check (owner or admin role on the given brokerage).
 */
export function isBrokerageAdmin(
  context: BrokerageContext | null,
): boolean {
  return context?.admin_role === "owner" || context?.admin_role === "admin";
}
