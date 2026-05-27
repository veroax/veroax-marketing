"use client";

// Contact form. Fields:
//   - name (required)
//   - email (required)
//   - phone (optional, formatted live)
//   - company (optional, label adapts to the selected topic)
//   - best_time (optional)
//   - message (required, prefilled from topic)
//
// The topic comes from the parent page (parsed out of ?topic= in the
// server component); we use it to pick a prefilled message + tailor
// the label on the company field. Honeypot 'website' field is hidden.

import { useActionState, useState } from "react";
import { submitContactAction, type ContactActionState } from "../actions";
import { formatUsPhone } from "@/lib/format/phone";
import { SUPPORT } from "@/lib/site";

type Props = {
  topic: string;
};

export function ContactForm({ topic }: Props) {
  const [state, formAction, pending] = useActionState<
    ContactActionState | undefined,
    FormData
  >(submitContactAction, undefined);

  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(defaultMessageFor(topic));

  if (state?.ok) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 text-2xl mb-3">
          ✓
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">
          Got it, thank you.
        </h3>
        <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
          We will follow up by phone or email within one business day,
          usually sooner. If you need a faster response, call us at{" "}
          <a
            href={`tel:${SUPPORT.phoneTel}`}
            className="text-indigo-700 underline underline-offset-2"
          >
            {SUPPORT.phone}
          </a>{" "}
          between 8 AM and 8 PM Pacific.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Honeypot. Real users won't see this; bots fill every field. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      {/* Pass the topic through so the server can subject-line it. */}
      <input type="hidden" name="topic" value={topic} />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Your name" name="name" required autoComplete="name" />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 mb-1 block">
            Phone <span className="text-slate-400 font-normal">(optional)</span>
          </span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(formatUsPhone(e.target.value))}
            placeholder="(555) 123-4567"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <Field
          label={companyLabelFor(topic)}
          name="company"
          autoComplete="organization"
        />
      </div>

      <Field
        label="Best time to call"
        name="best_time"
        hint={`Optional. We monitor calls ${SUPPORT.hours}.`}
        placeholder="e.g., Weekdays after 2 PM Pacific"
      />

      <label className="block">
        <span className="text-xs font-semibold text-slate-700 mb-1 block">
          Message <span className="text-red-500">*</span>
        </span>
        <textarea
          name="message"
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us a bit about your team, your typical disclosure volume, and what brought you to Veroax."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
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
        className="w-full sm:w-auto bg-indigo-700 text-white font-semibold px-6 py-3 rounded-lg text-sm hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
      >
        {pending ? "Sending..." : "Send message"}
      </button>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        By submitting, you agree to receive a follow-up from Veroax at
        the contact info above. We never share your information.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  hint,
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  autoComplete?: string;
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
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {hint && (
        <span className="text-[11px] text-slate-500 mt-1 block">{hint}</span>
      )}
    </label>
  );
}

function companyLabelFor(topic: string): string {
  if (topic === "brokerage") return "Brokerage name";
  if (topic === "team") return "Team or brokerage name";
  if (topic === "investor") return "Fund / firm name";
  return "Company (optional)";
}

function defaultMessageFor(topic: string): string {
  if (topic === "brokerage") {
    return [
      "We are evaluating Veroax for our brokerage.",
      "",
      "Approximate agent count:",
      "Markets we cover:",
      "Typical disclosure volume per month:",
      "",
      "What we are most interested in:",
    ].join("\n");
  }
  if (topic === "team") {
    return [
      "We are looking at the Team tier.",
      "",
      "Approximate team size:",
      "Typical disclosure volume per month:",
    ].join("\n");
  }
  if (topic === "investor") {
    return [
      "I am interested in learning more about Veroax as an investment.",
      "",
      "Fund focus:",
      "Typical check size:",
    ].join("\n");
  }
  return "";
}
