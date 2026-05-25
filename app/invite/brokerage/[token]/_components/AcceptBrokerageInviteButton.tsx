"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  token: string;
  brokerageName: string;
  role: "owner" | "admin" | "agent";
};

export function AcceptBrokerageInviteButton({
  token,
  brokerageName,
  role,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function doAccept() {
    setError(null);
    const res = await fetch(
      `/api/brokerage/invite/${token}/accept`,
      { method: "POST" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Failed to accept invite.",
      );
      return;
    }
    // Brokerage owners + admins go to /dashboard/brokerage; agents go
    // to the regular /dashboard.
    const dest =
      role === "owner" || role === "admin"
        ? "/dashboard/brokerage"
        : "/dashboard";
    startTransition(() => router.push(dest));
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={doAccept}
        disabled={pending}
        className="bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-indigo-600 disabled:opacity-60"
      >
        {pending ? "Joining..." : `Accept and join ${brokerageName}`}
      </button>
      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
          {error}
        </p>
      ) : null}
    </div>
  );
}
