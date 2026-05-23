import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ReportListTable,
  type ReportRow,
  type SortKey,
  type SortDir,
} from "./_components/ReportListTable";
import { SearchBar } from "./_components/SearchBar";

export const metadata = {
  title: "Reports, Veroax",
};

// Search-param shape: ?sort=property|status|created &dir=asc|desc &q=…
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const sortKey = parseSortKey(sp.sort);
  const sortDir = parseSortDir(sp.dir);
  const searchQuery = sp.q?.trim() ?? "";

  const supabase = await createClient();

  // Map UI sort keys → DB column names. "property" uses
  // property_address; rows without one fall back to report_name in
  // the table render so the visual sort isn't perfect when address
  // is null — that's an acceptable trade-off for not needing a
  // computed column.
  const dbSortColumn =
    sortKey === "property"
      ? "property_address"
      : sortKey === "status"
        ? "status"
        : "created_at";

  let query = supabase
    .from("reports")
    .select(
      "id, status, property_address, client_name, report_name, created_at",
    )
    .eq("archived", false)
    .order(dbSortColumn, { ascending: sortDir === "asc" });

  if (searchQuery) {
    // Postgres ILIKE for case-insensitive contains. We OR across
    // property_address and client_name so agents can find a report
    // by either the address (what shows) or the buyer's name (what
    // they remember).
    const pattern = `%${searchQuery.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(
      `property_address.ilike.${pattern},client_name.ilike.${pattern}`,
    );
  }

  const { data: reports } = await query.limit(100);
  const rows = (reports ?? []) as ReportRow[];

  const hasFilters = searchQuery.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            All active disclosure analyses tied to your account. Archived
            reports are hidden here. See the{" "}
            <Link
              href="/dashboard/archive"
              className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
            >
              Archive
            </Link>
            {" "}to view them.
          </p>
        </div>
        <Link
          href="/dashboard/upload"
          className="inline-block bg-amber-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-lg hover:bg-amber-300 transition-colors shadow-sm whitespace-nowrap"
        >
          + New report
        </Link>
      </div>

      <SearchBar initialQuery={searchQuery} />

      {rows.length === 0 ? (
        hasFilters ? (
          <NoSearchMatches query={searchQuery} />
        ) : (
          <EmptyState />
        )
      ) : (
        <ReportListTable
          rows={rows}
          sortKey={sortKey}
          sortDir={sortDir}
          basePath="/dashboard"
          searchQuery={searchQuery}
          variant="main"
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-100 mb-4">
        <svg
          className="w-7 h-7 text-indigo-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <h2 className="text-lg font-bold text-slate-900 mb-1">No reports yet</h2>
      <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
        Upload a disclosure package and we&apos;ll generate your first 14-section
        analysis. Takes about 60–90 seconds end-to-end.
      </p>
      <Link
        href="/dashboard/upload"
        className="inline-block bg-amber-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-lg hover:bg-amber-300 transition-colors shadow-sm"
      >
        Start your first report
      </Link>
    </div>
  );
}

function NoSearchMatches({ query }: { query: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
      <p className="text-sm text-slate-600">
        No reports match{" "}
        <span className="font-mono text-slate-900">&ldquo;{query}&rdquo;</span>.
      </p>
      <p className="text-xs text-slate-500 mt-2">
        Try a shorter substring of the address or client name, or check the
        Archive. Archived reports don&apos;t appear here.
      </p>
    </div>
  );
}
