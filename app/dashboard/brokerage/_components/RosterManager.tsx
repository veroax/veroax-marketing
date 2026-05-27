"use client";

// Interactive roster management for /dashboard/brokerage.
//
// Handles:
//   - Per-row Archive button on every active agent + admin
//   - Bulk archive: row checkboxes + toolbar
//   - Per-team Transfer Ownership button (modal w/ dropdown)
//   - Per-invite Revoke button
//   - Archived agents collapsed section with Restore buttons
//
// The parent server page fetches data and passes it through props.
// All mutations go through /api/brokerage/* routes.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type RosterAgent = {
  user_id: string;
  full_name: string | null;
  email: string;
  role_label: string; // "Team Lead Admin" or "Agent" or "Direct Agent" etc.
  team_id: string | null; // for grouping; null = direct agent
  team_name: string | null;
  is_team_owner: boolean; // blocks archive
  archived_at: string | null;
  archived_scope: "brokerage" | "site" | null;
};

export type RosterTeam = {
  id: string;
  name: string;
  owner_user_id: string;
  members: Array<{
    user_id: string;
    full_name: string | null;
    email: string;
  }>;
};

export type RosterInvite = {
  id: string;
  email: string;
  role: string;
  team_id: string | null;
  created_at: string;
  expires_at: string;
};

type Props = {
  agents: RosterAgent[]; // includes archived agents
  teams: RosterTeam[];
  pendingInvites: RosterInvite[];
};

