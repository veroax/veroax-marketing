"use client";

import { useState } from "react";

// Universal "Report an error" affordance. Renders as a small text
// link by default; clicking opens a modal with the canonical
// category checkboxes + free-form message + contact info. Posts to
// /api/report-errors/submit which logs the row and emails support.
//
// Used in two contexts:
//   1. Agent dashboard report-detail page — signed-in submitter,
//      user_id auto-attached. defaultEmail is pre-filled from the
//      signed-in profile.
//   2. Public /r/{code} share view — anonymous submitter, no
//      defaultEmail, no user_id; admin can still grant a credit if
//      the email matches a known account.

type Category = {
  key: string;
  label: string;
  hint?: string;
};

const CATEGORIES: Category[] = [
  {
    key: "irrelevant_findings",
    label: "Includes findings that don't apply to this unit",
    hint: "e.g., balcony issues on a ground-floor unit, HOA business that doesn't affect this owner",
  },
  {
    key: "missed_critical_finding",
    label: "Missed a critical issue I expected to see",
    hint: "e.g., ABS pipe, FPE panel, water intrusion, polybutylene plumbing not surfaced as Critical",
  },
  {
    key: "wrong_unit_or_address",
    label: "Wrong unit, wrong floor, or wrong address",
  },
  {
    key: "incorrect_cost_estimate",
    label: "Cost estimate is clearly off",
    hint: "Too high, too low, or wrong responsibility (should be HOA-paid, etc.)",
  },
  {
    key: "wrong_rating",
    label: "Overall rating doesn't match the actual file",
  },
  {
    key: "source_link_broken",
    label: "Click-to-source / source PDF link didn't work",
  },
  {
    key: "rendering_issue",
    label: "Layout, text overlap, or PDF rendering problem",
  },
  {
    key: "other",
    label: "Something else",
  },
];

type Props = {
  reportId?: string;
  defaultEmail?: string;
  // Where the button label sits — render a small text link inline
  // ("inline") or a full-width button ("block").
  variant?: "inline" | "block";
};

export function ReportErrorButton({
  reportId,
  defaultEmail,
  variant = "inline",
}: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"form" | "sending" | "sent" | "error">(
    "form",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    setErrorMessage(null);
    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("A valid email is required.");
      return;
    }
    if (selected.size === 0 && !message.trim()) {
      setErrorMessage(
        "Pick at least one category or write a short description.",
      );
      return;
    }
    setPhase("sending");
    try {
      const res = await fetch("/api/report-errors/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: reportId ?? null,
          email: email.trim(),
          phone: phone.trim() || null,
          categories: Array.from(selected),
          message: message.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `Submit failed (HTTP ${res.status}).`);
      }
      setPhase("sent");
    } catch (err) {
      setPhase("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Could not submit.",
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setPhase("form");
          setErrorMessage(null);
        }}
        className={
          variant === "block"
            ? "w-full text-center bg-white border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50"
            : "text-xs text-slate-500 hover:text-red-700 underline underline-offset-2"
        }
        title="Tell us if something in this report is wrong — we may grant a refund credit"
      >
        Report an error in this report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => phase !== "sending" && setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {phase === "sent" ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 text-2xl mb-3">
                  ✓
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Got it — thanks.
                </h3>
                <p className="text-sm text-slate-600 max-w-sm mx-auto">
                  We&apos;ll review your note and follow up at{" "}
                  <span className="font-mono">{email}</span> within one
                  business day. If we can confirm an error in this report,
                  we&apos;ll grant a refund credit to your account.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-5 bg-slate-900 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-900">
                  Report an error
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Pick everything that applies. If we confirm an error
                  affected the value of the report, we&apos;ll grant a
                  refund credit to your Veroax account.
                </p>

                <fieldset className="mt-4 space-y-2">
                  {CATEGORIES.map((c) => (
                    <label
                      key={c.key}
                      className="flex items-start gap-2.5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.key)}
                        onChange={() => toggle(c.key)}
                        className="mt-1 rounded border-slate-300 text-indigo-700 focus:ring-indigo-400"
                      />
                      <div className="flex-1">
                        <p className="text-sm text-slate-800">{c.label}</p>
                        {c.hint && (
                          <p className="text-xs text-slate-500">{c.hint}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </fieldset>

                <label className="block mt-4">
                  <span className="text-xs font-semibold text-slate-700 block mb-1">
                    Anything else we should know? (optional)
                  </span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    placeholder="Specific finding number, page reference, screenshot URL, etc."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </label>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700 block mb-1">
                      Your email <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700 block mb-1">
                      Phone (optional)
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 555-5555"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </label>
                </div>

                {errorMessage && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mt-3">
                    {errorMessage}
                  </p>
                )}

                <div className="flex justify-end gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={phase === "sending"}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={phase === "sending"}
                    className="bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-indigo-600 disabled:opacity-60"
                  >
                    {phase === "sending" ? "Sending…" : "Send"}
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
