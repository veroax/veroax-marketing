// POST /api/brokerage/agents/bulk-archive
// Body: { userIds: string[], reason?: string }
//
// Archives up to MAX_BULK_ARCHIVE (50) agents in a single call, all
// scoped to the caller's brokerage. Each target is independently
// validated; team owners get skipped with a reason, the rest archive.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getCurrentUserBrokerageContext,
  isBrokerageAdmin,
} from "@/lib/brokerage/admin";
import { bulkArchiveUsers, MAX_BULK_ARCHIVE } from "@/lib/server/archiveUser";

export async function POST(request: Request) {
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
    userIds?: unknown;
    reason?: string;
  };
  if (!Array.isArray(body.userIds)) {
    return NextResponse.json(
      { error: "userIds must be an array." },
      { status: 400 },
    );
  }
  const userIds = body.userIds.filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  if (userIds.length === 0) {
    return NextResponse.json(
      { error: "No users specified." },
      { status: 400 },
    );
  }
  if (userIds.length > MAX_BULK_ARCHIVE) {
    return NextResponse.json(
      {
        error: `Too many users selected. Maximum ${MAX_BULK_ARCHIVE} per request.`,
      },
      { status: 400 },
    );
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : null;

  const admin = createServiceRoleClient();

  // Verify every target is in this brokerage BEFORE archiving. Drop
  // any that aren't; archive only the rest.
  const brokerageId = brokerageContext.brokerage.id;
  const validated: string[] = [];
  const skippedNotInBrokerage: Array<{ userId: string; reason: string }> = [];
  for (const id of userIds) {
    const inB = await isUserInBrokerage({ admin, userId: id, brokerageId });
    if (inB) validated.push(id);
    else
      skippedNotInBrokerage.push({
        userId: id,
        reason: "Not part of this brokerage.",
      });
  }

  if (validated.length === 0) {
    return NextResponse.json({
      ok: true,
      archived: 0,
      skipped: skippedNotInBrokerage,
    });
  }

  const result = await bulkArchiveUsers({
    admin,
    targetUserIds: validated,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    scope: "brokerage",
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    archived: result.archived,
    skipped: [...result.skipped, ...skippedNotInBrokerage],
  });
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
