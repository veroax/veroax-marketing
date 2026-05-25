// POST /api/team/create
//
// Creates a new standalone team and makes the current user its owner.
// Enforces one-team-per-user (schema unique index on
// team_members.user_id), so calling this while already on a team
// returns 409.
//
// Body: { name: string }   the team's display name
//
// This route only creates STANDALONE teams (no brokerage parent).
// Brokerage-scoped team creation goes through /api/brokerage/teams
// because the seat-limit/billing logic is different.

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
    .from("team_members")
    .select("team_id")
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

  const { data: teamRow, error: teamErr } = await admin
    .from("teams")
    .insert({
      name,
      slug: slug || null,
      owner_user_id: user.id,
    })
    .select("id")
    .single();
  if (teamErr || !teamRow) {
    return NextResponse.json(
      { error: teamErr?.message ?? "Failed to create team." },
      { status: 500 },
    );
  }
  const teamId = (teamRow as { id: string }).id;

  const { error: memberErr } = await admin.from("team_members").insert({
    team_id: teamId,
    user_id: user.id,
    role: "owner",
  });
  if (memberErr) {
    // Roll back the team so we don't leave an orphan row.
    await admin.from("teams").delete().eq("id", teamId);
    return NextResponse.json(
      { error: `Failed to add owner: ${memberErr.message}` },
      { status: 500 },
    );
  }

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "team.created",
      metadata: {
        team_id: teamId,
        name,
      },
    });
  } catch (err) {
    console.error("[team/create] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true, team_id: teamId });
}
