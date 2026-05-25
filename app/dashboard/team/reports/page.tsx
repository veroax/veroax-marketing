// Team-wide reports view. Lists every report whose team_id matches
// the viewer's team, with the creator's name on each row. Any team
// member can read this; the whole point of being on a team is shared
// visibility.
//
// Reports created BEFORE the agent joined the team (team_id null) do
// not appear here. The team feature went live with migration 0019
// and was restructured in 0021 (organizations -> teams + brokerages).
// Older personal reports remain on each agent's individual /dashboard.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentUserMembership } from "@/lib/team/membership";

export const metadata = {
  title: "Team reports, Veroax",
};

type ReportRow = {
  id: string;
  user_id: string;
  status: string;
  property_address: string | null;
  client_name: string | null;
  report_name: string | null;
  created_at: string;
  archived: boolean | null;
  failure_reason: string | null;
};

type SearchParams = Promise<{
  status?: string;
  member?: string;
}>;

export default async function TeamReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status?.trim() ?? "";
  const memberFilter = sp.member?.trim() ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/team/reports");

  const membership = await getCurrentUserMembership(supabase, user.id);
  if (!membership) {
    redirect("/dashboard/team");
  }
  const { team: org } = membership;

  // Use service-role for cross-member reads. The RLS-aware client
  // would (correctly) hide other members' reports under default
  // policies. Membership gate above proves the caller belongs to
  // this org, so the elevated read is safe.
  const admin = createServiceRoleClient();

  let query = admin
    .from("reports")
    .select(
      "id, user_id, status, property_address, client_name, report_name, created_at, archived, failure_reason",
      { count: "exact" },
    )
    .eq("team_id", org.id)
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(200);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (memberFilter) query = query.eq("user_id", memberFilter);

  const { data: rowsData, count } = await query;
  const reports = (rowsData ?? []) as ReportRow[];

  // Resolve member profiles in one query for name display + filter
  // dropdown.
  const { data: memberRowsData } = await admin
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", org.id);
  const memberRows = (memberRowsData ?? []) as Array<{
    user_id: string;
    role: "owner" | "admin" | "agent";
  }>;

  const userIds = memberRows.map((m) => m.user_id);
  const { data: profilesData } =
    userIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds)
      : { data: [] as Array<{ id: string; email: string; full_name: string | null }> };
  const profileMap = new Map<
    string,
    { id: string; email: string; full_name: string | null; role: string }
  >();
  for (const p of (profilesData ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
  }>) {
    const role =
      memberRows.find((m) => m.user_id === p.id)?.role ?? "agent";
    profileMap.set(p.id, { ...p, role });
  }

  // Per-status counts for the filter strip (across the unfiltered
  // result set; querying once via head:true is cheap).
  const [
    cReady,
    cAnalyzing,
    cFailed,
    cDelivered,
  ] = await Promise.all([
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("team_id", org.id)
      .in("status", ["qa_pending", "qa_approved"]),
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("team_id", org.id)
      .eq("status", "analyzing"),
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("team_id", org.id)
      .eq("status", "failed"),
    admin
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("team_id", org.id)
      .eq("status", "delivered"),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-slate-500">
            <Link
              href="/dashboard/team"
              className="hover:text-slate-900"
            >
              {org.name}
            </Link>{" "}
            <span className="text-slate-300">/</span> Team reports
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Team reports
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Every report created by any member of {org.name} since the
            team was established. Personal reports created before
            joining the team stay on each member&apos;s own dashboard.
          </p>
        </div>
        <Link
          href="/dashboard/upload"
          className="bg-indigo-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-indigo-600 whitespace-nowrap"
        >
          New report
        </Link>
      </header>

      {/* Status counter strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CounterTile
          label="Ready"
          value={cReady.count ?? 0}
          href={`/dashboard/team/reports?status=qa_pending`}
          tone="green"
        />
        <CounterTile
          label="Analyzing"
          value={cAnalyzing.count ?? 0}
          href={`/dashboard/team/reports?status=analyzing`}
          tone={(cAnalyzing.count ?? 0) > 0 ? "amber" : "muted"}
        />
        <CounterTile
          label="Delivered"
          value={cDelivered.count ?? 0}
          href={`/dashboard/team/reports?status=delivered`}
        />
        <CounterTile
          label="Failed"
          value={cFailed.count ?? 0}
          href={`/dashboard/team/reports?status=failed`}
          tone={(cFailed.count ?? 0) > 0 ? "red" : "muted"}
        />
      </div>

      {/* Filter strip: member dropdown + status indicator + reset */}
      <form
        className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-200 p-4"
        action="/dashboard/team/reports"
      >
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Member
          </label>
          <select
            name="member"
            defaultValue={memberFilter}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">All members</option>
            {Array.from(profileMap.values())
              .sort((a, b) =>
                (a.full_name ?? a.email).localeCompare(
                  b.full_name ?? b.email,
                ),
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name?.trim() || m.email} ({m.role})
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Status
          </label>
          <select
            name="status"
            defaultValue={statusFilter}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">All statuses</option>
            <option value="uploaded">Uploaded</option>
            <option value="analyzing">Analyzing</option>
            <option value="qa_pending">Ready</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <button
          type="submit"
          className="bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-600"
        >
          Apply
        </button>
        {(statusFilter || memberFilter) ? (
          <Link
            href="/dashboard/team/reports"
            className="text-xs text-slate-500 underline underline-offset-2"
          >
            Reset
          </Link>
        ) : null}
        <div className="ml-auto text-xs text-slate-500">
          {count ?? reports.length} report
          {(count ?? reports.length) === 1 ? "" : "s"}
        </div>
      </form>

      {/* Results table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-5 py-3">Property</th>
              <th className="text-left font-semibold px-5 py-3">Created by</th>
              <th className="text-left font-semibold px-5 py-3">Status</th>
              <th className="text-left font-semibold px-5 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reports.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-10 text-center text-sm text-slate-500"
                >
                  {statusFilter || memberFilter
                    ? "No reports match those filters."
                    : "No team reports yet. New reports created by any team member will appear here."}
                </td>
              </tr>
            ) : (
              reports.map((r) => {
                const owner = profileMap.get(r.user_id);
                const display =
                  r.property_address?.trim() ||
                  r.report_name?.trim() ||
                  "Untitled report";
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 align-top">
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/reports/${r.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {display}
                      </Link>
                      {r.client_name ? (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Client: {r.client_name}
                        </p>
                      ) : null}
                      {r.failure_reason ? (
                        <p className="text-[11px] text-red-700 mt-0.5 max-w-md truncate">
                          {r.failure_reason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      {owner ? (
                        <>
                          <p className="text-slate-900">
                            {owner.full_name?.trim() || owner.email}
                          </p>
                          <p className="text-[11px] text-slate-500 capitalize">
                            {owner.role}
                          </p>
                        </>
                      ) : (
                        <span className="italic text-slate-400">
                          unknown
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500 italic max-w-2xl">
        Cross-member visibility is one-way: any team member can see
        every team report, but the report&apos;s creator stays the
        owner. Only the creator (or an admin with the right
        permissions) can edit findings, archive, or delete.
      </p>
    </div>
  );
}

function CounterTile({
  label,
  value,
  href,
  tone = "muted",
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "muted" | "amber" | "red" | "green";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "green"
          ? "text-emerald-700"
          : "text-slate-900";
  const card = (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-1.5">
        {label}
      </p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    uploaded: { label: "Uploaded", tone: "bg-slate-200 text-slate-700" },
    analyzing: { label: "Analyzing", tone: "bg-indigo-200 text-indigo-800" },
    qa_pending: { label: "Ready", tone: "bg-emerald-200 text-emerald-800" },
    qa_approved: { label: "Ready", tone: "bg-emerald-200 text-emerald-800" },
    delivered: { label: "Delivered", tone: "bg-emerald-200 text-emerald-800" },
    failed: { label: "Failed", tone: "bg-red-200 text-red-800" },
  };
  const s = map[status] ?? { label: status, tone: "bg-slate-200 text-slate-700" };
  return (
    <span
      className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${s.tone}`}
    >
      {s.label}
    </span>
  );
}
