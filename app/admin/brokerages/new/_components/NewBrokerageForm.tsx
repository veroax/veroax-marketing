"use client";

// Client form for POST /api/admin/brokerages. On success, redirects
// to the brokerage detail page where the admin can invite the owner
// and finish branding.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function NewBrokerageForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [dreLicense, setDreLicense] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [agentSeats, setAgentSeats] = useState(100);
  const [reportsPerMonth, setReportsPerMonth] = useState(100);
  const [overageUsd, setOverageUsd] = useState(25);
  const [contractNotes, setContractNotes] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Brokerage name is required.");
      return;
    }
    const res = await fetch("/api/admin/brokerages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        dre_license: dreLicense.trim() || null,
        contact_email: contactEmail.trim() || null,
        agent_seat_limit: agentSeats,
        reports_per_month: reportsPerMonth,
        per_report_overage_cents: Math.round(overageUsd * 100),
        contract_notes: contractNotes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Failed to create brokerage.",
      );
      return;
    }
    startTransition(() => router.push(`/admin/brokerages/${data.id}`));
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Brokerage name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Coldwell Banker Bay Cities"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="DRE license #" hint="Shown on PDF cover with the brokerage logo.">
          <input
            type="text"
            value={dreLicense}
            onChange={(e) => setDreLicense(e.target.value)}
            placeholder="01234567"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </Field>

        <Field label="Contact email" hint="Where billing + ops notifications go.">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="ops@brokerage.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </Field>
      </div>

      <fieldset className="border border-slate-200 rounded-2xl p-5">
        <legend className="text-xs font-bold tracking-widest text-slate-500 uppercase px-2">
          Allocation
        </legend>
        <p className="text-xs text-slate-500 mb-4">
          The brokerage gets these knobs to slice up across their teams
          + direct agents. A team counts as one agent toward the seat
          limit; agents on a team consume the same allocation as direct
          agents.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Field label="Agent seats">
            <input
              type="number"
              min={1}
              value={agentSeats}
              onChange={(e) =>
                setAgentSeats(parseInt(e.target.value || "0", 10))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Field>
        </div>
      </fieldset>

      <Field label="Contract notes" hint="Free-form, internal-only. Captures any non-standard terms.">
        <textarea
          value={contractNotes}
          onChange={(e) => setContractNotes(e.target.value)}
          rows={3}
          placeholder="e.g., Founding customer; 6-month pilot; net-30 invoicing."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </Field>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-indigo-600 disabled:opacity-60"
        >
          {pending ? "Creating..." : "Create brokerage"}
        </button>
      </div>
    </form>
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
      <span className="block text-xs font-semibold text-slate-700 mb-1">
        {label}
        {required ? <span className="text-red-600 ml-0.5">*</span> : null}
      </span>
      {children}
      {hint ? (
        <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
      ) : null}
    </label>
  );
}
