"use client";

// Row-level actions on /dashboard/team for the current viewer.
// Shows "Remove" when the viewer is owner/admin and the target is
// removable (not the owner, not the viewer themself). Shows
// "Leave team" when the viewer is looking at their own row.

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  viewerUserId: string;
  viewerRole: "owner" | "admin" | "agent";
  targetUserId: string;
  targetRole: "owner" | "admin" | "agent";
};

export function MemberActions({
  viewerUserId,
  viewerRole,
  targetUserId,
  targetRole,
}: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isSelf = viewerUserId === targetUserId;
  const isOwnerTarget = targetRole === "owner";

  async function doRemove(label: "remove" | "leave") {
    const confirmText =
      label === "leave"
        ? "Leave this team? You'll lose access to team reports."
        : "Remove this member from your team?";
    if (!confirm(confirmText)) return;
    const res = await fetch(`/api/team/members/${targetUserId}/remove`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(
        typeof data.error === "string"
          ? data.error
          : "Failed to remove member.",
      );
      return;
    }
    startTransition(() => {
      if (label === "leave") {
        router.push("/dashboard/team");
      }
      router.refresh();
    });
  }

  // Self → "Leave team" (except for owner; owner can't leave their
  // own team without transferring ownership, future feature).
  if (isSelf) {
    if (viewerRole === "owner") {
      return (
        <span className="text-[11px] text-slate-400 italic">
          Owner cannot leave
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => doRemove("leave")}
        disabled={pending}
        className="text-xs text-red-700 hover:text-red-900 underline underline-offset-2 disabled:opacity-50"
      >
        Leave team
      </button>
    );
  }

  // Non-self → "Remove" if viewer is owner/admin AND target isn't owner.
  if (
    (viewerRole === "owner" || viewerRole === "admin") &&
    !isOwnerTarget
  ) {
    return (
      <button
        type="button"
        onClick={() => doRemove("remove")}
        disabled={pending}
        className="text-xs text-red-700 hover:text-red-900 underline underline-offset-2 disabled:opacity-50"
      >
        Remove
      </button>
    );
  }

  return null;
}
