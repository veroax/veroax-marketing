import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export default async function ReportDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: report } = await supabase
    .from("reports")
    .select(
      "id, status, property_address, source_file_path, created_at, analysis_started_at, analysis_completed_at, delivered_at, failure_reason",
    )
    .eq("id", id)
    .maybeSingle();
  if (!report) notFound();

  // List the source files we have on disk so the user can see what we're
  // analyzing. RLS on storage ensures they only see their own folder.
  const folder = `${user.id}/${report.id}`;
  const { data: files } = await supabase.storage.from("disclosures").list(folder);
  const pdfs = (files ?? []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/dashboard"
            className="text-xs text-gray-500 hover:text-slate-900 mb-2 inline-block"
          >
            ← All reports
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            {report.property_address ?? "Untitled report"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Created{" "}
            {new Date(report.created_at).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <StatusPill status={report.status} />
      </div>

      {/* Processing / waiting state */}
      {report.status === "analyzing" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 mb-3">
            <svg
              className="w-6 h-6 text-indigo-700 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                opacity="0.25"
              />
              <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Analyzing your disclosure</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Once we&apos;ve processed the documents and reviewed them, your 14-section
            report will appear here. Typically 60–90 seconds.
          </p>
          <p className="text-xs text-gray-400 mt-3">
            (Analysis worker not yet wired — slice 3 of Phase 1. Status stays here for now.)
          </p>
        </div>
      )}

      {report.status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <h2 className="text-base font-bold text-red-900 mb-1">
            Analysis didn&apos;t complete
          </h2>
          <p className="text-sm text-red-800">{report.failure_reason}</p>
        </div>
      )}

      {/* Uploaded files */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Source documents ({pdfs.length})
        </h2>
        {pdfs.length === 0 ? (
          <p className="text-sm text-gray-500">No PDFs found in the report folder.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {pdfs.map((f) => (
              <li key={f.name} className="flex items-center gap-3 text-slate-700">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                  PDF
                </span>
                <span className="flex-1 truncate">{f.name}</span>
                {f.metadata?.size != null && (
                  <span className="text-xs text-gray-400">
                    {Math.round(f.metadata.size / 1024)} KB
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    uploaded: { label: "Uploaded", tone: "bg-slate-100 text-slate-700" },
    analyzing: { label: "Analyzing", tone: "bg-indigo-100 text-indigo-700" },
    qa_pending: { label: "QA pending", tone: "bg-amber-100 text-amber-700" },
    qa_approved: { label: "QA approved", tone: "bg-emerald-100 text-emerald-700" },
    delivered: { label: "Delivered", tone: "bg-emerald-100 text-emerald-700" },
    failed: { label: "Failed", tone: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status, tone: "bg-slate-100 text-slate-700" };
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${s.tone}`}>
      {s.label}
    </span>
  );
}
