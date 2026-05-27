"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Modal triggered by "Add documents to this report" on the report page.
// Mirrors the file picker on /dashboard/upload but without the metadata
// fields (report_name / client_name are inherited from the parent).
//
// Flow:
//   1. Agent picks one or more PDF files.
//   2. On submit, each file uploads to disclosures/{user}/{report}/
//      via the user-scoped Supabase client (so RLS owns the auth).
//   3. POST /api/reports/[id]/update with { paths }, the server
//      snapshots the current state into versions[], merges the new
//      files into original_files, and triggers full-package
//      re-analysis with date-aware context.
//   4. router.refresh() so the parent page re-fetches and renders the
//      "analyzing" state.

type Props = {
  reportId: string;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  // Days since the original analysis, drives the free-window notice.
  ageDays: number;
};

const FREE_WINDOW_DAYS = 30;

export function AddDocumentsModal({
  reportId,
  userId,
  isOpen,
  onClose,
  ageDays,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  if (!isOpen) return null;

  const insideFreeWindow = ageDays <= FREE_WINDOW_DAYS;

  async function handleSubmit() {
    if (files.length === 0) {
      setError("Pick at least one PDF before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const uploadedPaths: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/${reportId}/${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("disclosures")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: true, // overwriting a same-named file is OK on update
            contentType: file.type || "application/pdf",
          });
        if (upErr) {
          throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);
        }
        uploadedPaths.push(path);
      }

      setProgress("Triggering re-analysis…");
      const res = await fetch(`/api/reports/${reportId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: uploadedPaths }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      setProgress("Done. Re-analysis is running.");
      setFiles([]);
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="text-lg font-bold text-slate-900">
            Add documents to this report
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 leading-none text-2xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          New files merge into the existing package. The report re-analyzes
          on the full set (old + new) so cross-document references stay
          consistent.
        </p>

        {insideFreeWindow ? (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg mb-4">
            ✓ Within the {FREE_WINDOW_DAYS}-day free update window ,
            no additional charge.
          </div>
        ) : (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mb-4">
            This report is {Math.round(ageDays)} days old, outside the
            {" "}{FREE_WINDOW_DAYS}-day free update window. Updating will
            consume a report credit.
          </div>
        )}

        <div className="border-2 border-dashed border-slate-300 rounded-xl px-4 py-6 text-center mb-4">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              setFiles(picked);
              setError(null);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            Choose PDFs…
          </button>
          {files.length > 0 && (
            <ul className="mt-3 text-left text-xs text-slate-700 space-y-1">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                    PDF
                  </span>
                  <span className="truncate">{f.name}</span>
                  <span className="text-slate-400 ml-auto">
                    {Math.round(f.size / 1024)} KB
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {progress && (
          <p className="text-xs text-slate-600 mb-2">{progress}</p>
        )}
        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mb-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || files.length === 0}
            className="inline-flex items-center bg-amber-400 text-indigo-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Uploading…" : "Add documents & re-analyze"}
          </button>
        </div>
      </div>
    </div>
  );
}
