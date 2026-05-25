"use client";

// Form shown to owners/admins to invite a new agent by email.
// Submits to /api/team/invite, refreshes the page on success so the
// new pending-invite row appears.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function InviteMemberForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"agent" | "admin">("agent");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Failed to send invite.",
      );
      return;
    }
    setEmail("");
    setRole("agent");
    setSuccess("Invite sent. They'll get an email shortly.");
    startTransition(() => router.refresh());
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6"
    >
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
        Invite a new member
      </h3>
      <p className="text-xs text-slate-500 mt-1">
        They'll receive an email with a link to join your team. The link
        expires in 14 days.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="agent@brokerage.com"
          autoComplete="off"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "agent" | "admin")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          <option value="agent">Agent</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="bg-indigo-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-50"
        >
          {pending ? "Sending..." : "Send invite"}
        </button>
      </div>
      {success ? (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 mt-3">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
          {error}
        </p>
      ) : null}
      <p className="text-[10px] text-slate-500 mt-3">
        Admins can invite and remove other members. Agents can only
        generate reports.
      </p>
    </form>
  );
}
