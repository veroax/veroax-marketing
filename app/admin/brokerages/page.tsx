// Site-admin brokerages list. Lists every brokerage on the platform
// with its allocation (agent_seat_limit, reports_per_month), current
// seat usage, and current month's report count. Click a row to open
// the detail page where the admin can edit allocation, status, and
// invite a brokerage owner/admin.

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Brokerages, Veroax admin",
};

type BrokerageRow = {
  id: string;
  name: string;
  slug: string | null;
  dre_license: string | null;
  agent_seat_limit: number;
  reports_per_month: number;
  per_report_overage_cents: number;
  status: "active" | "paused" | "archived";
  contact_email: string | null;
  created_at: string;
};

export default async function AdminBrokeragesPage() {
  const admin = createServiceRoleClient();

  const { data: rowsData } = await admin
    .from("brokerages")
    .select(
      "id, name, slug, dre_license, agent_seat_limit, reports_per_month, per_report_overage_cents, status, contact_email, created_at",
    )
    .order("created_at", { ascending: false });
  const brokerages = (rowsData ?? []) as BrokerageRow[];

  // Seat usage per brokerage: count of distinct users across
  // brokerage_agents + the union of team_members for teams that
  // belong to this brokerage. Cheap rollup because the brokerage_id
  // sits on both tables (teams.brokerage_id, brokerage_agents.brokerage_id).
  const seatCounts = new Map<string, number>();
  if (brokerages.length > 0) {
    const brokerageIds = brokerages.map((b) => b.id);

    // Direct agents.
    const { data: directAgentsData } = await admin
      .from("brokerage_agents")
      .select("brokerage_id, user_id")
      .in("brokerage_id", brokerageIds);

    // Team-member agents (the team must be in this brokerage).
    const { data: brokerageTeamsData } = await admin
      .from("teams")
      .select("id, brokerage_id")
      .in("brokerage_id", brokerageIds);
    const teamRowsTyped = (brokerageTeamsData ?? []) as Array<{
      id: string;
      brokerage_id: string;
    }>;
    const teamToBrokerage = new Map<string, string>();
    for (const t of teamRowsTyped) teamToBrokerage.set(t.id, t.brokerage_id);

    let teamMembersData: Array<{ team_id: string; user_id: string }> = [];
    if (teamRowsTyped.length > 0) {
      const { data: tm } = await admin
        .from("team_members")
        .select("team_id, user_id")
        .in(
          "team_id",
          teamRowsTyped.map((t) => t.id),
        );
      teamMembersData = (tm ?? []) as Array<{
        team_id: string;
        user_id: string;
      }>;
    }

    // Build a set per brokerage so we de-dupe a user counted both as
    // a team_member and (hypothetically) a brokerage_agent.
    const userIdsByBrokerage = new Map<string, Set<string>>();
    for (const row of (directAgentsData ?? []) as Array<{
      brokerage_id: string;
      user_id: string;
    }>) {
      const set =
        userIdsByBrokerage.get(row.brokerage_id) ?? new Set<string>();
      set.add(row.user_id);
      userIdsByBrokerage.set(row.brokerage_id, set);
    }
    for (const row of teamMembersData) {
      const brokerageId = teamToBrokerage.get(row.team_id);
      if (!brokerageId) continue;
      const set =
        userIdsByBrokerage.get(brokerageId) ?? new Set<string>();
      set.add(row.user_id);
      userIdsByBrokerage.set(brokerageId, set);
    }
    for (const [brokerageId, set] of userIdsByBrokerage.entries()) {
      seatCounts.set(brokerageId, set.size);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Brokerages</h1>
          <p className="text-sm text-slate-500 mt-1">
            Custom-priced top-tier accounts. Each row is a separate
            contract with its own seat + report allocation.
          </p>
        </div>
        <Link
          href="/admin/brokerages/new"
          className="bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-600"
        >
          + New brokerage
        </Link>
      </header>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-5 py-3">Brokerage</th>
              <th className="text-left font-semibold px-5 py-3">Status</th>
              <th className="text-left font-semibold px-5 py-3">Seats</th>
              <th className="text-left font-semibold px-5 py-3">Reports/mo</th>
              <th className="text-left font-semibold px-5 py-3">Overage</th>
              <th className="text-left font-semibold px-5 py-3">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {brokerages.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-10 text-center text-sm text-slate-500"
                >
                  No brokerages yet. Click + New brokerage to onboard one.
                </td>
              </tr>
            ) : (
              brokerages.map((b) => {
                const usedSeats = seatCounts.get(b.id) ?? 0;
                return (
                  <tr key={b.id} className="hover:bg-slate-50/50 align-top">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/brokerages/${b.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {b.name}
                      </Link>
                      {b.dre_license ? (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          DRE #{b.dre_license}
                        </p>
                      ) : null}
                      {b.slug ? (
                        <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                          {b.slug}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={b.status} />
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {usedSeats} / {b.agent_seat_limit}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {b.reports_per_month}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      ${(b.per_report_overage_cents / 100).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {b.contact_email ?? (
                        <span className="italic text-slate-400">none</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: "active" | "paused" | "archived";
}) {
  const map: Record<string, { label: string; tone: string }> = {
    active: { label: "Active", tone: "bg-emerald-200 text-emerald-800" },
    paused: { label: "Paused", tone: "bg-amber-200 text-amber-800" },
    archived: { label: "Archived", tone: "bg-slate-200 text-slate-700" },
  };
  const s = map[status] ?? {
    label: status,
    tone: "bg-slate-200 text-slate-700",
  };
  return (
    <span
      className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${s.tone}`}
    >
      {s.label}
    </span>
  );
}
