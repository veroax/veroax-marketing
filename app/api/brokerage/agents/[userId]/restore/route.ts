// POST /api/brokerage/agents/[userId]/restore
//
// Brokerage admin restores a previously-archived agent. Only valid
// for agents archived with scope='brokerage' under THIS brokerage.
// Site-scoped archives need a site admin to restore.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getCurrentUserBrokerageContext,
  isBrokerageAdmin,
} from "@/lib/brokerage/admin";
import { restoreUser } from "@/lib/server/archiveUser";

export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

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

  const admin = createServiceRoleClient();

  // The target's profile must still have a team_members or
  // brokerage_agents/admins row pointing at THIS brokerage. Archive
  // doesn't delete those rows, so this check holds even for archived
  // users.
  const inBrokerage = await isUserInBrokerage({
    admin,
    userId: targetUserId,
    brokerageId: brokerageContext.brokerage.id,
  });
  if (!inBrokerage) {
    return NextResponse.json(
      { error: "That agent is not part of your brokerage." },
      { status: 404 },
    );
  }

  const result = await restoreUser({
    admin,
    targetUserId,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    callerIsSiteAdmin: false,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

async function isUserInBrokerage({
  admin,
  userId,
  brokerageId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  userId: string;
  brokerageId: string;
}): Promise<boolean> {
  const [directAgent, adminRow, teamMember] = await Promise.all([
    admin
      .from("brokerage_agents")
      .select("user_id")
      .eq("brokerage_id", brokerageId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("brokerage_admins")
      .select("user_id")
      .eq("brokerage_id", brokerageId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (directAgent.data) return true;
  if (adminRow.data) return true;
  const tm = teamMember.data as { team_id: string } | null;
  if (tm?.team_id) {
    const { data: teamRow } = await admin
      .from("teams")
      .select("brokerage_id")
      .eq("id", tm.team_id)
      .maybeSingle();
    return (
      (teamRow as { brokerage_id: string | null } | null)?.brokerage_id ===
      brokerageId
    );
  }
  return false;
}
