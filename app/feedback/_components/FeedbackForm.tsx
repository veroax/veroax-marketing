"use client";

import { useActionState } from "react";
import {
  submitFeedbackAction,
  type FeedbackActionState,
} from "../actions";

export function FeedbackForm() {
  const [state, formAction, pending] = useActionState<
    FeedbackActionState | undefined,
    FormData
  >(submitFeedbackAction, undefined);

  if (state?.ok) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 text-2xl mb-3">
          ✓
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">
          Got it, thank you.
        </h2>
        <p className="text-sm text-slate-600">
          We&apos;ll get back to you within a business day.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Your name" name="name" required />
      <Field label="Your email" name="email" type="email" required />
      <Field
        label="Report ID (optional)"
        name="report_id"
        hint="If your feedback is about a specific report, paste its ID from the URL, helps us look it up faster."
      />
      <label className="block">
        <span className="text-xs font-semibold text-slate-700 mb-1 block">
          Your message <span className="text-red-500">*</span>
        </span>
        <textarea
          name="message"
          required
          rows={7}
          placeholder="Tell us what's working, what's broken, or what you wish Veroax did differently."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </label>

      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-amber-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
      >
        {pending ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 mb-1 block">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      {hint && <span className="text-[11px] text-slate-500 mt-1 block">{hint}</span>}
    </label>
  );
}
