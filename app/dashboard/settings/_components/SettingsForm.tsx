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
  };
};

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
  const [phone, setPhone] = useState(initial.phone);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
      {/* -------- Form ------------------------------------------------ */}
      <form action={formAction} className="space-y-5">
        <Section title="Account" description="Used for sign-in and reply-to addresses on emails sent through Veroax.">
          <Field label="Email" hint="Set when you signed up — to change it, contact support.">
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-lg text-sm"
            />
          </Field>
        </Section>

        <Section title="Identity" description="Appears on the PDF cover under 'Prepared By' and in the page footer.">
          <Field label="Full name" required>
            <input
              name="full_name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Michael Fielden"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="DRE license #" hint="Your individual California DRE number (5-10 digits).">
            <input
              name="dre_license"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={dreLicense}
              onChange={(e) => setDreLicense(e.target.value)}
              placeholder="01234567"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Phone" hint="Best number for clients to reach you.">
            <input
              name="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(415) 555-0100"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
        </Section>

        <Section title="Brokerage" description="Appears below your name in the 'Prepared By' panel and in the page footer.">
          <Field label="Brokerage name">
            <input
              name="brokerage"
              type="text"
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
              pattern="[0-9]*"
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
          <p className="text-xs text-slate-500">{email}</p>
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
