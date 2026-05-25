// POST /api/team/members/[userId]/remove
//
// Remove a member from the caller's team. Caller must be owner/admin
// of the same org. An owner cannot be removed; transfer ownership
// first (a future feature). A user can also remove themself (the
// "leave team" path).

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  // Resolve caller's membership.
  const { data: callerRow } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  const caller = callerRow as
    | { organization_id: string; role: "owner" | "admin" | "agent" }
    | null;
  if (!caller) {
    return NextResponse.json(
      { error: "You're not part of a team." },
      { status: 409 },
    );
  }

  // Resolve target's membership (same org).
  const { data: targetRow } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", targetUserId)
    .maybeSingle();
  const target = targetRow as
    | { organization_id: string; role: "owner" | "admin" | "agent" }
    | null;
  if (!target || target.organization_id !== caller.organization_id) {
    return NextResponse.json(
      { error: "That user isn't on your team." },
      { status: 404 },
    );
  }

  // Self-remove is always allowed (the "leave team" path).
  const isSelfRemove = targetUserId === user.id;

  // Removing someone else requires owner/admin role.
  if (!isSelfRemove && caller.role !== "owner" && caller.role !== "admin") {
    return NextResponse.json(
      { error: "Only team owners and admins can remove members." },
      { status: 403 },
    );
  }

  // Cannot remove the owner. They have to transfer ownership first
  // (feature coming later).
  if (target.role === "owner") {
    return NextResponse.json(
      {
        error:
          "Can't remove the team owner. Ownership transfer is a future feature; until then, delete the team to remove the owner.",
      },
      { status: 409 },
    );
  }

  const { error: delErr } = await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", caller.organization_id)
    .eq("user_id", targetUserId);
  if (delErr) {
    return NextResponse.json(
      { error: `Failed to remove member: ${delErr.message}` },
      { status: 500 },
    );
  }

  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: isSelfRemove ? "team.left" : "team.member_removed",
      metadata: {
        organization_id: caller.organization_id,
        actor_user_id: user.id,
        target_role_was: target.role,
      },
    });
  } catch (err) {
    console.error("[team/remove] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
