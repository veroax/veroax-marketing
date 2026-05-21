"use client";

import { useActionState, useState } from "react";
import {
  updateProfileAction,
  type SettingsActionState,
} from "../actions";
import { ImageUploadField } from "./ImageUploadField";

// Two-column layout: form on the left, live "Prepared By" preview on
// the right. The preview re-renders as the agent types so they see
// exactly what will land on their PDF cover before saving.

type Props = {
  email: string;
  userId: string;
  initial: {
    full_name: string;
    dre_license: string;
    brokerage: string;
    brokerage_dre: string;
    phone: string;
    display_email: string;
    brokerage_logo_url: string;
    headshot_url: string;
    brand_accent_hex: string;
    tagline: string;
    website_url: string;
    scheduling_url: string;
    office_address: string;
    email_signature: string;
  };
};

// Veroax gold — the default accent color. Stored as null in the DB
// when the agent hasn't picked one; here in the UI we still show the
// gold so the preview never looks broken.
const DEFAULT_ACCENT = "#C9A84C";

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

export function SettingsForm({ email, userId, initial }: Props) {
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

  // New branding fields (item 2 stubs — items 3 and 4 will swap the
  // URL inputs for upload widgets and the hex input for a swatch
  // picker. The state shape stays the same).
  const [brokerageLogoUrl, setBrokerageLogoUrl] = useState(
    initial.brokerage_logo_url,
  );
  const [headshotUrl, setHeadshotUrl] = useState(initial.headshot_url);
  const [brandAccentHex, setBrandAccentHex] = useState(initial.brand_accent_hex);
  const [tagline, setTagline] = useState(initial.tagline);
  const [websiteUrl, setWebsiteUrl] = useState(initial.website_url);
  const [schedulingUrl, setSchedulingUrl] = useState(initial.scheduling_url);
  const [officeAddress, setOfficeAddress] = useState(initial.office_address);
  const [emailSignature, setEmailSignature] = useState(initial.email_signature);

  // What renders in the preview's email line: prefer the display email
  // (if set), otherwise fall back to the auth signup email.
  const previewEmail = displayEmail.trim() || email;
  // Preview always paints with SOME accent so the bar doesn't look
  // broken — fall back to gold when the agent hasn't chosen one.
  const previewAccent = brandAccentHex.trim() || DEFAULT_ACCENT;

  // Auto-generated default signature for the email-signature
  // placeholder — keeps the agent oriented on what "leave blank" gets
  // them. Matches the structure of formatSignoff() in
  // /api/reports/[id]/email/draft/route.ts.
  const defaultSignaturePreview = [
    fullName || "Your name",
    brokerage,
    dreLicense ? `DRE #${dreLicense}` : "",
    phone,
    previewEmail,
  ]
    .filter(Boolean)
    .join("\n");

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

        <Section title="Branding" description="Personal touches that appear on the PDF cover. All optional — the report works without them.">
          <ImageUploadField
            name="brokerage_logo_url"
            pathPrefix="brokerage_logo"
            label="Brokerage logo"
            hint="Renders prominently on the PDF cover and again in the page footer. Transparent PNG or SVG works best."
            userId={userId}
            value={brokerageLogoUrl}
            onChange={setBrokerageLogoUrl}
            shape="square"
          />
          <ImageUploadField
            name="headshot_url"
            pathPrefix="headshot"
            label="Headshot"
            hint="Small thumbnail next to your name in the 'Prepared By' panel. Square crops look best."
            userId={userId}
            value={headshotUrl}
            onChange={setHeadshotUrl}
            shape="circle"
          />
          <Field
            label="Brand accent color"
            hint="Six-character hex (e.g. #0F766E). Leave blank for the Veroax gold default. A swatch picker arrives in the next iteration; for now, paste a hex value."
          >
            <input
              name="brand_accent_hex"
              type="text"
              value={brandAccentHex}
              onChange={(e) => setBrandAccentHex(e.target.value)}
              placeholder="#C9A84C"
              maxLength={7}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
        </Section>

        <Section title="Public details" description="Surfaces on the PDF cover, the page footer, and the seeded client email.">
          <Field label="Tagline" hint="Short subtitle under your name on the cover. Example: 'Bay Area Buyer's Agent · 15 years'.">
            <input
              name="tagline"
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Bay Area Buyer's Agent · 15 years"
              maxLength={120}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Website URL" hint="Rendered in the page footer and as a link in HTML emails.">
            <input
              name="website_url"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://luxuriantrealty.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Scheduling URL" hint="Calendly, Cal.com, or similar. When set, drives a 'Schedule a call' link in the seeded client email.">
            <input
              name="scheduling_url"
              type="url"
              value={schedulingUrl}
              onChange={(e) => setSchedulingUrl(e.target.value)}
              placeholder="https://calendly.com/your-handle"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
          <Field label="Office address" hint="Multi-line; renders in the page footer beneath your DRE numbers.">
            <textarea
              name="office_address"
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
              placeholder={"123 Market St, Suite 400\nSan Francisco, CA 94103"}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>
        </Section>

        <Section title="Email signature" description="Replaces the auto-generated signature in the seeded client email. The PDF cover always uses the structured fields above.">
          <Field
            label="Custom signature (optional)"
            hint="Leave blank to use the auto-generated signature below."
          >
            <textarea
              name="email_signature"
              value={emailSignature}
              onChange={(e) => setEmailSignature(e.target.value)}
              placeholder={defaultSignaturePreview}
              rows={6}
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
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden sticky top-4">
          {/* Accent bar across the top mirrors the cover's vertical
              gold stripe — exact-match isn't important, just signalling
              the color choice to the agent before they save. */}
          <div
            className="h-2 w-full"
            style={{ backgroundColor: previewAccent }}
          />
          <div className="p-5">
            {brokerageLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brokerageLogoUrl}
                alt=""
                className="max-h-12 mb-3"
                onError={(e) => {
                  // Hide on load failure so a typo doesn't break the
                  // preview card layout.
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <p
              className="text-[10px] font-semibold tracking-widest uppercase mb-1"
              style={{ color: previewAccent }}
            >
              Prepared By
            </p>
            <div className="flex items-start gap-3">
              {headshotUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headshotUrl}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 mt-0.5 shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div className="min-w-0">
                {fullName ? (
                  <p className="text-base font-bold text-indigo-950 leading-snug">
                    {fullName}
                  </p>
                ) : (
                  <p className="text-base font-bold text-slate-300 leading-snug italic">
                    Your name
                  </p>
                )}
                {tagline && (
                  <p className="text-xs text-slate-500 italic mt-0.5">
                    {tagline}
                  </p>
                )}
                {brokerage && (
                  <p className="text-sm text-slate-600 mt-1">{brokerage}</p>
                )}
              </div>
            </div>
            {phone && <p className="text-xs text-slate-500 mt-2">{phone}</p>}
            <p className="text-xs text-slate-500">{previewEmail}</p>
            {(dreLicense || brokerageDre) && (
              <p className="text-xs text-slate-500">
                {dreLicense && `DRE #${dreLicense}`}
                {dreLicense && brokerageDre && " / "}
                {brokerageDre && `Brokerage DRE #${brokerageDre}`}
              </p>
            )}
            {officeAddress && (
              <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">
                {officeAddress}
              </p>
            )}
            {websiteUrl && (
              <p className="text-xs text-slate-500">{websiteUrl}</p>
            )}
            <hr className="my-4 border-slate-100" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              This is exactly how the &ldquo;Prepared By&rdquo; panel
              renders on the cover of every PDF you download. Page footers
              also use these fields.
            </p>
          </div>
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
