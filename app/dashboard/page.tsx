import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Reports — Veroax",
};

type ReportRow = {
  id: string;
  status: string;
  property_address: string | null;
  created_at: string;
  delivered_at: string | null;
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  uploaded: { label: "Uploaded", tone: "bg-slate-100 text-slate-700" },
  analyzing: { label: "Analyzing", tone: "bg-indigo-100 text-indigo-700" },
  qa_pending: { label: "QA pending", tone: "bg-amber-100 text-amber-700" },
  qa_approved: { label: "QA approved", tone: "bg-emerald-100 text-emerald-700" },
  delivered: { label: "Delivered", tone: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", tone: "bg-red-100 text-red-700" },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, status, property_address, created_at, delivered_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (reports ?? []) as ReportRow[];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            All disclosure analyses you&apos;ve generated. Reports are tied to your account.
          </p>
        </div>
        <Link
          href="/dashboard/upload"
          className="inline-block bg-amber-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-lg hover:bg-amber-300 transition-colors shadow-sm whitespace-nowrap"
        >
          + New report
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-6 py-3">Property</th>
                <th className="text-left font-semibold px-6 py-3">Status</th>
                <th className="text-left font-semibold px-6 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const status = STATUS_LABEL[row.status] ?? {
                  label: row.status,
                  tone: "bg-slate-100 text-slate-700",
                };
                return (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <Link
                        href={`/dashboard/reports/${row.id}`}
                        className="hover:text-indigo-700"
                      >
                        {row.property_address ?? "Untitled report"}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.tone}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(row.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
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
