"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

// Top-of-dashboard banner shown when the admin is viewing the
// dashboard as another user. The banner is intentionally loud
// (red eyebrow, full-width strip) so the admin can NEVER mistake
// the impersonated session for their own. Includes a Stop button
// that clears the cookie and reloads.

type Props = {
  fullName: string | null;
  email: string;
};

export function ImpersonationBanner({ fullName, email }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function stop() {
    startTransition(async () => {
      try {
        await fetch("/api/admin/impersonate/stop", { method: "POST" });
      } catch {
        // Swallow; we still refresh so the user can see what
        // happened.
      }
      // Hard navigate to /admin so the admin sidebar comes back
      // and they don't get stuck in a stale dashboard view of
      // someone else's data.
      router.push("/admin/users");
      router.refresh();
    });
  }

  const label = fullName?.trim() || email;
  return (
    <div className="bg-red-700 text-white px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-widest bg-white text-red-700 px-1.5 py-0.5 rounded">
          Impersonating
        </span>
        <span className="text-sm font-semibold truncate">
          Viewing the dashboard as {label}
        </span>
      </div>
      <button
        type="button"
        onClick={stop}
        disabled={pending}
        className="text-xs font-semibold bg-white text-red-700 hover:bg-red-50 px-3 py-1 rounded transition-colors disabled:opacity-60"
      >
        {pending ? "Stopping..." : "Stop impersonating"}
      </button>
    </div>
  );
}
