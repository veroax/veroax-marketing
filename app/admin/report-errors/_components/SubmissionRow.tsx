"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Submission = {
  id: string;
  report_id: string | null;
  user_id: string | null;
  email: string;
  phone: string | null;
  categories: string[];
  message: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

type Props = {
  submission: Submission;
  ownerName: string | null;
  ownerEmail: string | null;
  statusLabel: { label: string; tone: string };
};

const CATEGORY_LABEL: Record<string, string> = {
  irrelevant_findings: "Irrelevant findings",
  missed_critical_finding: "Missed critical",
  wrong_unit_or_address: "Wrong unit/address",
  incorrect_cost_estimate: "Bad cost estimate",
  wrong_rating: "Wrong rating",
  source_link_broken: "Source link broken",
  rendering_issue: "Layout/PDF issue",
  other: "Other",
};

export function SubmissionRow({
  submission,
  ownerName,
  ownerEmail,
  statusLabel,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<null | "credit" | "ack" | "dismiss">(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(submission.admin_notes ?? "");
  const [creditCount, setCreditCount] = useState(1);

  async function act(action: "grant_credit" | "acknowledge" | "dismiss") {
    setPending(
      action === "grant_credit"
        ? "credit"
        : action === "acknowledge"
          ? "ack"
          : "dismiss",
    );
    setError(null);
    try {
      const res = await fetch(`/api/admin/report-errors/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          credit_count: action === "grant_credit" ? creditCount : undefined,
          admin_notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setPending(null);
    }
  }

  const isOpen = submission.status === "open";

  return (
    <li className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusLabel.tone}`}
          >
            {statusLabel.label}
          </span>
          <span className="text-xs text-slate-500">
            {new Date(submission.created_at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>
        {submission.report_id && (
          <Link
            href={`/dashboard/reports/${submission.report_id}`}
            className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
          >
            Open report →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Submitter
          </p>
          <p className="text-slate-900 mt-0.5 break-all">{submission.email}</p>
          {submission.phone && (
            <p className="text-xs text-slate-600 mt-0.5">
              <a href={`tel:${submission.phone}`} className="hover:text-indigo-700">
                {submission.phone}
              </a>
            </p>
          )}
          {ownerName || ownerEmail ? (
            <p className="text-xs text-slate-500 mt-1">
              {ownerName ? (
                <>
                  Linked account:{" "}
                  <Link
                    href={`/admin/users/${submission.user_id}`}
                    className="hover:text-indigo-700 underline underline-offset-2"
                  >
                    {ownerName}
                  </Link>
                </>
              ) : (
                <>Linked account: {ownerEmail}</>
              )}
            </p>
          ) : (
            <p className="text-xs text-amber-700 mt-1">
              No Veroax account linked yet
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Categories
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {submission.categories.length === 0 ? (
              <span className="text-xs text-slate-500 italic">
                (no categories selected)
              </span>
            ) : (
              submission.categories.map((c) => (
                <span
                  key={c}
                  className="text-[10px] font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded"
                >
                  {CATEGORY_LABEL[c] ?? c}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {submission.message && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-1">
            Message
          </p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {submission.message}
          </p>
        </div>
      )}

      {isOpen ? (
        <>
          <label className="block">
            <span className="text-xs font-bold tracking-widest uppercase text-slate-500">
              Admin notes (internal)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What action did you take? Internal-only, never shown to the submitter."
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <label className="text-xs text-slate-600 flex items-center gap-2">
              Grant
              <input
                type="number"
                min={1}
                max={20}
                value={creditCount}
                onChange={(e) =>
                  setCreditCount(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-14 px-2 py-1 border border-slate-300 rounded-md text-sm text-center"
              />
              credit{creditCount === 1 ? "" : "s"}
            </label>
            <button
              type="button"
              onClick={() => act("grant_credit")}
              disabled={pending !== null}
              className="bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-500 disabled:opacity-60"
            >
              {pending === "credit" ? "Granting…" : "Grant + close"}
            </button>
            <button
              type="button"
              onClick={() => act("acknowledge")}
              disabled={pending !== null}
              className="bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-slate-600 disabled:opacity-60"
            >
              {pending === "ack" ? "Saving…" : "Acknowledge"}
            </button>
            <button
              type="button"
              onClick={() => act("dismiss")}
              disabled={pending !== null}
              className="bg-white border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-60"
            >
              {pending === "dismiss" ? "Dismissing…" : "Dismiss"}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mt-3">
              {error}
            </p>
          )}
        </>
      ) : (
        submission.admin_notes && (
          <p className="text-xs text-slate-500 italic mt-2">
            Admin notes: {submission.admin_notes}
          </p>
        )
      )}
    </li>
  );
}
