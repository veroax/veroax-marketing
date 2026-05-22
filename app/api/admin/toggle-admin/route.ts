import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// POST /api/admin/toggle-admin
// Body: { user_id: string, is_admin: boolean }
//
// Promotes or demotes a user's admin role. Caller must themselves be
// an admin. We use the service-role client to perform the update so
// RLS doesn't restrict us to the caller's own profile row.
//
// Safety: we forbid an admin from demoting THEMSELVES if they would be
// the last admin in the system. That avoids the lockout case where
// the only admin accidentally removes their own privileges and now
// nobody can promote anyone again. Forced recovery would require
// direct SQL access.

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const callerIsAdmin = Boolean(
    (callerProfile as { is_admin?: boolean } | null)?.is_admin,
  );
  if (!callerIsAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const targetUserId =
    typeof body?.user_id === "string" ? body.user_id.trim() : "";
  const targetIsAdmin = Boolean(body?.is_admin);
  if (!targetUserId) {
    return NextResponse.json(
      { error: "user_id is required." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();

  // Self-demotion guardrail: if the caller is demoting themselves AND
  // they are the only remaining admin, block the action. The same
  // shape covers the "demote the last admin via another admin"
  // case — count admins after the proposed change and reject if it
  // would zero out.
  if (!targetIsAdmin) {
    const { count } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_admin", true);
    const currentAdminCount = count ?? 0;
    // We're about to set targetUserId.is_admin to false. If that user is
    // currently an admin AND removing them would leave zero admins,
    // block. (Edge: target wasn't admin to begin with — count doesn't
    // change. Handled by the .eq().single() lookup below.)
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", targetUserId)
      .maybeSingle();
    const targetWasAdmin = Boolean(
      (targetProfile as { is_admin?: boolean } | null)?.is_admin,
    );
    if (targetWasAdmin && currentAdminCount <= 1) {
      return NextResponse.json(
        {
          error:
            "Refusing to demote the last admin. Promote another user to admin first.",
        },
        { status: 409 },
      );
    }
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({ is_admin: targetIsAdmin })
    .eq("id", targetUserId);
  if (updErr) {
    return NextResponse.json(
      { error: `Could not update role: ${updErr.message}` },
      { status: 500 },
    );
  }

  // Audit trail — admin role changes are exactly the kind of action
  // we want a forensic record of. Record both the actor and the target.
  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: targetIsAdmin ? "admin.promoted" : "admin.demoted",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
      },
    });
  } catch (err) {
    console.error("[toggle-admin] audit log insert failed:", err);
  }

  return NextResponse.json({ ok: true, user_id: targetUserId, is_admin: targetIsAdmin });
}
