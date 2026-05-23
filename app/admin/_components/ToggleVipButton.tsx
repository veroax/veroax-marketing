"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Promotes/demotes a user's VIP status. VIPs bypass the credit gate
// and never see a watermark. Use sparingly — the granted user
// effectively gets unlimited free access until you flip it back.

type Props = {
  userId: string;
  currentIsVip: boolean;
  userLabel: string;
};

export function ToggleVipButton({
  userId,
  currentIsVip,
  userLabel,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/toggle-vip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          is_vip: !currentIsVip,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setNotes("");
          setError(null);
        }}
        className={
          currentIsVip
            ? "bg-amber-500 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-amber-400"
            : "bg-white border border-amber-300 text-amber-800 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-amber-50"
        }
        title={
          currentIsVip
            ? "Revoke VIP. User goes back to the normal credit gate"
            : "Grant VIP. User gets free, unwatermarked access to everything"
        }
      >
        {currentIsVip ? "★ Revoke VIP" : "☆ Grant VIP"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !pending && setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {currentIsVip
                ? `Revoke VIP from ${userLabel}?`
                : `Grant VIP to ${userLabel}?`}
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              {currentIsVip
                ? "They'll go back to the normal credit gate. Existing credits stay in their account; future reports will consume from their pools."
                : "They'll get unlimited, unwatermarked access to the entire product. Use sparingly: friends, pilot agents, brokerage decision-makers we're courting."}
            </p>
            <label className="block mt-4">
              <span className="text-xs font-semibold text-slate-700 block mb-1">
                Notes (internal audit log)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={
                  currentIsVip
                    ? "Why are we revoking? (optional)"
                    : "Pilot agent for X brokerage / personal friend / etc."
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mt-3">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className={
                  currentIsVip
                    ? "bg-amber-700 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-amber-600 disabled:opacity-60"
                    : "bg-amber-500 text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-amber-400 disabled:opacity-60"
                }
              >
                {pending
                  ? "Saving…"
                  : currentIsVip
                    ? "Revoke VIP"
                    : "Grant VIP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
