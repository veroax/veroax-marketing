import Link from "next/link";
import { DateTimeCell } from "./DateTimeCell";
import { RowActions } from "./RowActions";

// Shared table used by both /dashboard (main list, archived=false)
// and /dashboard/archive (archived=true). Same columns, same sort
// behavior, same search. Differences live in the parent page.

export type ReportRow = {
  id: string;
  status: string;
  property_address: string | null;
  client_name?: string | null;
  report_name?: string | null;
  created_at: string;
  archived?: boolean;
};

// "qa_pending" is the DB status set by performAnalysis the moment Claude
// finishes. It was originally placed there for a future human-QA gate
// (someone reviews before the report is marked "delivered" to the agent),
// but that workflow doesn't exist — nothing in the codebase ever moves
// a report past qa_pending. So as far as the agent is concerned, qa_pending
// means "ready to use." Label and tone reflect that. The legacy
// qa_approved / delivered statuses still get green labels in case the
// QA workflow gets built later; they just aren't reachable today.
const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  uploaded: { label: "Uploaded", tone: "bg-slate-100 text-slate-700" },
  analyzing: { label: "Analyzing", tone: "bg-indigo-100 text-indigo-700" },
  qa_pending: { label: "Ready", tone: "bg-emerald-100 text-emerald-700" },
  qa_approved: {
    label: "Ready",
    tone: "bg-emerald-100 text-emerald-700",
  },
  delivered: { label: "Delivered", tone: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", tone: "bg-red-100 text-red-700" },
};

export type SortKey = "property" | "status" | "created";
export type SortDir = "asc" | "desc";

type Props = {
  rows: ReportRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  // Base path (e.g. "/dashboard" or "/dashboard/archive") for the
  // clickable column headers — they preserve the current search but
  // toggle/replace the sort.
  basePath: string;
  searchQuery: string;
  // "main" renders the Archive action; "archive" renders Restore. Both
  // variants show Delete. Defaults to "main" so older call sites that
  // don't pass the prop yet still compile.
  variant?: "main" | "archive";
};

export function ReportListTable({
  rows,
  sortKey,
  sortDir,
  basePath,
  searchQuery,
  variant = "main",
}: Props) {
  function sortHref(targetKey: SortKey): string {
    const params = new URLSearchParams();
    params.set("sort", targetKey);
    // Click the active column to flip direction; click a different
    // column to switch to it with default desc (created/most-recent)
    // or asc (property/A-Z, status/A-Z) — small UX nicety.
    if (sortKey === targetKey) {
      params.set("dir", sortDir === "asc" ? "desc" : "asc");
    } else {
      params.set("dir", targetKey === "created" ? "desc" : "asc");
    }
    if (searchQuery) params.set("q", searchQuery);
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
          <tr>
            <SortableHeader
              label="Property"
              colKey="property"
              activeKey={sortKey}
              activeDir={sortDir}
              href={sortHref("property")}
            />
            <SortableHeader
              label="Status"
              colKey="status"
              activeKey={sortKey}
              activeDir={sortDir}
              href={sortHref("status")}
            />
            <SortableHeader
              label="Created"
              colKey="created"
              activeKey={sortKey}
              activeDir={sortDir}
              href={sortHref("created")}
            />
            {/* Actions column has no sort header — just a quiet label.
                Right-aligned so the buttons sit near the screen edge. */}
            <th className="text-right font-semibold px-6 py-3 text-slate-600">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const status = STATUS_LABEL[row.status] ?? {
              label: row.status,
              tone: "bg-slate-100 text-slate-700",
            };
            const display =
              row.property_address?.trim() ||
              row.report_name?.trim() ||
              "Untitled report";
            return (
              <tr key={row.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-medium text-slate-900">
                  <Link
                    href={`/dashboard/reports/${row.id}`}
                    className="hover:text-indigo-700"
                  >
                    {display}
                  </Link>
                  {row.client_name && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Client: {row.client_name}
                    </p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500">
                  <DateTimeCell iso={row.created_at} />
                </td>
                <td className="px-6 py-4 text-right">
                  <RowActions
                    reportId={row.id}
                    reportLabel={display}
                    variant={variant}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeader({
  label,
  colKey,
  activeKey,
  activeDir,
  href,
}: {
  label: string;
  colKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  href: string;
}) {
  const isActive = colKey === activeKey;
  const arrow = isActive ? (activeDir === "asc" ? "↑" : "↓") : "";
  return (
    <th className="text-left font-semibold px-6 py-3">
      <Link
        href={href}
        className={`inline-flex items-center gap-1 hover:text-slate-900 ${
          isActive ? "text-slate-900" : "text-slate-600"
        }`}
      >
        {label}
        <span
          className={`text-[10px] ${isActive ? "opacity-100" : "opacity-30"}`}
        >
          {arrow || "↕"}
        </span>
      </Link>
    </th>
  );
}
