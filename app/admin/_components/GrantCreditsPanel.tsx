"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin "grant credits" form on /admin/users/[id]. Lets the admin
// drop N trial or pay-as-you-go credits into a user's account with
// a notes field. The user sees the grant on their billing dashboard
// with the notes as context.

type Props = {
  userId: string;
  currentTrial: number;
  currentOneoff: number;
};

type CreditType = "trial" | "oneoff";

export function GrantCreditsPanel({
  userId,
  currentTrial,
  currentOneoff,
}: Props) {
  const router = useRouter();
  const [count, setCount] = useState(1);
  const [type, setType] = useState<CreditType>("trial");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSuccess(null);
    if (count < 1) {
      setError("Grant at least 1 credit.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/grant-credits/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          type,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setSuccess(
        `Granted ${data.count} ${data.type} credit${data.count === 1 ? "" : "s"}. New balance: ${data.new_balance}.`,
      );
      setCount(1);
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grant failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Grant credits
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Drop reports into this user&apos;s account. Trial credits
            produce a watermarked PDF; one-off credits produce full-
            quality reports. Both show up on the agent&apos;s billing
            dashboard with your notes.
          </p>
        </div>
        <div className="text-xs text-right shrink-0">
          <p className="text-slate-500">Current</p>
          <p className="text-slate-900 font-mono">{currentTrial} trial</p>
          <p className="text-slate-900 font-mono">{currentOneoff} one-off</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 block mb-1">
            How many?
          </span>
          <input
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 block mb-1">
            Type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CreditType)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          >
            <option value="trial">
              Trial credits (watermarked PDFs)
            </option>
            <option value="oneoff">
              One-off credits (full quality, don&apos;t expire)
            </option>
          </select>
        </label>
      </div>

      <label className="block mt-3">
        <span className="text-xs font-semibold text-slate-700 block mb-1">
          Notes (visible to the recipient on their billing dashboard)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. 'Comp for failed analysis on report b809...'  /  'Pilot bonus' / 'Apology for the bug last week'"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </label>

      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="text-xs">
          {error && (
            <p className="text-red-700">{error}</p>
          )}
          {success && (
            <p className="text-emerald-700">{success}</p>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-amber-500 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-amber-400 disabled:opacity-60 shrink-0"
        >
          {pending ? "Granting…" : `Grant ${count} ${type}`}
        </button>
      </div>
    </div>
  );
}
