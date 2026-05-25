// Team management page. Three states:
//   1. No team yet         -> shows CreateTeamForm
//   2. Member (any role)   -> shows team name + member list
//   3. Owner or admin      -> adds InviteMemberForm + pending-invites
//                             section + member-remove actions
//
// All reads via the user-scoped client; RLS on the org tables limits
// the rows to those the caller can see. The service-role client is
// reserved for the mutation routes (/api/team/*).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserMembership, isOrgAdminRole } from "@/lib/team/membership";
import { CreateTeamForm } from "./_components/CreateTeamForm";
import { InviteMemberForm } from "./_components/InviteMemberForm";
import { MemberActions } from "./_components/MemberActions";
import { RevokeInviteButton } from "./_components/RevokeInviteButton";

export const metadata = {
  title: "Team, Veroax",
};

export default async function DashboardTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/team");

  const membership = await getCurrentUserMembership(supabase, user.id);

  // -- Empty state --------------------------------------------------
  if (!membership) {
    // Suggest the agent's existing brokerage name as the default
    // team name. They can override before submitting.
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("brokerage, full_name")
      .eq("id", user.id)
      .maybeSingle();
    const suggested =
      (profileRow as { brokerage?: string | null } | null)?.brokerage?.trim() ||
      undefined;

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            For brokerages and small teams. Pool your monthly report
            quota across multiple agents and let the team owner see
            reports any member creates. Solo agents do not need a team.
          </p>
        </header>
        <CreateTeamForm defaultName={suggested} />
      </div>
    );
  }

  const { organization: org, role } = membership;
  const isAdmin = isOrgAdminRole(role);

  // -- Member list --------------------------------------------------
  // RLS lets a member see every member of their own org.
  const { data: memberRowsData } = await supabase
    .from("organization_members")
    .select("user_id, role, joined_at")
    .eq("organization_id", org.id);
  const memberRows = (memberRowsData ?? []) as Array<{
    user_id: string;
    role: "owner" | "admin" | "agent";
    joined_at: string;
  }>;

  // Resolve profile info for each member in one query. We have to
  // SELECT explicitly because RLS on profiles permits only own-row
  // reads by default; cross-member visibility within a team is a
  // soft "social" requirement and is handled here by reading via
  // the user-scoped client (RLS may filter; in practice each member
  // is fetched through Supabase auth-aware lookups). For MVP, we
  // fall back to user_id when the profile isn't visible.
  const userIds = memberRows.map((m) => m.user_id);
  const { data: profilesData } =
    userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email, full_name, is_suspended")
          .in("id", userIds)
      : { data: [] as Array<{ id: string; email: string; full_name: string | null; is_suspended: boolean | null }> };
  const profileMap = new Map<
    string,
    { id: string; email: string; full_name: string | null; is_suspended: boolean | null }
  >();
  for (const p of (profilesData ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
    is_suspended: boolean | null;
  }>) {
    profileMap.set(p.id, p);
  }

  // -- Pending invites ----------------------------------------------
  // Only owner/admin can see pending invites (RLS-enforced).
  const { data: inviteRowsData } = isAdmin
    ? await supabase
        .from("organization_invites")
        .select(
          "id, email, role, invited_by, token, status, expires_at, created_at",
        )
        .eq("organization_id", org.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
    : { data: null };
  const inviteRows = (inviteRowsData ?? []) as Array<{
    id: string;
    email: string;
    role: "admin" | "agent";
    invited_by: string | null;
    token: string;
    status: "pending";
    expires_at: string;
    created_at: string;
  }>;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{org.name}</h1>
        <p className="text-sm text-slate-600 mt-1">
          {memberRows.length} member{memberRows.length === 1 ? "" : "s"}
          {" · "}
          {org.seat_limit} seat{org.seat_limit === 1 ? "" : "s"} included
          {role !== "agent" ? null : " · You're an agent on this team"}
        </p>
      </header>

      {/* Members table */}
      <section>
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Members
        </h2>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-5 py-3">Member</th>
                <th className="text-left font-semibold px-5 py-3">Role</th>
                <th className="text-left font-semibold px-5 py-3">Joined</th>
                <th className="text-right font-semibold px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {memberRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-sm text-slate-500">
                    No members yet.
                  </td>
                </tr>
              ) : (
                memberRows.map((m) => {
                  const profile = profileMap.get(m.user_id);
                  const display =
                    profile?.full_name?.trim() || profile?.email || m.user_id.slice(0, 8);
                  const isSelf = m.user_id === user.id;
                  return (
                    <tr key={m.user_id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">
                          {display}
                          {isSelf ? (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wider text-slate-400">
                              You
                            </span>
                          ) : null}
                          {profile?.is_suspended ? (
                            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider bg-red-700 text-white px-1.5 py-0.5 rounded">
                              Suspended
                            </span>
                          ) : null}
                        </p>
                        {profile?.email ? (
                          <p className="text-[11px] text-slate-500">
                            {profile.email}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700 capitalize">
                        {m.role}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {new Date(m.joined_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <MemberActions
                          viewerUserId={user.id}
                          viewerRole={role}
                          targetUserId={m.user_id}
                          targetRole={m.role}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending invites + invite form, owner/admin only */}
      {isAdmin ? (
        <>
          {inviteRows.length > 0 ? (
            <section>
              <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
                Pending invites
              </h2>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-semibold px-5 py-3">Email</th>
                      <th className="text-left font-semibold px-5 py-3">Role</th>
                      <th className="text-left font-semibold px-5 py-3">Sent</th>
                      <th className="text-left font-semibold px-5 py-3">Expires</th>
                      <th className="text-right font-semibold px-5 py-3"></th>
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
                          {new Date(inv.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {new Date(inv.expires_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <RevokeInviteButton
                            token={inv.token}
                            email={inv.email}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <InviteMemberForm />
        </>
      ) : null}
    </div>
  );
}
