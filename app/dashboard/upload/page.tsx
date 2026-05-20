"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB per file
const MAX_FILES = 20;
const ALLOWED_PDF = "application/pdf";
const ALLOWED_ZIP = ["application/zip", "application/x-zip-compressed"];

type FileItem = {
  file: File;
  state: "queued" | "uploading" | "done" | "error";
  error?: string;
};

function isPdf(f: File): boolean {
  return f.type === ALLOWED_PDF || f.name.toLowerCase().endsWith(".pdf");
}

function isZip(f: File): boolean {
  return ALLOWED_ZIP.includes(f.type) || f.name.toLowerCase().endsWith(".zip");
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [propertyAddress, setPropertyAddress] = useState("");

  function addFiles(filesIn: FileList | File[]) {
    setGlobalError(null);
    const incoming: FileItem[] = [];
    for (const f of Array.from(filesIn)) {
      if (!isPdf(f) && !isZip(f)) {
        incoming.push({
          file: f,
          state: "error",
          error: "Only PDF and ZIP files are accepted.",
        });
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        incoming.push({
          file: f,
          state: "error",
          error: `File is larger than ${fmtSize(MAX_FILE_BYTES)}.`,
        });
        continue;
      }
      incoming.push({ file: f, state: "queued" });
    }
    setItems((prev) => {
      const combined = [...prev, ...incoming];
      if (combined.length > MAX_FILES) {
        setGlobalError(`Maximum ${MAX_FILES} files per report.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    // Reset so re-selecting the same file fires onChange again.
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function startAnalysis() {
    if (items.length === 0) {
      setGlobalError("Add at least one PDF or ZIP file.");
      return;
    }
    const validItems = items.filter((i) => i.state !== "error");
    if (validItems.length === 0) {
      setGlobalError("Resolve the file errors above before continuing.");
      return;
    }

    setSubmitting(true);
    setGlobalError(null);
    const supabase = createClient();

    try {
      // Step 1: create the report row server-side, get back the ID.
      const createRes = await fetch("/api/reports/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_address: propertyAddress.trim() || null,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createJson.error || "Could not create report.");
      }
      const reportId = createJson.id as string;
      const userId = createJson.user_id as string;

      // Step 2: upload each file directly to Supabase Storage.
      // Path convention: disclosures/{user_id}/{report_id}/{filename}
      const uploadedPaths: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.state === "error") continue;

        setItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, state: "uploading" } : it)),
        );

        const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/${reportId}/${safeName}`;

        const { error: uploadErr } = await supabase.storage
          .from("disclosures")
          .upload(path, item.file, {
            cacheControl: "3600",
            upsert: false,
            contentType: item.file.type || undefined,
          });

        if (uploadErr) {
          setItems((prev) =>
            prev.map((it, idx) =>
              idx === i ? { ...it, state: "error", error: uploadErr.message } : it,
            ),
          );
          throw new Error(`Upload failed for ${item.file.name}: ${uploadErr.message}`);
        }

        setItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, state: "done" } : it)),
        );
        uploadedPaths.push(path);
      }

      // Step 3: tell the server we're done uploading. Server will extract any
      // ZIPs and mark the report as ready for analysis.
      const finalizeRes = await fetch(`/api/reports/${reportId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: uploadedPaths }),
      });
      const finalizeJson = await finalizeRes.json();
      if (!finalizeRes.ok) {
        throw new Error(finalizeJson.error || "Could not finalize report.");
      }

      // Step 4: send the user to the report detail page.
      router.push(`/dashboard/reports/${reportId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setGlobalError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const hasFiles = items.length > 0;
  const allDone = hasFiles && items.every((i) => i.state === "done" || i.state === "error");

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Start a new report</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a disclosure package and we&apos;ll generate your 14-section analysis.
        </p>
      </div>

      {/* Tip about ZIPs */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900 leading-relaxed">
        <p className="font-semibold mb-1">Tip: extract your Disclosures.io ZIP first.</p>
        <p className="text-indigo-700 text-xs">
          We accept ZIP files and will extract them automatically, but the analysis is
          faster and more reliable when individual PDFs are uploaded directly. Open the
          ZIP on your computer, then drag in the individual TDS, SPQ, AVID, NHD,
          inspection, and HOA PDFs.
        </p>
      </div>

      {/* Property address (optional, used as a hint for analysis) */}
      <div>
        <label
          htmlFor="property_address"
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          Property address <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="property_address"
          type="text"
          value={propertyAddress}
          onChange={(e) => setPropertyAddress(e.target.value)}
          placeholder="123 Main St, San Jose, CA 95128"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          Helps the report header and filename. If you skip it, we&apos;ll extract it from the disclosure.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf,.zip,application/zip,application/x-zip-compressed"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <svg
          className="w-10 h-10 text-indigo-400 mx-auto mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-sm font-semibold text-slate-900">
          Drop files here, or click to browse
        </p>
        <p className="text-xs text-gray-500 mt-1">
          PDF or ZIP · up to {MAX_FILES} files · max {fmtSize(MAX_FILE_BYTES)} each
        </p>
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {items.map((it, i) => (
              <li
                key={`${it.file.name}-${i}`}
                className="px-4 py-3 flex items-center gap-3 text-sm"
              >
                <FileIcon isZip={isZip(it.file)} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {it.file.name}
                  </p>
                  <p className="text-xs text-gray-500">{fmtSize(it.file.size)}</p>
                  {it.error && (
                    <p className="text-xs text-red-600 mt-0.5">{it.error}</p>
                  )}
                </div>
                <StatusBadge state={it.state} />
                {it.state !== "uploading" && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-xs text-gray-400 hover:text-red-600 px-2"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {globalError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {globalError}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-gray-500">
          By starting an analysis, you confirm you&apos;re authorized to process these documents on behalf of your client.
        </p>
        <button
          type="button"
          onClick={startAnalysis}
          disabled={submitting || items.length === 0}
          className="bg-amber-400 text-indigo-950 font-semibold px-6 py-3 rounded-lg hover:bg-amber-300 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {submitting
            ? allDone
              ? "Finalizing…"
              : "Uploading…"
            : "Start analysis"}
        </button>
      </div>
    </div>
  );
}

function FileIcon({ isZip }: { isZip: boolean }) {
  return (
    <div
      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        isZip ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider">
        {isZip ? "ZIP" : "PDF"}
      </span>
    </div>
  );
}

function StatusBadge({ state }: { state: FileItem["state"] }) {
  if (state === "queued") {
    return <span className="text-xs text-gray-400">Queued</span>;
  }
  if (state === "uploading") {
    return (
      <span className="text-xs text-indigo-700 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" />
        </svg>
        Uploading
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className="text-xs text-emerald-700 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Uploaded
      </span>
    );
  }
  return <span className="text-xs text-red-700">Error</span>;
}
