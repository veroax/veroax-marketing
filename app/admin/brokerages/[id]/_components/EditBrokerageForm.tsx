"use client";

// Inline editor for the brokerage's allocation, branding, and status.
// Mirrors the new-brokerage form but pre-fills + posts as PATCH.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Brokerage = {
  id: string;
  name: string;
  slug: string | null;
  dre_license: string | null;
  logo_url: string | null;
  brand_accent_hex: string | null;
  agent_seat_limit: number;
  reports_per_month: number;
  per_report_overage_cents: number;
  contract_notes: string | null;
  contact_email: string | null;
  status: "active" | "paused" | "archived";
};

export function EditBrokerageForm({ brokerage }: { brokerage: Brokerage }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [name, setName] = useState(brokerage.name);
  const [dreLicense, setDreLicense] = useState(brokerage.dre_license ?? "");
  const [contactEmail, setContactEmail] = useState(
    brokerage.contact_email ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(brokerage.logo_url ?? "");
  const [brandAccent, setBrandAccent] = useState(
    brokerage.brand_accent_hex ?? "",
  );
  const [agentSeats, setAgentSeats] = useState(brokerage.agent_seat_limit);
  const [reportsPerMonth, setReportsPerMonth] = useState(
    brokerage.reports_per_month,
  );
  const [overageUsd, setOverageUsd] = useState(
    brokerage.per_report_overage_cents / 100,
  );
  const [contractNotes, setContractNotes] = useState(
    brokerage.contract_notes ?? "",
  );
  const [status, setStatus] = useState<
    "active" | "paused" | "archived"
  >(brokerage.status);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/admin/brokerages/${brokerage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        dre_license: dreLicense.trim() || null,
        logo_url: logoUrl.trim() || null,
        brand_accent_hex: brandAccent.trim() || null,
        contact_email: contactEmail.trim() || null,
        agent_seat_limit: agentSeats,
        reports_per_month: reportsPerMonth,
        per_report_overage_cents: Math.round(overageUsd * 100),
        contract_notes: contractNotes.trim() || null,
        status,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Failed to update brokerage.",
      );
      return;
    }
    setInfo("Saved.");
    startTransition(() => router.refresh());
    setTimeout(() => setInfo(null), 3000);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </Field>
        <Field label="DRE license #">
          <input
            type="text"
            value={dreLicense}
            onChange={(e) => setDreLicense(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "active" | "paused" | "archived")
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </div>

      <fieldset className="border border-slate-200 rounded-2xl p-5">
        <legend className="text-xs font-bold tracking-widest text-slate-500 uppercase px-2">
          Allocation
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Field label="Agent seats">
            <input
              type="number"
              min={0}
              value={agentSeats}
              onChange={(e) =>
                setAgentSeats(parseInt(e.target.value || "0", 10))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Reports / month">
            <input
              type="number"
              min={0}
              value={reportsPerMonth}
              onChange={(e) =>
                setReportsPerMonth(parseInt(e.target.value || "0", 10))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Overage ($/report)">
            <input
              type="number"
              min={0}
              step={1}
              value={overageUsd}
              onChange={(e) =>
                setOverageUsd(parseFloat(e.target.value || "0"))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border border-slate-200 rounded-2xl p-5">
        <legend className="text-xs font-bold tracking-widest text-slate-500 uppercase px-2">
          Branding
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Logo URL" hint="Public URL; renders on PDF cover.">
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Accent color" hint="Hex (e.g., #1F2A5F). Used on PDF accents.">
            <input
              type="text"
              value={brandAccent}
              onChange={(e) => setBrandAccent(e.target.value)}
              placeholder="#1F2A5F"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </fieldset>

      <Field label="Contract notes" hint="Internal-only.">
        <textarea
          value={contractNotes}
          onChange={(e) => setContractNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </Field>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
          {info}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-indigo-600 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 mb-1">
        {label}
      </span>
      {children}
      {hint ? (
        <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
      ) : null}
    </label>
  );
}