export function RosterManager({ agents, teams, pendingInvites }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [transferTeam, setTransferTeam] = useState<RosterTeam | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = agents.filter((a) => !a.archived_at);
  const archived = agents
    .filter((a) => a.archived_at)
    .sort((a, b) =>
      (b.archived_at ?? "").localeCompare(a.archived_at ?? ""),
    );

  function toggleSelect(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function clearMessages() {
    setError(null);
    setInfo(null);
  }

  async function archiveOne(agent: RosterAgent) {
    clearMessages();
    if (agent.is_team_owner) {
      setError(
        `Cannot archive ${agent.full_name?.trim() || agent.email}: they own a team. Transfer ownership first.`,
      );
      return;
    }
    const label = agent.full_name?.trim() || agent.email;
    if (
      !confirm(
        `Archive ${label}? They will lose login access. Their reports stay visible to the team. You can restore them later from the Archived section.`,
      )
    ) {
      return;
    }
    const res = await fetch(
      `/api/brokerage/agents/${agent.user_id}/archive`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Failed to archive.",
      );
      return;
    }
    setInfo(`Archived ${label}.`);
    startTransition(() => router.refresh());
  }

  async function archiveBulk() {
    clearMessages();
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Archive ${ids.length} selected agent${ids.length === 1 ? "" : "s"}? Team owners will be skipped with an explanation. Restorable later.`,
      )
    ) {
      return;
    }
    const res = await fetch("/api/brokerage/agents/bulk-archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Bulk archive failed.",
      );
      return;
    }
    const skippedSummary =
      data.skipped && data.skipped.length > 0
        ? ` Skipped ${data.skipped.length}: ${data.skipped
            .map(
              (s: { userId: string; reason: string }) =>
                s.reason.split(":")[0],
            )
            .join("; ")}`
        : "";
    setInfo(`Archived ${data.archived ?? 0}.${skippedSummary}`);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  async function restore(agent: RosterAgent) {
    clearMessages();
    if (agent.archived_scope === "site") {
      setError(
        "Site-archived users must be restored by Veroax support.",
      );
      return;
    }
    const label = agent.full_name?.trim() || agent.email;
    if (!confirm(`Restore ${label}? They will regain login access.`)) {
      return;
    }
    const res = await fetch(
      `/api/brokerage/agents/${agent.user_id}/restore`,
      { method: "POST" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Restore failed.",
      );
      return;
    }
    setInfo(`Restored ${label}.`);
    startTransition(() => router.refresh());
  }

  async function transferOwnership(
    team: RosterTeam,
    newOwnerUserId: string,
  ) {
    clearMessages();
    const res = await fetch(
      `/api/brokerage/teams/${team.id}/transfer-owner`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerUserId }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Transfer failed.",
      );
      return;
    }
    setInfo(`Team "${team.name}" ownership transferred.`);
    setTransferTeam(null);
    startTransition(() => router.refresh());
  }

  async function revokeInvite(invite: RosterInvite) {
    clearMessages();
    if (!confirm(`Revoke the pending invite for ${invite.email}?`)) return;
    const res = await fetch(
      `/api/brokerage/invites/${invite.id}/revoke`,
      { method: "POST" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Revoke failed.",
      );
      return;
    }
    setInfo(`Invite for ${invite.email} revoked.`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-4 py-2">
          {info}
        </p>
      ) : null}

      {/* Bulk toolbar (only renders when something is selected) */}
      {selected.size > 0 ? (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap sticky top-2 z-10">
          <p className="text-sm font-semibold text-indigo-900">
            {selected.size} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-indigo-700 hover:text-indigo-900 px-3 py-1.5"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={archiveBulk}
              disabled={pending}
              className="bg-red-700 text-white text-xs font-semibold px-4 py-1.5 rounded hover:bg-red-600 disabled:opacity-60"
            >
              Archive {selected.size}
            </button>
          </div>
        </div>
      ) : null}

      {/* Active agents table */}
      <section>
        <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
          Active agents ({active.length})
        </h2>
        {active.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-500">
            No active agents in this brokerage yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="text-left font-semibold px-4 py-3">Agent</th>
                  <th className="text-left font-semibold px-4 py-3">Team / Role</th>
                  <th className="text-right font-semibold px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {active.map((a) => (
                  <tr key={a.user_id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(a.user_id)}
                        onChange={() => toggleSelect(a.user_id)}
                        className="rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {a.full_name?.trim() || a.email}
                      </p>
                      {a.full_name?.trim() ? (
                        <p className="text-[11px] text-slate-500">
                          {a.email}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {a.team_name ?? "Direct agent"}
                      <span className="text-slate-400 ml-2">
                        {a.role_label}
                      </span>
                      {a.is_team_owner ? (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                          Owner
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => archiveOne(a)}
                        disabled={pending || a.is_team_owner}
                        title={
                          a.is_team_owner
                            ? "Transfer team ownership before archiving"
                            : "Archive this agent"
                        }
                        className="text-xs text-red-700 hover:text-red-900 underline underline-offset-2 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Teams with transfer-owner action */}
      {teams.length > 0 ? (
        <section>
          <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
            Team ownership
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Team</th>
                  <th className="text-left font-semibold px-4 py-3">Owner</th>
                  <th className="text-right font-semibold px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teams.map((t) => {
                  const owner = t.members.find(
                    (m) => m.user_id === t.owner_user_id,
                  );
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {t.name}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {owner?.full_name?.trim() ||
                          owner?.email ||
                          t.owner_user_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setTransferTeam(t)}
                          className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
                        >
                          Transfer ownership
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Pending invites with revoke */}
      {pendingInvites.length > 0 ? (
        <section>
          <h2 className="text-xs font-bold tracking-widest text-slate-700 uppercase mb-3">
            Pending invites
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Email</th>
                  <th className="text-left font-semibold px-4 py-3">Role</th>
                  <th className="text-left font-semibold px-4 py-3">Expires</th>
                  <th className="text-right font-semibold px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingInvites.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 text-slate-900 break-all">
                      {inv.email}
                    </td>
                    <td className="px-4 py-3 text-slate-700 capitalize">
                      {inv.role}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => revokeInvite(inv)}
                        disabled={pending}
                        className="text-xs text-red-700 hover:text-red-900 underline underline-offset-2"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Archived agents (collapsed by default) */}
      {archived.length > 0 ? (
        <section>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs font-bold tracking-widest text-slate-700 uppercase hover:text-slate-900"
          >
            {showArchived ? "▾" : "▸"} Archived ({archived.length})
          </button>
          {showArchived ? (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-3">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3">Agent</th>
                    <th className="text-left font-semibold px-4 py-3">Archived</th>
                    <th className="text-right font-semibold px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {archived.map((a) => (
                    <tr key={a.user_id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700 line-through">
                          {a.full_name?.trim() || a.email}
                        </p>
                        <p className="text-[11px] text-slate-500">{a.email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {a.archived_at
                          ? new Date(a.archived_at).toLocaleDateString()
                          : ""}
                        {a.archived_scope === "site" ? (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                            Site admin
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.archived_scope === "brokerage" ? (
                          <button
                            type="button"
                            onClick={() => restore(a)}
                            disabled={pending}
                            className="text-xs text-emerald-700 hover:text-emerald-900 underline underline-offset-2"
                          >
                            Restore
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Contact support
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Transfer ownership modal */}
      {transferTeam ? (
        <TransferOwnerModal
          team={transferTeam}
          onCancel={() => setTransferTeam(null)}
          onSubmit={(newOwnerUserId) =>
            transferOwnership(transferTeam, newOwnerUserId)
          }
        />
      ) : null}
    </div>
  );
}

function TransferOwnerModal({
  team,
  onCancel,
  onSubmit,
}: {
  team: RosterTeam;
  onCancel: () => void;
  onSubmit: (newOwnerUserId: string) => void;
}) {
  const [chosen, setChosen] = useState<string>("");
  const candidates = team.members.filter(
    (m) => m.user_id !== team.owner_user_id,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-900">
          Transfer ownership of {team.name}
        </h3>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          The current owner becomes a regular Agent. The new owner can
          manage members, send invites, and rename the team.
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-4">
            This team has no other members to transfer to. Add a
            member first.
          </p>
        ) : (
          <label className="block mt-4">
            <span className="text-xs font-semibold text-slate-700 block mb-1">
              New owner
            </span>
            <select
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a team member...</option>
              {candidates.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name?.trim() || m.email}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-slate-500 px-4 py-2 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!chosen || candidates.length === 0}
            onClick={() => onSubmit(chosen)}
            className="bg-indigo-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-60"
          >
            Transfer ownership
          </button>
        </div>
      </div>
    </div>
  );
}
