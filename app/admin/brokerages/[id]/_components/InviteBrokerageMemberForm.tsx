"use client";

// Invite form on the brokerage detail page. Sends an email + creates a
// brokerage_invites row. The recipient lands at /invite/brokerage/[token]
// to accept.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  brokerageId: string;
  teams: Array<{ id: string; name: string }>;
};

export function InviteBrokerageMemberForm({ brokerageId, teams }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "admin" | "agent">("agent");
  const [teamId, setTeamId] = useState<string>("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const res = await fetch(
      `/api/admin/brokerages/${brokerageId}/invite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          role,
          team_id: role === "agent" && teamId ? teamId : null,
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Failed to send invite.",
      );
      return;
    }
    setInfo("Invite sent.");
    setEmail("");
    setTeamId("");
    startTransition(() => router.refresh());
    setTimeout(() => setInfo(null), 4000);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="block sm:col-span-2">
          <span className="block text-xs font-semibold text-slate-700 mb-1">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="agent@brokerage.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1">
            Role
          </span>
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "owner" | "admin" | "agent")
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
          </select>
        </label>
      </div>

      {role === "agent" && teams.length > 0 ? (
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700 mb-1">
            Place on team (optional)
          </span>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Direct agent (no team)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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
          {pending ? "Sending..." : "Send invite"}
        </button>
      </div>
    </form>
  );
}
