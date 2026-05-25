"use client";

// Revoke a pending invite. Owners/admins only (server-enforced).

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  token: string;
  email: string;
};

export function RevokeInviteButton({ token, email }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function doRevoke() {
    if (!confirm(`Revoke the pending invite to ${email}?`)) return;
    const res = await fetch(`/api/team/invite/${token}/revoke`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(
        typeof data.error === "string"
          ? data.error
          : "Failed to revoke invite.",
      );
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={doRevoke}
      disabled={pending}
      className="text-xs text-red-700 hover:text-red-900 underline underline-offset-2 disabled:opacity-50"
    >
      Revoke
    </button>
  );
}
