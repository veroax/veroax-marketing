"use client";

// Client form for /dashboard/bulk-archive. Renders a list of the
// agent's active reports with checkboxes. The sticky toolbar at the
// top shows the count + the Archive button. Submit POSTs to
// /api/reports/bulk-archive.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Report = {
  id: string;
  property_address: string | null;
  client_name: string | null;
  report_name: string | null;
  status: string;
  created_at: string;
};

type Props = {
  reports: Report[];
  totalCount: number;
};

const MAX_PER_SUBMISSION = 200;

export function BulkArchiveForm({ reports, totalCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!filter.trim()) return reports;
    const needle = filter.toLowerCase();
    return reports.filter((r) => {
      const haystack = [
        r.property_address ?? "",
        r.client_name ?? "",
        r.report_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [reports, filter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        if (next.size >= MAX_PER_SUBMISSION) break;
        next.add(r.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setError(null);
    setInfo(null);
  }

  async function submit() {
    setError(null);
    setInfo(null);
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setError("Select at least one report.");
      return;
    }
    if (ids.length > MAX_PER_SUBMISSION) {
      setError(
        `Too many selected (${ids.length}). Archive in batches of ${MAX_PER_SUBMISSION} or fewer.`,
      );
      return;
    }
    if (
      !confirm(
        `Archive ${ids.length} report${ids.length === 1 ? "" : "s"}? You can restore them from /dashboard/archive at any time.`,
      )
    ) {
      return;
    }
    const res = await fetch("/api/reports/bulk-archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportIds: ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Bulk archive failed.",
      );
      return;
    }
    setInfo(`Archived ${data.archived ?? 0} report${data.archived === 1 ? "" : "s"}.`);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {/* Sticky toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap sticky top-2 z-10 shadow-sm">
        <div className="text-sm text-slate-700">
          {selected.size > 0 ? (
            <span className="font-semibold text-indigo-900">
              {selected.size} selected
            </span>
          ) : (
            <span className="text-slate-500">
              {reports.length} active report{reports.length === 1 ? "" : "s"}
              {totalCount > reports.length
                ? `, showing the most recent 500 of ${totalCount}`
                : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1"
            >
              Clear
            </button>
          ) : null}
          {filtered.length > 0 && selected.size < filtered.length ? (
            <button
              type="button"
              onClick={selectAllFiltered}
              className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
            >
              Select all{filter ? " filtered" : ""} ({Math.min(filtered.length, MAX_PER_SUBMISSION)})
            </button>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={pending || selected.size === 0}
            className="bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? "Archiving..." : "Archive selected"}
          </button>
        </div>
      </div>

      {info ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-4 py-2">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
          {error}
        </p>
      ) : null}

      {/* Filter */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by property, client, or report name..."
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {/* Report list */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              No reports match this filter.
            </li>
          ) : (
            filtered.map((r) => {
              const display =
                r.property_address?.trim() ||
                r.report_name?.trim() ||
                "Untitled report";
              return (
                <li
                  key={r.id}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/50 cursor-pointer"
                  onClick={() => toggle(r.id)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {display}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      {r.client_name?.trim() ? (
                        <span>Client: {r.client_name}</span>
                      ) : null}
                      <span>
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      <span className="capitalize">
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
