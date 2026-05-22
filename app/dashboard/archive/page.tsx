import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  ReportListTable,
  type ReportRow,
  type SortKey,
  type SortDir,
} from "../_components/ReportListTable";
import { SearchBar } from "../_components/SearchBar";

export const metadata = {
  title: "Archive — Veroax",
};

// Mirror of /dashboard with WHERE archived = true. Same sort + search
// behavior; the only differences are the filter and the page chrome.
//
// Visibility: regular agents see their own archived reports (RLS
// enforces user_id scoping). Admins (profiles.is_admin = true) see
// archived reports across the system so they can restore-by-other-
// agent — the SELECT explicitly bypasses the user_id filter for them.

type SearchParams = Promise<{
  sort?: string;
  dir?: string;
  q?: string;
}>;

function parseSortKey(raw?: string): SortKey {
  if (raw === "property" || raw === "status" || raw === "created") return raw;
  return "created";
}
function parseSortDir(raw?: string): SortDir {
  return raw === "asc" ? "asc" : "desc";
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const sortKey = parseSortKey(sp.sort);
  const sortDir = parseSortDir(sp.dir);
  const searchQuery = sp.q?.trim() ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Detect admin status — admins get cross-user visibility on the
  // archive so they can restore an archived report for another
  // agent. Regular users see their own archived items.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const isAdmin = Boolean(
    (profile as { is_admin?: boolean } | null)?.is_admin,
  );

  const dbSortColumn =
    sortKey === "property"
      ? "property_address"
      : sortKey === "status"
        ? "status"
        : "created_at";

  let query = supabase
    .from("reports")
    .select(
      "id, status, property_address, client_name, report_name, created_at, archived",
    )
    .eq("archived", true)
    .order(dbSortColumn, { ascending: sortDir === "asc" });

  if (searchQuery) {
    const pattern = `%${searchQuery.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(
      `property_address.ilike.${pattern},client_name.ilike.${pattern}`,
    );
  }

  const { data: reports } = await query.limit(200);
  const rows = (reports ?? []) as ReportRow[];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <Link href="/dashboard" className="hover:text-slate-900">
            Reports
          </Link>
          <span>/</span>
          <span className="text-slate-700 font-semibold">Archive</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Archived reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin ? (
            <>
              <span className="text-amber-700 font-semibold">Admin view:</span>{" "}
              you can see and restore archived reports across all agents.
            </>
          ) : (
            <>
              Reports you&apos;ve archived. They&apos;re hidden from your main
              list but stay downloadable. Restore from this view to bring one
              back to your active reports.
            </>
          )}
        </p>
      </div>

      <SearchBar
        initialQuery={searchQuery}
        placeholder="Search archived by address or client…"
      />

      {rows.length === 0 ? (
        <EmptyArchive hasQuery={searchQuery.length > 0} query={searchQuery} />
      ) : (
        <ReportListTable
          rows={rows}
          sortKey={sortKey}
          sortDir={sortDir}
          basePath="/dashboard/archive"
          searchQuery={searchQuery}
        />
      )}
    </div>
  );
}

function EmptyArchive({ hasQuery, query }: { hasQuery: boolean; query: string }) {
  if (hasQuery) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <p className="text-sm text-slate-600">
          No archived reports match{" "}
          <span className="font-mono text-slate-900">&ldquo;{query}&rdquo;</span>.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Check the main{" "}
          <Link href="/dashboard" className="underline underline-offset-2">
            Reports
          </Link>{" "}
          list if you&apos;re searching for something currently active.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
      <p className="text-sm text-slate-600">
        Your archive is empty.
      </p>
      <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
        When you archive a report from its detail page, it lands here. The
        report stays downloadable but won&apos;t clutter your main list.
      </p>
    </div>
  );
}
