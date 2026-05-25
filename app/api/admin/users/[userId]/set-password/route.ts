// POST /api/admin/users/[userId]/set-password
//
// SITE-ADMIN power tool. Force-sets a user's password without
// requiring an email round-trip. Used to unstick a user who's
// locked out and doesn't have working email delivery yet (very
// common in early beta when Supabase SMTP isn't fully configured).
//
// The admin types the new password into a modal, we update the
// auth row directly. The user can sign in with that password and
// change it later from their settings.
//
// Body: { password: string }
//
// Writes an audit_log row tagged user.password_set_by_admin so
// future-you can audit who did what. Does NOT email the user that
// their password changed; that's the admin's job to communicate
// out of band.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
  };
  const newPassword = typeof body.password === "string" ? body.password : "";

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (newPassword.length > 200) {
    return NextResponse.json(
      { error: "Password is too long (200 char max)." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();

  // Verify target exists.
  const { data: targetRow } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!targetRow) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    password: newPassword,
  });
  if (error) {
    return NextResponse.json(
      { error: `Failed to set password: ${error.message}` },
      { status: 500 },
    );
  }

  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: "user.password_set_by_admin",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
      },
    });
  } catch (err) {
    console.error("[set-password] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
