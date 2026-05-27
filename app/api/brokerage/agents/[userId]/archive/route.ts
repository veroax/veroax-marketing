// POST /api/brokerage/agents/[userId]/archive
//
// Brokerage admin archives a single agent in their own brokerage.
// Body: { reason?: string }
//
// Scope = 'brokerage' (vs. site-scoped, which is the admin route).
// Brokerage-scoped archives can later be restored by the same
// brokerage's admin OR by a site admin.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getCurrentUserBrokerageContext,
  isBrokerageAdmin,
} from "@/lib/brokerage/admin";
import { archiveUser } from "@/lib/server/archiveUser";

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // Brokerage admin check via user-scoped client (RLS-respecting).
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

  // Verify the target belongs to this brokerage. Either as a direct
  // brokerage_agent, OR as a member of a team that's under this
  // brokerage.
  const admin = createServiceRoleClient();
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

  const body = (await request.json().catch(() => ({}))) as {
    reason?: string;
  };
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : null;

  const result = await archiveUser({
    admin,
    targetUserId,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    scope: "brokerage",
    reason,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    share_codes_revoked: result.share_codes_revoked,
  });
}

// Helper: is the given user a member of the given brokerage,
// either as a direct agent (brokerage_agents) OR through a team
// (team_members where team.brokerage_id = brokerageId) OR as an
// admin (brokerage_admins)?
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
  // Team member: check the team is in this brokerage.
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
