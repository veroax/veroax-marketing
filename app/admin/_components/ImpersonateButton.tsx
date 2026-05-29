"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

// Admin "View as user" trigger. POSTs to /api/admin/impersonate
// which validates admin status, sets the vx_impersonate_user_id
// cookie, and audit-logs the start event. On success this routes
// the browser to /dashboard where the impersonation banner
// renders and subsequent reads scope to the target user.
//
// Intentional confirmation prompt: impersonation is sensitive and
// shows the admin data they wouldn't otherwise see. Make the
// admin click twice so they don't trigger it by accident.

type Props = {
  userId: string;
  userLabel: string;
};

export function ImpersonateButton({ userId, userLabel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function start() {
    if (
      !confirm(
        `Impersonate ${userLabel}? You'll see the dashboard exactly as they see it. This is logged.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(
            `Could not start impersonation: ${data?.error ?? "unknown error"}`,
          );
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        alert(
          `Could not start impersonation: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    });
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={pending}
      className="text-xs font-semibold bg-indigo-700 text-white hover:bg-indigo-600 px-3 py-1.5 rounded transition-colors disabled:opacity-60"
      title="Open the dashboard as this user, banner across the top, read-only by design"
    >
      {pending ? "Starting..." : "View as user"}
    </button>
  );
}
