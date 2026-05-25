// POST /api/team/create
//
// Creates a new organization and makes the current user its owner.
// Enforces one-org-per-user (schema unique index on
// organization_members.user_id), so calling this while already in
// a team returns 409.
//
// Body: { name: string }   the team's display name

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
  };
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) {
    return NextResponse.json(
      { error: "Team name is required." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();

  // Reject if the user is already a member of any team. The unique
  // index would catch this on insert, but we want a clean error
  // message instead of a generic constraint violation.
  const { data: existingMembership } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingMembership) {
    return NextResponse.json(
      {
        error:
          "You're already a member of a team. Leave your current team before creating a new one.",
      },
      { status: 409 },
    );
  }

  // Slug: lowercase + dash-cased version of the name. Not enforced
  // unique here; collisions are fine since lookups go by id.
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const { data: orgRow, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name,
      slug: slug || null,
      owner_user_id: user.id,
    })
    .select("id")
    .single();
  if (orgErr || !orgRow) {
    return NextResponse.json(
      { error: orgErr?.message ?? "Failed to create team." },
      { status: 500 },
    );
  }
  const orgId = (orgRow as { id: string }).id;

  const { error: memberErr } = await admin
    .from("organization_members")
    .insert({
      organization_id: orgId,
      user_id: user.id,
      role: "owner",
    });
  if (memberErr) {
    // Roll back the org so we don't leave an orphan row.
    await admin.from("organizations").delete().eq("id", orgId);
    return NextResponse.json(
      { error: `Failed to add owner: ${memberErr.message}` },
      { status: 500 },
    );
  }

  // Audit.
  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "team.created",
      metadata: {
        organization_id: orgId,
        name,
      },
    });
  } catch (err) {
    console.error("[team/create] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true, organization_id: orgId });
}
