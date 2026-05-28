// Audit log viewer. Reads the most recent N events with optional
// filters for event_type and user_id. Renders metadata as a small
// pretty-printed JSON block on each row, most events have 3-6
// key/value pairs that fit on a couple of lines and tell the story
// without an extra click. For deeper inspection the user_id and
// report_id are clickable to /admin/users/[id] and /dashboard/
// reports/[id] respectively.
//
// The audit_log table is meant for compliance retention per the
// privacy policy (7 years documented; not yet enforced as a backend
// policy). This viewer is purely read-only, no edit/delete actions
// because the audit log should be append-only by contract.

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Audit log, Admin",
};

type SearchParams = Promise<{
  event?: string;
  user?: string;
  report?: string;
  limit?: string;
}>;

type AuditRow = {
  id: string;
  user_id: string | null;
  report_id: string | null;
  event_type: string;
  metadata: unknown;
  created_at: string;
};

type ProfileMini = {
  id: string;
  email: string;
  full_name: string | null;
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const eventFilter = sp.event?.trim() ?? "";
  const userFilter = sp.user?.trim() ?? "";
  const reportFilter = sp.report?.trim() ?? "";
  const limit = Math.min(
    Math.max(parseInt(sp.limit ?? "100", 10) || 100, 25),
    500,
  );

  const admin = createServiceRoleClient();

  let query = admin
    .from("audit_log")
    .select("id, user_id, report_id, event_type, metadata, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (eventFilter) {
    query = query.eq("event_type", eventFilter);
  }
  if (userFilter) {
    query = query.eq("user_id", userFilter);
  }
  if (reportFilter) {
    query = query.eq("report_id", reportFilter);
  }
  const { data: eventsData, count } = await query;
  const events = (eventsData ?? []) as AuditRow[];

  // Pull the distinct event_type list separately (no filter) for the
  // dropdown options. Capped to a sane number, beyond ~40 we'd want
  // a different UI than a select.
  const { data: distinctEvents } = await admin
    .from("audit_log")
    .select("event_type")
    .limit(2000);
  const eventTypes = Array.from(
    new Set(
      (distinctEvents ?? [])
        .map((r) => (r as { event_type: string }).event_type)
        .filter(Boolean),
    ),
  ).sort();

  // Resolve the owning profiles for the visible rows in one query.
  const userIds = Array.from(
    new Set(events.map((e) => e.user_id).filter(Boolean) as string[]),
  );
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
          <h1 className="text-2xl font-bold text-slate-900">Audit log</h1>
          <p className="text-sm text-gray-500 mt-1">
            Append-only system activity. Use this to investigate what
            ran when and who did what. Retained per the privacy policy
            for up to 7 years.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          {events.length.toLocaleString()} shown
          {count != null && count > events.length ? (
            <span className="ml-1 text-slate-400">
              of {count.toLocaleString()} total
            </span>
          ) : null}
        </div>
      </div>

      {/* Filter strip */}
      <form
        className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end"
        action="/admin/audit"
      >
        <div className="min-w-[200px]">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Event type
          </label>
          <select
            name="event"
            defaultValue={eventFilter}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">All event types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            User ID
          </label>
          <input
            name="user"
            defaultValue={userFilter}
            placeholder="UUID, exact match"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Report ID
          </label>
          <input
            name="report"
            defaultValue={reportFilter}
            placeholder="UUID, exact match"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Limit
          </label>
          <select
            name="limit"
            defaultValue={String(limit)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="250">250</option>
            <option value="500">500</option>
          </select>
        </div>
        <button
          type="submit"
          className="bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-600"
        >
          Apply
        </button>
        <Link
          href="/admin/audit"
          className="text-xs text-slate-500 underline underline-offset-2"
        >
          Reset
        </Link>
      </form>

      {/* Log rows */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {events.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            No events match those filters.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => {
              const owner = e.user_id ? profileMap.get(e.user_id) : null;
              return (
                <li key={e.id} className="px-6 py-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${eventTone(e.event_type)}`}
                    >
                      {e.event_type}
                    </span>
                    <span className="text-xs text-slate-500 font-mono shrink-0">
                      {new Date(e.created_at).toLocaleString("en-US", {
                        timeZone: "America/Los_Angeles",
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </span>
                    <div className="flex-1 min-w-[200px] flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {owner ? (
                        <Link
                          href={`/admin/users/${owner.id}`}
                          className="text-indigo-700 hover:underline underline-offset-2"
                        >
                          {owner.full_name?.trim() || owner.email}
                        </Link>
                      ) : e.user_id ? (
                        <span className="text-slate-500 font-mono">
                          user:{e.user_id.slice(0, 8)}
                        </span>
                      ) : null}
                      {e.report_id ? (
                        <Link
                          href={`/dashboard/reports/${e.report_id}`}
                          className="text-indigo-700 hover:underline underline-offset-2 font-mono"
                        >
                          report:{e.report_id.slice(0, 8)}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  {e.metadata != null &&
                  typeof e.metadata === "object" &&
                  Object.keys(e.metadata as Record<string, unknown>).length >
                    0 ? (
                    <pre className="mt-2 text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto max-w-full whitespace-pre-wrap break-words">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function eventTone(eventType: string): string {
  // Tint event_type pills by category. Helps the eye scan a long
  // audit list for "the bad stuff" without reading every event name.
  if (eventType.includes("failed") || eventType.includes("error"))
    return "bg-red-100 text-red-800";
  if (
    eventType.includes("deleted") ||
    eventType.includes("admin.demoted") ||
    eventType.includes("by_admin")
  )
    return "bg-amber-100 text-amber-800";
  if (eventType.startsWith("admin.") || eventType.includes("restored"))
    return "bg-indigo-100 text-indigo-800";
  if (eventType.startsWith("analysis.") || eventType.includes("completed"))
    return "bg-emerald-100 text-emerald-800";
  if (eventType.startsWith("billable.")) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}
