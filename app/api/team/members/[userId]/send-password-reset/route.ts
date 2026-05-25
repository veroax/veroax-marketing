// POST /api/team/members/[userId]/send-password-reset
//
// Team owner/admin triggers a password-reset email for a member of
// their team. Same recovery flow as the admin-side route but gated
// by team membership instead of site-admin status. Cannot reset
// passwords for users outside the caller's team.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  // Caller must be owner/admin of the same team as target.
  const { data: callerRow } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  const caller = callerRow as
    | { organization_id: string; role: "owner" | "admin" | "agent" }
    | null;
  if (!caller || (caller.role !== "owner" && caller.role !== "admin")) {
    return NextResponse.json(
      { error: "Only team owners and admins can trigger password resets." },
      { status: 403 },
    );
  }

  const { data: targetMemberRow } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", targetUserId)
    .maybeSingle();
  const targetMember = targetMemberRow as { organization_id: string } | null;
  if (!targetMember || targetMember.organization_id !== caller.organization_id) {
    return NextResponse.json(
      { error: "That user is not on your team." },
      { status: 404 },
    );
  }

  const { data: profileRow } = await admin
    .from("profiles")
    .select("email")
    .eq("id", targetUserId)
    .maybeSingle();
  const target = profileRow as { email?: string } | null;
  if (!target?.email) {
    return NextResponse.json(
      { error: "User has no email on file." },
      { status: 404 },
    );
  }

  const redirectTo = `${SITE_URL}/auth/confirm?next=${encodeURIComponent("/auth/reset-password")}`;
  const { error } = await admin.auth.resetPasswordForEmail(target.email, {
    redirectTo,
  });
  if (error) {
    return NextResponse.json(
      { error: `Failed to send reset email: ${error.message}` },
      { status: 500 },
    );
  }

  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: "team.password_reset_sent",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
        organization_id: caller.organization_id,
      },
    });
  } catch (err) {
    console.error("[team-send-password-reset] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
