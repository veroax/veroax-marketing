// Cross-account reports list. Same shape as the agent's
// /dashboard list (search, sort, status pills) but reads every
// account's rows via the service-role client and adds the owner
// column so admins can pivot directly to the user.
//
// Filter chips at the top let an admin focus on a status bucket
// (failed, analyzing now, archived). The `range` query param caps
// the result set by recency for at-a-glance recent-activity views
// from the home dashboard.

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const metadata = {
  title: "All reports — Admin",
};

type SearchParams = Promise<{
  q?: string;
  status?: string;
  range?: string;
  sort?: string;
  dir?: string;
  show?: string; // "archived" to include archived
}>;

type Row = {
  id: string;
  user_id: string;
  status: string;
  property_address: string | null;
  client_name: string | null;
  report_name: string | null;
  created_at: string;
  archived: boolean | null;
  analysis_completed_at: string | null;
  failure_reason: string | null;
};

type ProfileMini = {
  id: string;
  email: string;
  full_name: string | null;
};

export default async function AdminReportsList({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status?.trim() ?? "";
  const range = sp.range?.trim() ?? "";
  const sortKey =
    sp.sort === "property" || sp.sort === "status" || sp.sort === "created"
      ? sp.sort
      : "created";
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const showArchived = sp.show === "archived";

  const admin = createServiceRoleClient();

  const dbCol =
    sortKey === "property"
      ? "property_address"
      : sortKey === "status"
        ? "status"
        : "created_at";

  let query = admin
    .from("reports")
    .select(
      "id, user_id, status, property_address, client_name, report_name, created_at, archived, analysis_completed_at, failure_reason",
      { count: "exact" },
    )
    .order(dbCol, { ascending: sortDir === "asc" })
    .limit(200);

  if (!showArchived) {
    query = query.eq("archived", false);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (range === "24h") {
    query = query.gte(
      "created_at",
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    );
  } else if (range === "7d") {
    query = query.gte(
      "created_at",
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
  }
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(
      `property_address.ilike.${pattern},client_name.ilike.${pattern},report_name.ilike.${pattern},id.ilike.${pattern}`,
    );
  }

  const { data: reportsData, count } = await query;
  const reports = (reportsData ?? []) as Row[];

  // Pull the owning profiles for the visible rows in a single query.
  const userIds = Array.from(new Set(reports.map((r) => r.user_id)));
  const { data: profilesData } =
    userIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds)
      : { data: [] as ProfileMini[] };
  const profileMap = new Map<string, ProfileMini>();
  for (const p of (profilesData ?? []) as ProfileMini[]) {
    profileMap.set(p.id, p);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Every report across every account. Use the filters to focus
            on a status or recency window.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          {count ?? reports.length} match
          {(count ?? reports.length) === 1 ? "" : "es"}
        </div>
      </div>

      {/* Filter strip */}
      <form
        className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end"
        action="/admin/reports"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Search
          </label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Address, client, report ID…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Status
          </label>
          <select
            name="status"
            defaultValue={status}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">All statuses</option>
            <option value="uploaded">Uploaded</option>
            <option value="analyzing">Analyzing</option>
            <option value="qa_pending">Ready</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Range
          </label>
          <select
            name="range"
            defaultValue={range}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">All time</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            name="show"
            value="archived"
            defaultChecked={showArchived}
            className="rounded border-slate-300"
          />
          Include archived
        </label>
        <button
          type="submit"
          className="bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-600"
        >
          Apply
        </button>
        <Link
          href="/admin/reports"
          className="text-xs text-slate-500 underline underline-offset-2"
        >
          Reset
        </Link>
      </form>

      {/* Results table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <SortHeader
                label="Property"
                colKey="property"
                activeKey={sortKey}
                activeDir={sortDir}
                queryString={qs(sp, "sort", "property")}
              />
              <th className="text-left font-semibold px-6 py-3">Owner</th>
              <SortHeader
                label="Status"
                colKey="status"
                activeKey={sortKey}
                activeDir={sortDir}
                queryString={qs(sp, "sort", "status")}
              />
              <SortHeader
                label="Created"
                colKey="created"
                activeKey={sortKey}
                activeDir={sortDir}
                queryString={qs(sp, "sort", "created")}
              />
              <th className="text-right font-semibold px-6 py-3">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reports.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-sm text-slate-500"
                >
                  No reports match those filters.
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
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      <Link
                        href={`/dashboard/reports/${r.id}`}
                        className="hover:text-indigo-700"
                      >
                        {display}
                      </Link>
                      {r.client_name ? (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Client: {r.client_name}
                        </p>
                      ) : null}
                      {r.archived ? (
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
                          Archived
                        </p>
                      ) : null}
                      {r.failure_reason ? (
                        <p className="text-[11px] text-red-700 mt-0.5 truncate max-w-md">
                          {r.failure_reason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {owner ? (
                        <Link
                          href={`/admin/users/${owner.id}`}
                          className="hover:text-indigo-700"
                        >
                          <p className="text-slate-900">
                            {owner.full_name?.trim() || owner.email}
                          </p>
                          {owner.full_name?.trim() ? (
                            <p className="text-xs text-slate-500 truncate">
                              {owner.email}
                            </p>
                          ) : null}
                        </Link>
                      ) : (
                        <span className="text-slate-400 italic">
                          (unknown)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusTone(r.status)}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-500 text-xs">
                      {new Date(r.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/dashboard/reports/${r.id}`}
                        className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
                      >
                        Open →
                      </Link>
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

function statusLabel(status: string): string {
  switch (status) {
    case "uploaded":
      return "Uploaded";
    case "analyzing":
      return "Analyzing";
    case "qa_pending":
    case "qa_approved":
      return "Ready";
    case "delivered":
      return "Delivered";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function statusTone(status: string): string {
  switch (status) {
    case "analyzing":
      return "bg-indigo-100 text-indigo-700";
    case "qa_pending":
    case "qa_approved":
    case "delivered":
      return "bg-emerald-100 text-emerald-700";
    case "failed":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function qs(
  sp: Record<string, string | undefined>,
  setKey: string,
  setValue: string,
): string {
  // Build the column-header sort link: preserve existing params,
  // toggle direction if same column, default desc for "created" and
  // asc for property/status when switching columns.
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "dir") next[k] = v;
  }
  next[setKey] = setValue;
  const wasSameCol = sp[setKey] === setValue;
  if (wasSameCol) {
    next.dir = sp.dir === "asc" ? "desc" : "asc";
  } else {
    next.dir = setValue === "created" ? "desc" : "asc";
  }
  const params = new URLSearchParams(next);
  return params.toString();
}

function SortHeader({
  label,
  colKey,
  activeKey,
  activeDir,
  queryString,
}: {
  label: string;
  colKey: string;
  activeKey: string;
  activeDir: "asc" | "desc";
  queryString: string;
}) {
  const active = colKey === activeKey;
  const arrow = active ? (activeDir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th className="text-left font-semibold px-6 py-3">
      <Link
        href={`/admin/reports?${queryString}`}
        className={`inline-flex items-center gap-1 hover:text-slate-900 ${active ? "text-slate-900" : "text-slate-600"}`}
      >
        {label}
        <span className={`text-[10px] ${active ? "opacity-100" : "opacity-30"}`}>
          {arrow}
        </span>
      </Link>
    </th>
  );
}
