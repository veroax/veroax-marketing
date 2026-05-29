"use client";

import { useState } from "react";

// Public-surface flag affordance on every finding card at /r/<code>.
// Mirrors the agent-side FindingFlagButton on the dashboard but
// posts to the anonymous /api/r/[code]/findings/flag endpoint. The
// modal additionally asks for an optional name + email so the
// founder can follow up on a useful flag, neither is required.

type Props = {
  shareCode: string;
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
  missing_context: "Missing context",
  scope_overreach: "Scope overreach (broader than the source says)",
  other: "Other",
};

export function PublicFindingFlagButton({
  shareCode,
  findingTitle,
  findingSeverity,
}: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("inaccurate");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "submitting" }
    | { phase: "done" }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  function reset() {
    setCategory("inaccurate");
    setNote("");
    setName("");
    setEmail("");
    setState({ phase: "idle" });
  }

  async function submit() {
    setState({ phase: "submitting" });
    try {
      const res = await fetch(`/api/r/${shareCode}/findings/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_title: findingTitle,
          finding_severity: findingSeverity,
          category,
          note: note.trim() ? note.trim() : null,
          submitter_name: name.trim() ? name.trim() : null,
          submitter_email: email.trim() ? email.trim() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (HTTP ${res.status}).`);
      }
      setState({ phase: "done" });
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 2200);
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
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
                Thanks, your flag was saved. We&apos;ll review it.
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
                    placeholder="What should this finding have said instead?"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">
                      Your name (optional)
                    </span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={100}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">
                      Email (optional)
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={200}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </label>
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  We only use your contact to follow up if the flag
                  needs clarification.
                </p>

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
