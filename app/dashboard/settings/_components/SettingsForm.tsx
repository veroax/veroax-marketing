"use client";

import { useActionState, useState } from "react";
import {
  updateProfileAction,
  type SettingsActionState,
} from "../actions";

// Two-column layout: form on the left, live "Prepared By" preview on
// the right. The preview re-renders as the agent types so they see
// exactly what will land on their PDF cover before saving.

type Props = {
  email: string;
  initial: {
    full_name: string;
    dre_license: string;
    brokerage: string;
    brokerage_dre: string;
    phone: string;
    display_email: string;
  };
};

// Format a US phone number as the agent types: "4155550100" →
// "(415) 555-0100". Accepts any input shape (strips non-digits) so
// pasted "415-555-0100" or "+1 415 555 0100" normalize cleanly.
// Caps at 10 digits — extension numbers can be appended manually
// in a free-form field, but the formatted display stops at NPA-NXX-XXXX.
function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function SettingsForm({ email, initial }: Props) {
  const [state, formAction, pending] = useActionState<
    SettingsActionState | undefined,
    FormData
  >(updateProfileAction, undefined);

  // Mirror the form values into local state so the preview reflects
  // unsaved edits. After a save, the parent server component re-renders
  // with the persisted values, so `initial` will catch up.
  const [fullName, setFullName] = useState(initial.full_name);
  const [dreLicense, setDreLicense] = useState(initial.dre_license);
  const [brokerage, setBrokerage] = useState(initial.brokerage);
  const [brokerageDre, setBrokerageDre] = useState(initial.brokerage_dre);
  // Phone is stored formatted — re-format on init so legacy unformatted
  // numbers ("4155550100", "415-555-0100") display correctly.
  const [phone, setPhone] = useState(formatPhone(initial.phone));
  const [displayEmail, setDisplayEmail] = useState(initial.display_email);

  // What renders in the preview's email line: prefer the display email
  // (if set), otherwise fall back to the auth signup email.
  const previewEmail = displayEmail.trim() || email;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
      {/* -------- Form ------------------------------------------------ */}
      <form action={formAction} className="space-y-5">
        <Section title="Account" description="Sign-in address (locked) plus an optional display email that appears on the report.">
          <Field label="Sign-in email" hint="Used when you log in. To change it, contact support.">
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-lg text-sm"
            />
          </Field>
          <Field
            label="Display email (optional)"
            hint="What appears on the PDF cover and as the reply-to when you send a report through Veroax. Leave blank to use your sign-in email."
          >
            <input
              name="display_email"
              type="email"
              value={displayEmail}
              onChange={(e) => setDisplayEmail(e.target.value)}
              placeholder={email}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
        </Section>

        <Section title="Identity" description="Appears on the PDF cover under 'Prepared By' and in the page footer. Reports won't download without these fields.">
          <Field label="Full name" required>
            <input
              name="full_name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Michael Fielden"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="DRE license #" required hint="Your individual California DRE number (5-10 digits).">
            <input
              name="dre_license"
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]{5,10}"
              value={dreLicense}
              onChange={(e) => setDreLicense(e.target.value)}
              placeholder="01234567"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Phone" hint="Best number for clients. Formats automatically as (415) 555-0100.">
            <input
              name="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(415) 555-0100"
              maxLength={14} /* "(415) 555-0100" is 14 chars */
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
        </Section>

        <Section title="Brokerage" description="Appears below your name in the 'Prepared By' panel and in the page footer.">
          <Field label="Brokerage name" required>
            <input
              name="brokerage"
              type="text"
              required
              value={brokerage}
              onChange={(e) => setBrokerage(e.target.value)}
              placeholder="Luxuriant Realty"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Brokerage DRE #" hint="Your firm's California DRE number, distinct from your individual license.">
            <input
              name="brokerage_dre"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{5,10}"
              value={brokerageDre}
              onChange={(e) => setBrokerageDre(e.target.value)}
              placeholder="01234567"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
        </Section>

        {state?.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {state.error}
          </p>
        )}
        {state?.ok && !pending && (
          <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded">
            Saved. New reports will use this info immediately — re-download
            any existing report to see the update on the cover.
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center bg-amber-400 text-indigo-950 font-semibold px-5 py-2.5 rounded-lg text-sm hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* -------- Preview ----------------------------------------------
          Mirrors the PDF cover's "Prepared By" panel exactly. Watching
          this update as the agent types lets them confirm what their
          client will see before any report is regenerated. */}
      <aside>
        <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-2">
          Preview · PDF cover
        </p>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sticky top-4">
          <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase mb-1">
            Prepared By
          </p>
          {fullName ? (
            <p className="text-base font-bold text-indigo-950 leading-snug">
              {fullName}
            </p>
          ) : (
            <p className="text-base font-bold text-slate-300 leading-snug italic">
              Your name
            </p>
          )}
          {brokerage && (
            <p className="text-sm text-slate-600 mt-0.5">{brokerage}</p>
          )}
          {phone && <p className="text-xs text-slate-500 mt-2">{phone}</p>}
          <p className="text-xs text-slate-500">{previewEmail}</p>
          {(dreLicense || brokerageDre) && (
            <p className="text-xs text-slate-500">
              {dreLicense && `DRE #${dreLicense}`}
              {dreLicense && brokerageDre && " / "}
              {brokerageDre && `Brokerage DRE #${brokerageDre}`}
            </p>
          )}
          <hr className="my-4 border-slate-100" />
          <p className="text-[10px] text-slate-400 leading-relaxed">
            This is exactly how the &ldquo;Prepared By&rdquo; panel
            renders on the cover of every PDF you download. Page footers
            also use these fields.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white">
      <legend className="px-2 -ml-2 text-sm font-bold text-slate-900">
        {title}
      </legend>
      {description && (
        <p className="text-xs text-slate-500 -mt-3 mb-2">{description}</p>
      )}
      {children}
    </fieldset>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 mb-1 block">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-500 mt-1 block">{hint}</span>}
    </label>
  );
}
