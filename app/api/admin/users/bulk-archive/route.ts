// POST /api/admin/users/bulk-archive
// Body: { userIds: string[], reason?: string }
//
// Cross-brokerage bulk archive at the site-admin level. Caps at
// MAX_BULK_ARCHIVE (50). Scope = 'site'.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { bulkArchiveUsers, MAX_BULK_ARCHIVE } from "@/lib/server/archiveUser";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();
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
  let userIds = body.userIds.filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  // Safety: an admin cannot bulk-archive themselves.
  userIds = userIds.filter((id) => id !== user.id);
  if (userIds.length === 0) {
    return NextResponse.json(
      { error: "No users specified (and you cannot archive yourself)." },
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

  const result = await bulkArchiveUsers({
    admin,
    targetUserIds: userIds,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    scope: "site",
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    archived: result.archived,
    skipped: result.skipped,
  });
}
