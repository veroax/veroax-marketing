// POST /api/team/invite/[token]/revoke
//
// Revoke a pending invite. Caller must be an owner/admin of the team
// the invite belongs to. Marks the invite row 'revoked' so the
// token can no longer be used to accept.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  const { data: inviteRow } = await admin
    .from("team_invites")
    .select("id, team_id, status")
    .eq("token", token)
    .maybeSingle();
  const invite = inviteRow as
    | {
        id: string;
        team_id: string;
        status: "pending" | "accepted" | "expired" | "revoked";
      }
    | null;
  if (!invite) {
    return NextResponse.json(
      { error: "Invite not found." },
      { status: 404 },
    );
  }

  // Caller must be owner/admin of the same team.
  const { data: memberRow } = await admin
    .from("team_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("team_id", invite.team_id)
    .maybeSingle();
  const role = (memberRow as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "Only team owners and admins can revoke invites." },
      { status: 403 },
    );
  }

  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: `Invite is already ${invite.status}.` },
      { status: 409 },
    );
  }

  await admin
    .from("team_invites")
    .update({ status: "revoked" })
    .eq("id", invite.id);

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "team.invite_revoked",
      metadata: {
        team_id: invite.team_id,
        invite_id: invite.id,
      },
    });
  } catch (err) {
    console.error("[team/invite/revoke] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
