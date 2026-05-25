// POST /api/admin/users/[userId]/send-password-reset
//
// Site admin triggers a Supabase password-reset email for any user.
// The email link routes to /auth/confirm with type=recovery, which
// verifies the token and redirects to /auth/reset-password where
// the user picks their new password.
//
// This is the gentler counterpart to force-set-password: works
// through the standard recovery flow, no admin needs to know the
// user's chosen password, but DEPENDS on Supabase email delivery
// being healthy (Resend SMTP configured, etc).

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  const { data: targetRow } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", targetUserId)
    .maybeSingle();
  const target = targetRow as { id: string; email: string } | null;
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // resetPasswordForEmail works through the GoTrue API; service-role
  // can trigger it for arbitrary emails. redirectTo points back to
  // our recovery landing page.
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
      event_type: "user.password_reset_sent_by_admin",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
      },
    });
  } catch (err) {
    console.error("[send-password-reset] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
