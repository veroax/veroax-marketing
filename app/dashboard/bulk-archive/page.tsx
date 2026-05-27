// /dashboard/bulk-archive
//
// Lets an agent select multiple of their own reports at once and
// archive them in a single API call. The main /dashboard reports
// list intentionally does NOT have checkboxes; this dedicated page
// is the focused bulk-management surface.
//
// Common use case: an agent joining a new brokerage from another
// platform wants to clear their old transactions out of the active
// list. Bulk-archive sweeps them to /dashboard/archive in one click.
//
// Archive only (no delete). Reports stay in the system; the agent
// (and admins) can restore from /dashboard/archive at any time.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BulkArchiveForm } from "./_components/BulkArchiveForm";

export const metadata = {
  title: "Bulk archive reports, Veroax",
};

export default async function BulkArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/bulk-archive");

  // Pull every non-archived report the user owns. RLS scopes to the
  // caller automatically. Cap at 500 to keep the page render under a
  // reasonable budget; anyone with more reports than that can chip
  // away in batches.
  const { data: rowsData, count } = await supabase
    .from("reports")
    .select(
      "id, property_address, client_name, report_name, status, created_at",
      { count: "exact" },
    )
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(500);

  const reports = (rowsData ?? []) as Array<{
    id: string;
    property_address: string | null;
    client_name: string | null;
    report_name: string | null;
    status: string;
    created_at: string;
  }>;

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="space-y-2">
        <p className="text-xs text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-900">
            Reports
          </Link>{" "}
          <span className="text-slate-300">/</span> Bulk archive
        </p>
        <h1 className="text-2xl font-bold text-slate-900">
          Bulk archive reports
        </h1>
        <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
          Select the reports you want to move to your archive.
          Archived reports do not appear in the main /dashboard list
          but stay accessible at /dashboard/archive and can be
          restored at any time. Up to 200 reports per submission.
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-500">
          You have no active reports to archive. New reports go to
          /dashboard; archived ones go to /dashboard/archive.
        </div>
      ) : (
        <BulkArchiveForm reports={reports} totalCount={count ?? reports.length} />
      )}
    </div>
  );
}
