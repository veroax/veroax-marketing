// POST /api/team/invite/[token]/accept
//
// Accept a pending team invite. Caller must be authenticated and
// must NOT already be a member of another team. Marks the invite
// row 'accepted' and creates the team_members row in one logical
// transaction.

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

  if (!token) {
    return NextResponse.json(
      { error: "Invite token is required." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();

  const { data: inviteRow } = await admin
    .from("team_invites")
    .select("id, team_id, email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  const invite = inviteRow as
    | {
        id: string;
        team_id: string;
        email: string;
        role: "admin" | "agent";
        status: "pending" | "accepted" | "expired" | "revoked";
        expires_at: string;
      }
    | null;
  if (!invite) {
    return NextResponse.json(
      { error: "Invite not found." },
      { status: 404 },
    );
  }
  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: `This invite is ${invite.status} and can't be accepted.` },
      { status: 409 },
    );
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await admin
      .from("team_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return NextResponse.json(
      { error: "This invite has expired. Ask your team to send a new one." },
      { status: 410 },
    );
  }

  // Sanity check: the signed-in email should match the invite email.
  // This prevents an agent from forwarding their invite to another
  // person who then accepts it under a different identity.
  if (
    (user.email ?? "").toLowerCase() !== invite.email.toLowerCase()
  ) {
    return NextResponse.json(
      {
        error: `This invite was sent to ${invite.email}. Sign in with that account to accept.`,
      },
      { status: 403 },
    );
  }

  // Reject if the user is already in any team (one-team-per-user MVP).
  const { data: existing } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        error:
          "You're already a member of a team. Leave it before joining a new one.",
      },
      { status: 409 },
    );
  }

  const { error: memberErr } = await admin.from("team_members").insert({
    team_id: invite.team_id,
    user_id: user.id,
    role: invite.role,
  });
  if (memberErr) {
    return NextResponse.json(
      { error: `Failed to join team: ${memberErr.message}` },
      { status: 500 },
    );
  }

  await admin
    .from("team_invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "team.invite_accepted",
      metadata: {
        team_id: invite.team_id,
        role: invite.role,
        invite_id: invite.id,
      },
    });
  } catch (err) {
    console.error("[team/invite/accept] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    team_id: invite.team_id,
  });
}
