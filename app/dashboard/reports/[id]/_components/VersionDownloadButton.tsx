"use client";

import { useState } from "react";

// Wraps the per-version "Download this version" link in the Version
// history disclosure with an explicit affirmation. Agents shouldn't be
// able to download a superseded report unintentionally.

type Props = {
  reportId: string;
  versionNumber: number;
  snapshottedAt: string;
  currentUpdatedAt: string | null;
};

export function VersionDownloadButton({
  reportId,
  versionNumber,
  snapshottedAt,
  currentUpdatedAt,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);

  function handleConfirm() {
    // Open in a new tab so the agent's place in the report page is
    // preserved. The server enforces auth + version validity.
    window.open(
      `/api/reports/${reportId}/pdf?version=${versionNumber}`,
      "_blank",
      "noopener,noreferrer",
    );
    setShowConfirm(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="text-xs text-slate-600 hover:text-indigo-700 underline underline-offset-2"
      >
        Download this version
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowConfirm(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Downloading an older version
            </h3>
            <p className="text-sm text-slate-700 mt-2">
              You&apos;re about to download{" "}
              <span className="font-semibold">version {versionNumber}</span>{" "}
              of this report, snapshotted{" "}
              <span className="font-semibold">{fmt(snapshottedAt)}</span>.
            </p>
            {currentUpdatedAt && (
              <p className="text-sm text-slate-700 mt-2">
                The current version was last updated{" "}
                <span className="font-semibold">{fmt(currentUpdatedAt)}</span>.
              </p>
            )}
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mt-3">
              By continuing, you affirm you understand this is{" "}
              <strong>not the latest version</strong> of this report and
              should not be shared with a client as the current analysis.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="bg-amber-400 text-indigo-950 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-amber-300"
              >
                Yes, download older version
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
