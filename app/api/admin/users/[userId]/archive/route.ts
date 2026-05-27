// POST /api/admin/users/[userId]/archive
//
// Site admin archives any user (cross-brokerage scope). Body:
// { reason?: string }
//
// scope = 'site'. Site-scoped archives can only be restored by a
// site admin (brokerage admins see them as "Contact support").

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { archiveUser } from "@/lib/server/archiveUser";

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  // Site admin gate.
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!(callerProfile as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json(
      { error: "Site admin access required." },
      { status: 403 },
    );
  }

  // Safety: an admin cannot archive themselves. Avoids a footgun
  // where the only admin locks themselves out and we have to
  // recover via direct SQL.
  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "You cannot archive your own admin account." },
      { status: 409 },
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
    scope: "site",
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
