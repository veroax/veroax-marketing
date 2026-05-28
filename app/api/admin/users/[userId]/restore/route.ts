// POST /api/admin/users/[userId]/restore
//
// Site admin restores any archived user. Works for both
// brokerage-scoped AND site-scoped archives (site admin overrides
// the scope-respecting rule in restoreUser via callerIsSiteAdmin=true).

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { restoreUser } from "@/lib/server/archiveUser";

export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  const result = await restoreUser({
    admin,
    targetUserId,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    callerIsSiteAdmin: true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
