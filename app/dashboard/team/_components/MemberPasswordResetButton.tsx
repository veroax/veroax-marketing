"use client";

// Team owner/admin button: send a password-reset email to a team
// member. Goes through the gentle recovery flow (the member picks
// their own new password). Team admins canNOT force-set a password
// directly; that's a site-admin-only capability.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  userEmail: string;
};

export function MemberPasswordResetButton({ userId, userEmail }: Props) {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const router = useRouter();

  async function doSend() {
    if (
      !confirm(`Send a password reset email to ${userEmail}?`)
    ) {
      return;
    }
    setInfo(null);
    const res = await fetch(
      `/api/team/members/${userId}/send-password-reset`,
      { method: "POST" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(
        typeof data.error === "string"
          ? data.error
          : "Failed to send reset.",
      );
      return;
    }
    setInfo("Reset sent");
    startTransition(() => router.refresh());
    setTimeout(() => setInfo(null), 4000);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={doSend}
        disabled={pending}
        className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2 disabled:opacity-50"
        title="Send a Supabase password reset email"
      >
        Send password reset
      </button>
      {info ? (
        <span className="text-[10px] text-emerald-700">{info}</span>
      ) : null}
    </div>
  );
}
