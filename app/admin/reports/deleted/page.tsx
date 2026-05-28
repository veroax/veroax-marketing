// Admin "to be deleted" bucket view. Lists every report with
// deleted_at set, ordered by deleted_at desc (newest deletions
// first). Each row shows:
//
//   - report identity (address / title)
//   - owning agent (name + email, linked to /admin/users/<id>)
//   - who deleted it (admin email when known)
//   - when it was deleted
//   - when the purge cron will permanently remove it (countdown)
//   - reason the admin (or agent) left
//   - Restore button (with confirmation that names the owner)
//
// Purge cron at /api/cron/purge-deleted-reports sweeps rows whose
// purge_after has passed. Until then everything here is
// recoverable.

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { AdminRestoreReportButton } from "@/app/admin/_components/AdminRestoreReportButton";

export const metadata = {
  title: "Deleted reports, Admin",
};

type Row = {
  id: string;
  user_id: string;
  property_address: string | null;
  client_name: string | null;
  report_name: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_reason: string | null;
  purge_after: string | null;
};

type ProfileMini = {
  id: string;
  email: string;
  full_name: string | null;
};

export default async function AdminDeletedReportsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect("/login?next=/admin/reports/deleted");
  }

  const admin = createServiceRoleClient();

  // Pull the deleted bucket. Index reports_deleted_at_idx makes
  // this a fast partial-index seek. Cap at 200 so the page stays
  // snappy on the unlikely-to-happen large-bucket day.
  const { data: rowsRaw } = await admin
    .from("reports")
    .select(
      "id, user_id, property_address, client_name, report_name, deleted_at, deleted_by, deleted_reason, purge_after",
    )
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(200);

  const rows = (rowsRaw ?? []) as Row[];

  // Owner + actor profile lookups in a single batched query.
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.user_id);
    if (r.deleted_by) ids.add(r.deleted_by);
  }
  const idList = Array.from(ids);
  const { data: profilesData } =
    idList.length > 0
      ? await admin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", idList)
      : { data: [] as ProfileMini[] };
  const profileMap = new Map<string, ProfileMini>();
  for (const p of (profilesData ?? []) as ProfileMini[]) {
    profileMap.set(p.id, p);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-slate-500">
            <Link href="/admin/reports" className="hover:text-slate-900">
              All reports
            </Link>{" "}
            <span className="text-slate-300">/</span> Deleted
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Deleted reports
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Reports here have been soft-deleted by an admin or by the
            owning agent. They are hidden from the agent dashboard,
            the admin reports list, the public share link, and the
            PDF download. Each row stays here for 30 days from its
            deleted timestamp; after that the daily purge cron
            permanently removes the row and its storage files.
            Restore a row to bring it back to all surfaces.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          {rows.length} report{rows.length === 1 ? "" : "s"} in bucket
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-600">
            Nothing in the deleted bucket. When you delete a report
            from the admin detail page or an agent deletes one from
            their dashboard, it shows up here for 30 days before the
            purge cron permanently removes it.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-6 py-3">Report</th>
                <th className="text-left font-semibold px-6 py-3">
                  Restores to (owner)
                </th>
                <th className="text-left font-semibold px-6 py-3">Deleted</th>
                <th className="text-left font-semibold px-6 py-3">
                  Permanent purge
                </th>
                <th className="text-right font-semibold px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const owner = profileMap.get(r.user_id);
                const actor = r.deleted_by
                  ? profileMap.get(r.deleted_by)
                  : null;
                const display =
                  r.property_address?.trim() ||
                  r.report_name?.trim() ||
                  "Untitled report";
                const ownerLabel = owner
                  ? owner.full_name?.trim() || owner.email
                  : "(unknown user)";
                const ownerEmail = owner?.email ?? "";
                const daysUntilPurge = r.purge_after
                  ? Math.max(
                      0,
                      Math.ceil(
                        (new Date(r.purge_after).getTime() - Date.now()) /
                          (24 * 60 * 60 * 1000),
                      ),
                    )
                  : null;
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 align-top">
                      <p className="font-medium text-slate-900">{display}</p>
                      {r.client_name ? (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Client: {r.client_name}
                        </p>
                      ) : null}
                      {r.deleted_reason ? (
                        <p
                          className="text-xs text-slate-500 mt-1 italic truncate max-w-md"
                          title={r.deleted_reason}
                        >
                          &ldquo;{r.deleted_reason}&rdquo;
                        </p>
                      ) : null}
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        {r.id}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-sm align-top">
                      {owner ? (
                        <Link
                          href={`/admin/users/${owner.id}`}
                          className="hover:text-indigo-700"
                        >
                          <p className="text-slate-900">{ownerLabel}</p>
                          {owner.full_name?.trim() ? (
                            <p className="text-xs text-slate-500 truncate">
                              {owner.email}
                            </p>
                          ) : null}
                        </Link>
                      ) : (
                        <span className="text-slate-400 italic">
                          (unknown user)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs align-top">
                      <p className="text-slate-700">
                        {new Date(r.deleted_at).toLocaleString("en-US", {
                          timeZone: "America/Los_Angeles",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="text-slate-500 mt-0.5">
                        by{" "}
                        {actor
                          ? actor.full_name?.trim() || actor.email
                          : "(unknown actor)"}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-xs align-top">
                      {r.purge_after ? (
                        <>
                          <p className="text-slate-700">
                            {new Date(r.purge_after).toLocaleDateString(
                              "en-US",
                              {
                                timeZone: "America/Los_Angeles",
                                dateStyle: "medium",
                              },
                            )}
                          </p>
                          <p
                            className={`text-slate-500 mt-0.5 ${(daysUntilPurge ?? 0) <= 7 ? "text-amber-700 font-semibold" : ""}`}
                          >
                            {daysUntilPurge === 0
                              ? "today"
                              : `${daysUntilPurge} day${daysUntilPurge === 1 ? "" : "s"} remaining`}
                          </p>
                        </>
                      ) : (
                        <span className="text-slate-400 italic">
                          unscheduled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right align-top">
                      <AdminRestoreReportButton
                        reportId={r.id}
                        ownerLabel={
                          owner
                            ? `${ownerLabel}${ownerEmail && ownerEmail !== ownerLabel ? ` (${ownerEmail})` : ""}`
                            : "(unknown user)"
                        }
                        reportLabel={display}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
