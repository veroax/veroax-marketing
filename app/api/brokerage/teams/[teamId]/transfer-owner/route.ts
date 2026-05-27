// POST /api/brokerage/teams/[teamId]/transfer-owner
// Body: { newOwnerUserId: string }
//
// Brokerage admin transfers ownership of a team in their brokerage
// to another current member of that team. The old owner becomes a
// regular 'agent' role member.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getCurrentUserBrokerageContext,
  isBrokerageAdmin,
} from "@/lib/brokerage/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const brokerageContext = await getCurrentUserBrokerageContext(
    supabase,
    user.id,
  );
  if (!isBrokerageAdmin(brokerageContext) || !brokerageContext) {
    return NextResponse.json(
      { error: "Brokerage admin access required." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    newOwnerUserId?: string;
  };
  const newOwnerUserId =
    typeof body.newOwnerUserId === "string" ? body.newOwnerUserId : "";
  if (!newOwnerUserId) {
    return NextResponse.json(
      { error: "newOwnerUserId is required." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();

  // 1. Verify the team is in this brokerage.
  const { data: teamRow } = await admin
    .from("teams")
    .select("id, name, brokerage_id, owner_user_id")
    .eq("id", teamId)
    .maybeSingle();
  const team = teamRow as
    | {
        id: string;
        name: string;
        brokerage_id: string | null;
        owner_user_id: string;
      }
    | null;
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }
  if (team.brokerage_id !== brokerageContext.brokerage.id) {
    return NextResponse.json(
      { error: "That team is not part of your brokerage." },
      { status: 404 },
    );
  }
  if (team.owner_user_id === newOwnerUserId) {
    return NextResponse.json(
      { error: "That user already owns this team." },
      { status: 409 },
    );
  }

  // 2. Verify the new owner is a current member of the team.
  const { data: membershipRow } = await admin
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", teamId)
    .eq("user_id", newOwnerUserId)
    .maybeSingle();
  if (!membershipRow) {
    return NextResponse.json(
      { error: "New owner must already be a member of the team." },
      { status: 409 },
    );
  }

  // 3. Update teams.owner_user_id. The old owner stays in
  //    team_members but switches role to 'agent'. The new owner's
  //    team_members row updates to 'owner'.
  const oldOwnerId = team.owner_user_id;

  const { error: teamErr } = await admin
    .from("teams")
    .update({ owner_user_id: newOwnerUserId })
    .eq("id", teamId);
  if (teamErr) {
    return NextResponse.json(
      { error: `Team update failed: ${teamErr.message}` },
      { status: 500 },
    );
  }

  await admin
    .from("team_members")
    .update({ role: "agent" })
    .eq("team_id", teamId)
    .eq("user_id", oldOwnerId);
  await admin
    .from("team_members")
    .update({ role: "owner" })
    .eq("team_id", teamId)
    .eq("user_id", newOwnerUserId);

  // 4. Audit.
  try {
    await admin.from("audit_log").insert({
      user_id: newOwnerUserId,
      event_type: "team.owner_transferred",
      metadata: {
        team_id: teamId,
        team_name: team.name,
        old_owner_user_id: oldOwnerId,
        actor_user_id: user.id,
        actor_email: user.email ?? null,
      },
    });
  } catch (err) {
    console.error("[transfer-owner] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
