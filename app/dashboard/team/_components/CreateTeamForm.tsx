"use client";

// Form shown when the current user isn't in any team yet. Submits
// to /api/team/create, then router.refresh() so the page rerenders
// with the new team state.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  defaultName?: string;
};

export function CreateTeamForm({ defaultName }: Props) {
  const [name, setName] = useState(defaultName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Team name is required.");
      return;
    }
    const res = await fetch("/api/team/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Failed to create team.",
      );
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 max-w-xl"
    >
      <h2 className="text-lg font-bold text-slate-900">Create your team</h2>
      <p className="text-sm text-slate-600 mt-2 leading-relaxed">
        Bring your agents into a single Veroax account. Team owners
        invite agents by email, share a monthly report quota, and can
        see every report any team member creates. Solo agents do not
        need a team; this is for brokerages and small teams.
      </p>
      <label className="block mt-5">
        <span className="text-xs font-semibold text-slate-700 block mb-1">
          Team name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Fielden Realty Group"
          autoComplete="organization"
          maxLength={120}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Shown to invited agents and on the team report list. You can
          change it later from the team settings page (coming soon).
        </p>
      </label>
      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end mt-5">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="bg-indigo-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create team"}
        </button>
      </div>
    </form>
  );
}
