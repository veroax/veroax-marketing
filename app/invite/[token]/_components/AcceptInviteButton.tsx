"use client";

// Client-side button that POSTs to the accept endpoint and routes
// the agent into the dashboard once they're a member. Server-side
// page already gated on auth + identity + existing-team state, so
// this just fires the API call.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  token: string;
  orgName: string;
};

export function AcceptInviteButton({ token, orgName }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function accept() {
    setError(null);
    const res = await fetch(`/api/team/invite/${token}/accept`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Failed to accept invite.",
      );
      return;
    }
    startTransition(() => {
      router.push("/dashboard/team");
      router.refresh();
    });
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-indigo-600 disabled:opacity-60"
      >
        {pending ? "Joining..." : `Join ${orgName}`}
      </button>
      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
          {error}
        </p>
      ) : null}
    </div>
  );
}
