// POST /api/brokerage/invite/[token]/accept
//
// Accept a pending brokerage invite. Caller must be authenticated and
// must match the invite email. Behavior branches on the invite role:
//   - owner / admin -> insert into brokerage_admins
//   - agent + team_id -> insert into team_members (the team must
//     already be under this brokerage)
//   - agent without team_id -> insert into brokerage_agents (direct
//     brokerage agent, no team)

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
    .from("brokerage_invites")
    .select("id, brokerage_id, email, role, team_id, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  const invite = inviteRow as
    | {
        id: string;
        brokerage_id: string;
        email: string;
        role: "owner" | "admin" | "agent";
        team_id: string | null;
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
      .from("brokerage_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return NextResponse.json(
      { error: "This invite has expired." },
      { status: 410 },
    );
  }
  if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: `This invite was sent to ${invite.email}. Sign in with that account to accept.`,
      },
      { status: 403 },
    );
  }

  // Role-specific attachment.
  try {
    if (invite.role === "owner" || invite.role === "admin") {
      const { error } = await admin.from("brokerage_admins").insert({
        brokerage_id: invite.brokerage_id,
        user_id: user.id,
        role: invite.role,
      });
      if (error && !error.message.includes("duplicate")) {
        throw new Error(error.message);
      }
    } else if (invite.role === "agent" && invite.team_id) {
      // Sanity-check the team belongs to the brokerage.
      const { data: teamRow } = await admin
        .from("teams")
        .select("brokerage_id")
        .eq("id", invite.team_id)
        .maybeSingle();
      if (
        !teamRow ||
        (teamRow as { brokerage_id: string | null }).brokerage_id !==
          invite.brokerage_id
      ) {
        return NextResponse.json(
          { error: "Target team is not under this brokerage." },
          { status: 409 },
        );
      }
      const { error } = await admin.from("team_members").insert({
        team_id: invite.team_id,
        user_id: user.id,
        role: "agent",
      });
      if (error) {
        if (error.message?.includes("team_members_user_unique")) {
          return NextResponse.json(
            {
              error:
                "You're already a member of a team. Leave your current team before joining this one.",
            },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { error: `Failed to join team: ${error.message}` },
          { status: 500 },
        );
      }
    } else {
      // Direct brokerage agent (no team).
      const { error } = await admin.from("brokerage_agents").insert({
        brokerage_id: invite.brokerage_id,
        user_id: user.id,
      });
      if (error) {
        if (error.message?.includes("brokerage_agents_user_unique")) {
          return NextResponse.json(
            {
              error:
                "You're already a direct agent under another brokerage. Contact your site admin for help.",
            },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { error: `Failed to join brokerage: ${error.message}` },
          { status: 500 },
        );
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to accept invite.",
      },
      { status: 500 },
    );
  }

  await admin
    .from("brokerage_invites")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "brokerage.invite_accepted",
      metadata: {
        brokerage_id: invite.brokerage_id,
        role: invite.role,
        team_id: invite.team_id,
        invite_id: invite.id,
      },
    });
  } catch (err) {
    console.error("[brokerage/invite/accept] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    brokerage_id: invite.brokerage_id,
    role: invite.role,
  });
}
