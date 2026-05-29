"use client";

import { useState } from "react";

// Small flag affordance on each FindingDetail card. Click opens a
// modal with category options + free-text note. On submit, POSTs to
// /api/reports/[id]/findings/flag and stamps a row in finding_flags.
// The founder triages flags via /admin/finding-flags and uses them
// as a per-finding feedback signal to tighten the analyzer prompt.
//
// Inspired by Cowork SKILL.md feedback loop, see
// docs/internal/COWORK_VEROAX_DIFF.md item 4.

type Props = {
  reportId: string;
  findingTitle: string;
  findingSeverity: string;
};

type Category =
  | "inaccurate"
  | "not_applicable"
  | "wrong_severity"
  | "missing_context"
  | "scope_overreach"
  | "other";

const CATEGORY_LABELS: Record<Category, string> = {
  inaccurate: "Inaccurate (the document doesn't say this)",
  not_applicable: "Not applicable to this property / unit",
  wrong_severity: "Wrong severity (over- or under-rated)",
  missing_context: "Missing context the agent would add",
  scope_overreach: "Scope overreach (broader than the source says)",
  other: "Other",
};

export function FindingFlagButton({
  reportId,
  findingTitle,
  findingSeverity,
}: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("inaccurate");
  const [note, setNote] = useState("");
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "submitting" }
    | { phase: "done" }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  function reset() {
    setCategory("inaccurate");
    setNote("");
    setState({ phase: "idle" });
  }

  async function submit() {
    setState({ phase: "submitting" });
    try {
      const res = await fetch(`/api/reports/${reportId}/findings/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_title: findingTitle,
          finding_severity: findingSeverity,
          category,
          note: note.trim() ? note.trim() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (HTTP ${res.status}).`);
      }
      setState({ phase: "done" });
      // Auto-close after 2 seconds so the agent can flag the next
      // finding without an extra click.
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 2000);
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Could not save flag.",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 text-slate-400 hover:text-amber-700 transition-colors"
        title="Flag this finding for review"
        aria-label="Flag this finding"
      >
        <FlagIcon />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Flag this finding"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Flag this finding
              </h3>
              <p className="text-xs text-slate-500 mt-1 break-words">
                &ldquo;{findingTitle}&rdquo;
              </p>
            </div>

            {state.phase === "done" ? (
              <p className="text-sm text-emerald-700 py-2">
                Thanks, flag saved. The team will review it.
              </p>
            ) : (
              <>
                <fieldset className="space-y-1.5">
                  <legend className="text-xs font-semibold text-slate-700 mb-1">
                    What&apos;s wrong?
                  </legend>
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                    <label
                      key={c}
                      className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="category"
                        value={c}
                        checked={category === c}
                        onChange={() => setCategory(c)}
                        className="mt-0.5"
                      />
                      <span>{CATEGORY_LABELS[c]}</span>
                    </label>
                  ))}
                </fieldset>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">
                    Anything else? (optional)
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={4000}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="What should the analyzer have said instead?"
                  />
                </label>

                {state.phase === "error" && (
                  <p className="text-xs text-red-700">{state.message}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      reset();
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={state.phase === "submitting"}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-amber-400 text-indigo-950 hover:bg-amber-300 disabled:opacity-60"
                  >
                    {state.phase === "submitting" ? "Saving..." : "Save flag"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function FlagIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden="true"
      className="inline-block text-base"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
