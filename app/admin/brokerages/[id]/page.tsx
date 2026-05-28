// Brokerage detail page (site admin view).
//
// Shows the brokerage row's allocation, branding, status, and rosters
// (admins, teams, direct agents, pending invites). Edits go through
// PATCH /api/admin/brokerages/[id] and POST .../[id]/invite.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { EditBrokerageForm } from "./_components/EditBrokerageForm";
import { InviteBrokerageMemberForm } from "./_components/InviteBrokerageMemberForm";

export const metadata = {
  title: "Brokerage detail, Veroax admin",
};

type Params = Promise<{ id: string }>;

export default async function AdminBrokerageDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  const admin = createServiceRoleClient();
  const { data: brokerageRow } = await admin
    .from("brokerages")
    .select(
      "id, name, slug, dre_license, logo_url, brand_accent_hex, agent_seat_limit, reports_per_month, per_report_overage_cents, contract_notes, contact_email, status, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  const brokerage = brokerageRow as
    | {
        id: string;
        name: string;
        slug: string | null;
        dre_license: string | null;
        logo_url: string | null;
        brand_accent_hex: string | null;
        agent_seat_limit: number;
        reports_per_month: number;
        per_report_overage_cents: number;
        contract_notes: string | null;
        contact_email: string | null;
        status: "active" | "paused" | "archived";
        created_at: string;
      }
    | null;
  if (!brokerage) notFound();

  // Rosters: admins, teams, direct agents, pending invites.
  const [
    adminsRes,
    teamsRes,
    directAgentsRes,
    pendingInvitesRes,
  ] = await Promise.all([
    admin
      .from("brokerage_admins")
      .select("user_id, role, joined_at")
      .eq("brokerage_id", id),
    admin
      .from("teams")
      .select("id, name, slug, created_at, owner_user_id")
      .eq("brokerage_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("brokerage_agents")
      .select("user_id, joined_at")
      .eq("brokerage_id", id),
    admin
      .from("brokerage_invites")
      .select("id, email, role, team_id, status, expires_at, created_at")
      .eq("brokerage_id", id)
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
    created_at: string;
    owner_user_id: string;
  }>;
  const directAgentRows = (directAgentsRes.data ?? []) as Array<{
    user_id: string;
    joined_at: string;
  }>;
  const inviteRows = (pendingInvitesRes.data ?? []) as Array<{
    id: string;
    email: string;
    role: "owner" | "admin" | "agent";
    team_id: string | null;
    status: string;
    expires_at: string;
    created_at: string;
  }>;

  // Resolve profile info for all involved users in one query.
  const userIds = Array.from(
    new Set<string>([
      ...adminRows.map((a) => a.user_id),
      ...directAgentRows.map((a) => a.user_id),
      ...teamRows.map((t) => t.owner_user_id),
    ]),
  );
  const { data: profilesData } =
    userIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds)
      : { data: [] as Array<{ id: string; email: string; full_name: string | null }> };
  const profileMap = new Map<
    string,
    { id: string; email: string; full_name: string | null }
  >();
  for (const p of (profilesData ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
  }>) {
    profileMap.set(p.id, p);
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-slate-500">
            <Link href="/admin/brokerages" className="hover:text-slate-900">
              Brokerages
            </Link>{" "}
            <span className="text-slate-300">/</span> {brokerage.name}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {brokerage.name}
          </h1>
          {brokerage.dre_license ? (
            <p className="text-sm text-slate-500 mt-1">
              DRE #{brokerage.dre_license}
            </p>
          ) : null}
        </div>
      </header>

      {/* Allocation + status editor */}
      <section>
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Allocation + status
        </h2>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <EditBrokerageForm brokerage={brokerage} />
        </div>
      </section>

      {/* Admins */}
      <section>
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Brokerage admins
        </h2>
        <RosterList
          empty="No admins yet. Invite one below."
          rows={adminRows.map((a) => {
            const p = profileMap.get(a.user_id);
            return {
              primary:
                p?.full_name?.trim() || p?.email || a.user_id.slice(0, 8),
              secondary: p?.email ?? "",
              right: a.role,
              joined_at: a.joined_at,
            };
          })}
        />
      </section>

      {/* Teams */}
      <section>
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Teams
        </h2>
        <RosterList
          empty="No teams yet. Invite a team owner below."
          rows={teamRows.map((t) => {
            const p = profileMap.get(t.owner_user_id);
            return {
              primary: t.name,
              secondary: `Owner: ${
                p?.full_name?.trim() || p?.email || t.owner_user_id.slice(0, 8)
              }`,
              right: "Team",
              joined_at: t.created_at,
            };
          })}
        />
      </section>

      {/* Direct agents */}
      <section>
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Direct agents (no team)
        </h2>
        <RosterList
          empty="No direct agents."
          rows={directAgentRows.map((a) => {
            const p = profileMap.get(a.user_id);
            return {
              primary:
                p?.full_name?.trim() || p?.email || a.user_id.slice(0, 8),
              secondary: p?.email ?? "",
              right: "Agent",
              joined_at: a.joined_at,
            };
          })}
        />
      </section>

      {/* Pending invites */}
      {inviteRows.length > 0 ? (
        <section>
          <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
            Pending invites
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">Email</th>
                  <th className="text-left font-semibold px-5 py-3">Role</th>
                  <th className="text-left font-semibold px-5 py-3">Sent</th>
                  <th className="text-left font-semibold px-5 py-3">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inviteRows.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-5 py-3 text-slate-900 break-all">
                      {inv.email}
                    </td>
                    <td className="px-5 py-3 text-slate-700 capitalize">
                      {inv.role}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(inv.created_at).toLocaleDateString("en-US", {
                        timeZone: "America/Los_Angeles",
                      })}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(inv.expires_at).toLocaleDateString("en-US", {
                        timeZone: "America/Los_Angeles",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Invite form */}
      <section>
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Invite to this brokerage
        </h2>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <InviteBrokerageMemberForm
            brokerageId={brokerage.id}
            teams={teamRows.map((t) => ({ id: t.id, name: t.name }))}
          />
        </div>
      </section>
    </div>
  );
}

function RosterList({
  rows,
  empty,
}: {
  rows: Array<{
    primary: string;
    secondary: string;
    right: string;
    joined_at: string;
  }>;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-500">
        {empty}
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <li
            key={i}
            className="px-5 py-3 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900 truncate">{r.primary}</p>
              {r.secondary ? (
                <p className="text-[11px] text-slate-500 truncate">
                  {r.secondary}
                </p>
              ) : null}
            </div>
            <div className="text-right whitespace-nowrap">
              <p className="text-xs text-slate-700 capitalize">{r.right}</p>
              <p className="text-[10px] text-slate-400">
                {new Date(r.joined_at).toLocaleDateString("en-US", {
                  timeZone: "America/Los_Angeles",
                })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
