"use client";

// Client form for /admin/integrations. Single text input for the
// GA4 Measurement ID plus an optional notes field. POSTs to
// /api/admin/integrations as JSON; refreshes the page on success so
// the next render reflects the new config.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  initial: {
    google_analytics_id: string | null;
    notes: string | null;
    updated_at: string | null;
  };
};

export function IntegrationsForm({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gaId, setGaId] = useState(initial.google_analytics_id ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        google_analytics_id: gaId.trim() || null,
        notes: notes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Failed to save integration settings.",
      );
      return;
    }
    setInfo("Saved. Changes apply within ~60 seconds.");
    startTransition(() => router.refresh());
    setTimeout(() => setInfo(null), 4000);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="text-xs font-semibold text-slate-700 mb-1 block">
          GA4 Measurement ID
        </span>
        <input
          type="text"
          value={gaId}
          onChange={(e) => setGaId(e.target.value)}
          placeholder="G-XXXXXXXXXX"
          className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Find this in your GA4 property under Admin → Data Streams →
          Web → Measurement ID. Leave empty to turn analytics off.
        </p>
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700 mb-1 block">
          Internal notes (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g., 'GA4 property created 2026-05-26 by Michael, account: veroax@gmail.com'"
          rows={2}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>

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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-indigo-600 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        {initial.updated_at ? (
          <span className="text-xs text-slate-500">
            Last saved {new Date(initial.updated_at).toLocaleString()}
          </span>
        ) : null}
      </div>
    </form>
  );
}
