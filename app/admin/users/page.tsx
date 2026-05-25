// Users list. Server component; service-role read so RLS doesn't
// restrict to the viewing admin's own profile. Search by email or
// full_name (both via ILIKE). Sorted by created_at desc by default,
// flipped to admin/non-admin grouping when ?sort=role.
//
// Each row now also shows the user's current paid plan and their
// lifetime profitability (paid minus our Claude cost) so the founder
// can see which agents are valuable customers, which are losing us
// money, and which are coasting on free credits.

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  computeProfitabilityForUsers,
  getActiveSubscriptionsForUsers,
  formatUsdCents,
  marginLabel,
} from "@/lib/billing/profitability";

export const metadata = {
  title: "Users, Admin",
};

type SearchParams = Promise<{ q?: string; sort?: string }>;

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  brokerage: string | null;
  is_admin: boolean | null;
  is_vip: boolean | null;
  is_suspended: boolean | null;
  created_at: string | null;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const sort = sp.sort === "role" ? "role" : "recent";

  const admin = createServiceRoleClient();

  // Per-user report counts via a single aggregation query. The
  // simplest path here is one query that pulls user_id + count of
  // reports — but Supabase's PostgREST aggregate support is limited,
  // so we fetch report rows light and bucket in code. Cap at 1000
  // users for now — the list view starts to need pagination beyond
  // that anyway.
  let profilesQuery = admin
    .from("profiles")
    .select(
      "id, email, full_name, brokerage, is_admin, is_vip, is_suspended, created_at",
      { count: "exact" },
    )
    .limit(1000);

  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
    profilesQuery = profilesQuery.or(
      `email.ilike.${pattern},full_name.ilike.${pattern}`,
    );
  }

  if (sort === "role") {
    profilesQuery = profilesQuery
      .order("is_admin", { ascending: false })
      .order("created_at", { ascending: false });
  } else {
    profilesQuery = profilesQuery.order("created_at", { ascending: false });
  }

  const { data: profilesData, error: profilesErr, count } = await profilesQuery;
  if (profilesErr) {
    console.error("[admin/users] profiles query failed:", profilesErr);
  }
  const profiles = (profilesData ?? []) as ProfileRow[];

  // Sanity check: compare service-role visibility against the
  // user-scoped (RLS) view. If service-role returns 0 but the
  // signed-in admin can see their own profile through RLS, the
  // SUPABASE_SERVICE_ROLE_KEY env var on this deployment does not
  // match NEXT_PUBLIC_SUPABASE_URL. Surface it instead of silently
  // showing an empty list.
  let envMismatchHint: string | null = null;
  if (!profilesErr && profiles.length === 0) {
    const userScoped = await (await import("@/lib/supabase/server"))
      .createClient();
    const { data: selfProfile } = await userScoped
      .from("profiles")
      .select("id")
      .limit(1);
    if (selfProfile && selfProfile.length > 0) {
      envMismatchHint =
        "Service-role query returned 0 profiles, but the user-scoped client can see at least one row. SUPABASE_SERVICE_ROLE_KEY on this deployment likely does not match NEXT_PUBLIC_SUPABASE_URL (different Supabase project, or a stale key after rotation). Fix in Vercel env vars and redeploy.";
    }
  }

  // Report counts per user. Single query, fetch just the user_id
  // column for every report, bucket. For tens of thousands of reports
  // this becomes its own query plan; revisit when scale demands.
  const { data: allReports } = await admin
    .from("reports")
    .select("user_id, status");
  const reportCount = new Map<string, { total: number; failed: number }>();
  for (const r of (allReports ?? []) as Array<{
    user_id: string;
    status: string;
  }>) {
    const entry = reportCount.get(r.user_id) ?? { total: 0, failed: 0 };
    entry.total += 1;
    if (r.status === "failed") entry.failed += 1;
    reportCount.set(r.user_id, entry);
  }

  // Plan + profitability lookups for the visible cohort. We compute
  // lifetime numbers here; the per-user detail page shows both
  // lifetime and this-month side-by-side.
  const userIds = profiles.map((p) => p.id);
  const [planMap, profitMap, teamMembersRes] = await Promise.all([
    getActiveSubscriptionsForUsers({ userIds }),
    computeProfitabilityForUsers({ userIds, period: "lifetime" }),
    // Pull the membership rows for the visible cohort and the team
    // names in a single follow-up query so we can show "Team: X"
    // alongside the agent's row.
    admin
      .from("team_members")
      .select("user_id, team_id, role")
      .in("user_id", userIds),
  ]);

  type MemberRow = {
    user_id: string;
    team_id: string;
    role: "owner" | "admin" | "agent";
  };
  const memberRowsTyped = (teamMembersRes.data ?? []) as MemberRow[];
  const teamIds = Array.from(
    new Set(memberRowsTyped.map((m) => m.team_id)),
  );
  const { data: teamRowsData } =
    teamIds.length > 0
      ? await admin
          .from("teams")
          .select("id, name")
          .in("id", teamIds)
      : { data: [] as Array<{ id: string; name: string }> };
  const teamMap = new Map<string, string>();
  for (const t of (teamRowsData ?? []) as Array<{ id: string; name: string }>) {
    teamMap.set(t.id, t.name);
  }
  const teamByUser = new Map<
    string,
    { name: string; role: "owner" | "admin" | "agent" }
  >();
  for (const m of memberRowsTyped) {
    const name = teamMap.get(m.team_id);
    if (name) teamByUser.set(m.user_id, { name, role: m.role });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            Every Veroax account. Click a row to see their reports and
            profile.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          {count ?? profiles.length} user{count === 1 ? "" : "s"}
        </div>
      </div>

      <form className="flex items-center gap-2" action="/admin/users">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by email or name…"
          className="flex-1 max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input type="hidden" name="sort" value={sort} />
        <button
          type="submit"
          className="bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-600"
        >
          Search
        </button>
        {q ? (
          <Link
            href="/admin/users"
            className="text-xs text-slate-500 underline underline-offset-2"
          >
            Clear
          </Link>
        ) : null}
        <div className="ml-auto text-xs">
          Sort:{" "}
          <Link
            href={`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            className={`underline underline-offset-2 ml-1 ${sort === "recent" ? "text-slate-900 font-semibold" : "text-slate-500"}`}
          >
            Most recent
          </Link>
          {" · "}
          <Link
            href={`/admin/users?sort=role${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`underline underline-offset-2 ${sort === "role" ? "text-slate-900 font-semibold" : "text-slate-500"}`}
          >
            Admins first
          </Link>
        </div>
      </form>

      {profilesErr ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold mb-1">
            Profiles query returned an error
          </p>
          <p className="font-mono text-xs break-all">
            {profilesErr.message}
            {profilesErr.code ? ` (code: ${profilesErr.code})` : ""}
          </p>
        </div>
      ) : null}

      {envMismatchHint ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold mb-1">
            Possible environment-variable mismatch
          </p>
          <p>{envMismatchHint}</p>
        </div>
      ) : null}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-6 py-3">User</th>
              <th className="text-left font-semibold px-6 py-3">Plan</th>
              <th className="text-right font-semibold px-6 py-3">Reports</th>
              <th className="text-right font-semibold px-6 py-3">Paid (life)</th>
              <th className="text-right font-semibold px-6 py-3">Cost (life)</th>
              <th className="text-right font-semibold px-6 py-3">Margin</th>
              <th className="text-left font-semibold px-6 py-3">Joined</th>
              <th className="text-right font-semibold px-6 py-3">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-6 py-8 text-center text-sm text-slate-500"
                >
                  {q ? "No users match that search." : "No users yet."}
                </td>
              </tr>
            ) : (
              profiles.map((p) => {
                const counts = reportCount.get(p.id) ?? {
                  total: 0,
                  failed: 0,
                };
                const plan = planMap.get(p.id) ?? null;
                const profit = profitMap.get(p.id) ?? {
                  user_id: p.id,
                  paid_cents: 0,
                  cost_cents: 0,
                  margin_cents: 0,
                  report_count: 0,
                  free_report_count: 0,
                };
                const marg = marginLabel(profit);
                const marginTone =
                  marg.tone === "green"
                    ? "text-emerald-700"
                    : marg.tone === "red"
                      ? "text-red-700"
                      : marg.tone === "amber"
                        ? "text-amber-700"
                        : "text-slate-400";
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3.5">
                      <Link
                        href={`/admin/users/${p.id}`}
                        className="block"
                      >
                        <div className="font-medium text-slate-900 hover:text-indigo-700">
                          {p.full_name?.trim() || (
                            <span className="text-slate-400 italic">
                              (no name set)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {p.email}
                        </div>
                        {p.brokerage?.trim() ? (
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {p.brokerage}
                          </div>
                        ) : null}
                        {teamByUser.get(p.id) ? (
                          <div className="text-[11px] text-indigo-700 mt-0.5 truncate font-medium">
                            Team: {teamByUser.get(p.id)?.name}
                            <span className="text-slate-400 ml-1 capitalize">
                              ({teamByUser.get(p.id)?.role})
                            </span>
                          </div>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 text-sm">
                      {plan ? (
                        <div>
                          <span className="font-semibold capitalize text-slate-900">
                            {plan.plan}
                          </span>
                          {plan.billing ? (
                            <span className="text-slate-500">
                              {" "}
                              / {plan.billing}
                            </span>
                          ) : null}
                          <div className="text-[11px] text-slate-400 capitalize">
                            {plan.status}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">no plan</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-700 text-sm">
                      {counts.total}
                      {counts.failed > 0 ? (
                        <span
                          className="ml-1 text-[11px] text-red-700 font-mono"
                          title={`${counts.failed} failed`}
                        >
                          ({counts.failed}f)
                        </span>
                      ) : null}
                      {profit.free_report_count > 0 ? (
                        <div
                          className="text-[11px] text-amber-700 font-mono"
                          title={`${profit.free_report_count} admin-granted credit${profit.free_report_count === 1 ? "" : "s"}`}
                        >
                          {profit.free_report_count} free
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-700 text-sm font-mono">
                      {formatUsdCents(profit.paid_cents)}
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-700 text-sm font-mono">
                      {formatUsdCents(profit.cost_cents)}
                    </td>
                    <td className="px-6 py-3.5 text-right text-sm">
                      <div className={`font-mono font-semibold ${marginTone}`}>
                        {formatUsdCents(profit.margin_cents)}
                      </div>
                      <div className={`text-[10px] uppercase tracking-wider ${marginTone}`}>
                        {marg.label}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 text-xs">
                      {p.created_at
                        ? new Date(p.created_at).toLocaleDateString()
                        : "Unknown"}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex flex-col items-end gap-1">
                        {p.is_suspended ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-red-700 text-white px-2 py-0.5 rounded">
                            Suspended
                          </span>
                        ) : null}
                        {p.is_admin ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded">
                            Admin
                          </span>
                        ) : null}
                        {p.is_vip ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-amber-950 px-2 py-0.5 rounded">
                            ★ VIP
                          </span>
                        ) : null}
                        {!p.is_admin && !p.is_vip && !p.is_suspended ? (
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                            Agent
                          </span>
                        ) : null}
                      </div>
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
