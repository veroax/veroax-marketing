// Brokerage admin dashboard. The "home" for a brokerage owner/admin.
//
// Layout mirrors /dashboard/team but at the brokerage level:
//   - Allocation usage (seats used / limit, reports this period / limit)
//   - Teams roster (each team under this brokerage + member count)
//   - Direct agents roster
//   - Brokerage admins roster
//   - Recent brokerage-wide reports
//
// Access: any brokerage_admins row. Direct brokerage agents see a
// limited view; team_members under a brokerage do NOT land here, they
// land at /dashboard/team.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { SUPPORT } from "@/lib/site";
import {
  getCurrentUserBrokerageContext,
  isBrokerageAdmin,
} from "@/lib/brokerage/admin";
import { RosterManager } from "./_components/RosterManager";

export const metadata = {
  title: "Brokerage, Veroax",
};

export default async function DashboardBrokeragePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/brokerage");

  const context = await getCurrentUserBrokerageContext(supabase, user.id);
  if (!context) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Brokerage</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            You&apos;re not part of a brokerage. Brokerage accounts are
            site-admin onboarded. Email{" "}
            <a
              href={`mailto:${SUPPORT.email}`}
              className="text-indigo-700 underline"
            >
              {SUPPORT.email}
            </a>{" "}
            to talk about brokerage pricing.
          </p>
        </header>
      </div>
    );
  }

  // Non-admins (direct agents or team-members under a brokerage) get a
  // tiny view; only admins see the full management surface.
  if (!isBrokerageAdmin(context)) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">
            {context.brokerage.name}
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            You&apos;re an agent on this brokerage. Your reports + team
            view live under{" "}
            <Link
              href="/dashboard"
              className="text-indigo-700 underline"
            >
              /dashboard
            </Link>
            . To make changes to brokerage settings, contact your
            brokerage owner.
          </p>
        </header>
      </div>
    );
  }

  const { brokerage } = context;
  const admin = createServiceRoleClient();

  // Roster + usage queries.
  const [adminsRes, teamsRes, directAgentsRes, invitesRes] =
    await Promise.all([
      admin
        .from("brokerage_admins")
        .select("user_id, role, joined_at")
        .eq("brokerage_id", brokerage.id),
      admin
        .from("teams")
        .select("id, name, slug, owner_user_id, created_at")
        .eq("brokerage_id", brokerage.id)
        .order("created_at", { ascending: true }),
      admin
        .from("brokerage_agents")
        .select("user_id, joined_at")
        .eq("brokerage_id", brokerage.id),
      admin
        .from("brokerage_invites")
        .select("id, email, role, team_id, created_at, expires_at")
        .eq("brokerage_id", brokerage.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  const adminRows = (adminsRes.data ?? []) as Array<{
    user_id: string;
    role: "owner" | "admin";
    joined_at: string;
  }>;
  const teamRows = (teamsRes.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string | null;
    owner_user_id: string;
    created_at: string;
  }>;
  const directAgentRows = (directAgentsRes.data ?? []) as Array<{
    user_id: string;
    joined_at: string;
  }>;
  const inviteRows = (invitesRes.data ?? []) as Array<{
    id: string;
    email: string;
    role: string;
    team_id: string | null;
    created_at: string;
    expires_at: string;
  }>;

  // Full team-membership rows so the manager UI can list each agent
  // with their team affiliation and seed the transfer-owner dropdown.
  let allTeamMembers: Array<{
    team_id: string;
    user_id: string;
    role: "owner" | "admin" | "agent";
  }> = [];
  if (teamRows.length > 0) {
    const { data: tm } = await admin
      .from("team_members")
      .select("team_id, user_id, role")
      .in(
        "team_id",
        teamRows.map((t) => t.id),
      );
    allTeamMembers = (tm ?? []) as Array<{
      team_id: string;
      user_id: string;
      role: "owner" | "admin" | "agent";
    }>;
  }

  const teamMembersByTeam = new Map<string, number>();
  for (const m of allTeamMembers) {
    teamMembersByTeam.set(
      m.team_id,
      (teamMembersByTeam.get(m.team_id) ?? 0) + 1,
    );
  }

  // Seat-count math: archived agents do NOT count toward the seat
  // limit. We resolve archived_at after fetching profiles below and
  // subtract them from the active total.
  const grossSeatsUsed =
    directAgentRows.length + allTeamMembers.length;

  // Reports usage for the current month (UTC start of month).
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const { count: reportsThisMonth } = await admin
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("brokerage_id", brokerage.id)
    .gte("created_at", periodStart.toISOString());

  // Recent reports.
  const { data: recentReportsData } = await admin
    .from("reports")
    .select(
      "id, user_id, status, property_address, client_name, report_name, created_at, team_id",
    )
    .eq("brokerage_id", brokerage.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const recentReports = (recentReportsData ?? []) as Array<{
    id: string;
    user_id: string;
    status: string;
    property_address: string | null;
    client_name: string | null;
    report_name: string | null;
    created_at: string;
    team_id: string | null;
  }>;

  // Profile lookup for all rosters. Now also fetches archived_at +
  // archived_scope so the manager UI can render the archived
  // section + skip archived agents from the seat-count math.
  const userIds = Array.from(
    new Set<string>([
      ...adminRows.map((a) => a.user_id),
      ...directAgentRows.map((a) => a.user_id),
      ...teamRows.map((t) => t.owner_user_id),
      ...allTeamMembers.map((m) => m.user_id),
      ...recentReports.map((r) => r.user_id),
    ]),
  );
  const { data: profilesData } =
    userIds.length > 0
      ? await admin
          .from("profiles")
          .select(
            "id, email, full_name, archived_at, archived_scope",
          )
          .in("id", userIds)
      : { data: [] as Array<{ id: string; email: string; full_name: string | null; archived_at: string | null; archived_scope: string | null }> };
  const profileMap = new Map<
    string,
    {
      id: string;
      email: string;
      full_name: string | null;
      archived_at: string | null;
      archived_scope: "brokerage" | "site" | null;
    }
  >();
  for (const p of (profilesData ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
    archived_at: string | null;
    archived_scope: "brokerage" | "site" | null;
  }>) {
    profileMap.set(p.id, p);
  }

  // Seat-count net of archived agents (matches the SeatLimit
  // calculation we want to display to the brokerage admin).
  const archivedSeatCount = [
    ...allTeamMembers,
    ...directAgentRows,
  ].filter((m) => profileMap.get(m.user_id)?.archived_at).length;
  const totalSeatsUsed = grossSeatsUsed - archivedSeatCount;

  // Build the RosterAgent[] flat list for RosterManager. Combines
  // team_members + direct agents. Each agent gets:
  //   team_id / team_name (null for direct agents)
  //   role_label (the team role or "Direct agent")
  //   is_team_owner (team.owner_user_id === user_id)
  //   archived_at + archived_scope (from profile)
  const teamById = new Map(teamRows.map((t) => [t.id, t]));
  const rosterAgents: Array<{
    user_id: string;
    full_name: string | null;
    email: string;
    role_label: string;
    team_id: string | null;
    team_name: string | null;
    is_team_owner: boolean;
    archived_at: string | null;
    archived_scope: "brokerage" | "site" | null;
  }> = [];

  for (const m of allTeamMembers) {
    const p = profileMap.get(m.user_id);
    if (!p) continue;
    const t = teamById.get(m.team_id);
    rosterAgents.push({
      user_id: m.user_id,
      full_name: p.full_name,
      email: p.email,
      role_label:
        m.role === "owner"
          ? "Team owner"
          : m.role === "admin"
            ? "Team admin"
            : "Team agent",
      team_id: m.team_id,
      team_name: t?.name ?? null,
      is_team_owner: t?.owner_user_id === m.user_id,
      archived_at: p.archived_at,
      archived_scope: p.archived_scope,
    });
  }
  for (const a of directAgentRows) {
    const p = profileMap.get(a.user_id);
    if (!p) continue;
    rosterAgents.push({
      user_id: a.user_id,
      full_name: p.full_name,
      email: p.email,
      role_label: "Direct agent",
      team_id: null,
      team_name: null,
      is_team_owner: false,
      archived_at: p.archived_at,
      archived_scope: p.archived_scope,
    });
  }

  // Compose RosterTeam[] for the transfer-owner UI.
  const rosterTeams = teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    owner_user_id: t.owner_user_id,
    members: allTeamMembers
      .filter((m) => m.team_id === t.id)
      .map((m) => {
        const p = profileMap.get(m.user_id);
        return {
          user_id: m.user_id,
          full_name: p?.full_name ?? null,
          email: p?.email ?? "",
        };
      }),
  }));

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {brokerage.name}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Brokerage admin view
            {brokerage.dre_license ? ` · DRE #${brokerage.dre_license}` : ""}
          </p>
        </div>
      </header>

      {/* Allocation tiles */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          label="Seats used"
          value={`${totalSeatsUsed} / ${brokerage.agent_seat_limit}`}
        />
        <StatTile
          label="Reports this period"
          value={`${reportsThisMonth ?? 0} / ${brokerage.reports_per_month}`}
        />
        <StatTile
          label="Overage"
          value={`$${(brokerage.per_report_overage_cents / 100).toFixed(2)} / report`}
        />
      </section>

      {/* Interactive roster manager. Replaces the previous read-only
          teams + direct-agents sections. Handles per-agent archive,
          bulk archive, team-owner transfer, invite revocation, and
          the collapsed archived-agents section. */}
      <RosterManager
        agents={rosterAgents}
        teams={rosterTeams}
        pendingInvites={inviteRows}
      />

      {/* Recent reports */}
      <section>
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Recent reports
        </h2>
        {recentReports.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-500">
            No reports yet. Once your agents start generating reports
            they will appear here.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Property</th>
                  <th className="text-left font-semibold px-5 py-3">Agent</th>
                  <th className="text-left font-semibold px-5 py-3">Status</th>
                  <th className="text-left font-semibold px-5 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentReports.map((r) => {
                  const p = profileMap.get(r.user_id);
                  const display =
                    r.property_address?.trim() ||
                    r.report_name?.trim() ||
                    "Untitled report";
                  return (
                    <tr key={r.id}>
                      <td className="px-5 py-3">
                        <Link
                          href={`/dashboard/reports/${r.id}`}
                          className="font-medium text-slate-900 hover:text-indigo-700"
                        >
                          {display}
                        </Link>
                        {r.client_name ? (
                          <p className="text-[11px] text-slate-500">
                            {r.client_name}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {p?.full_name?.trim() ||
                          p?.email ||
                          r.user_id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600">
                        {r.status}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
