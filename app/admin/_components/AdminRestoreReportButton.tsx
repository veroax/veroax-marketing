"use client";

// AdminRestoreReportButton, undoes a soft-delete. Used from the
// /admin/reports/deleted view, where each row shows the owner +
// purge deadline + a Restore button. The button's confirmation
// explicitly names the owner the report restores to, so the
// admin sees "Restore X to user@example.com?" before clicking,
// matching the founder's spec.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AdminRestoreReportButton({
  reportId,
  ownerLabel,
  reportLabel,
}: {
  reportId: string;
  ownerLabel: string;
  reportLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function rerestore() {
    if (
      !confirm(
        `Restore this report to ${ownerLabel}?\n\n${reportLabel}\n\nThe report will return to the agent's dashboard, the admin list, and (if a share link was previously generated) the public share view.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/restore`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || `HTTP ${res.status}`,
        );
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Restore failed.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={rerestore}
        disabled={busy || pending}
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-3 py-1.5 rounded-md border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors disabled:opacity-60"
      >
        {busy || pending ? "Restoring..." : "Restore"}
      </button>
      {err ? <p className="text-[10px] text-red-700">{err}</p> : null}
    </div>
  );
}
