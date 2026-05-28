import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";
import { sendVipGrantEmail } from "@/lib/email/vipGrantEmail";

// POST /api/admin/toggle-vip
// Body: { user_id: string, is_vip: boolean, notes?: string }
//
// Promotes or demotes a user's VIP status. Admin-only. VIP users
// bypass the credit gate on report creation (free access), never
// get a watermark, and see "VIP, free access" on /dashboard/billing
// instead of credit pools.
//
// Audited as "vip.granted" or "vip.revoked" with the actor info
// + the optional notes the admin wrote.

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = await request.json().catch(() => ({}));
  const targetUserId =
    typeof body?.user_id === "string" ? body.user_id.trim() : "";
  const targetIsVip = Boolean(body?.is_vip);
  const notes =
    typeof body?.notes === "string" ? body.notes.trim() : null;
  if (!targetUserId) {
    return NextResponse.json(
      { error: "user_id is required." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const update: Record<string, unknown> = {
    is_vip: targetIsVip,
  };
  if (targetIsVip) {
    update.vip_granted_at = new Date().toISOString();
    update.vip_granted_by = user.id;
    update.vip_notes = notes;
  } else {
    // Revoke clears the audit fields too so a future re-grant gets a
    // fresh timestamp + notes. Keeps things honest.
    update.vip_granted_at = null;
    update.vip_granted_by = null;
    update.vip_notes = null;
  }
  const { error: updErr } = await admin
    .from("profiles")
    .update(update)
    .eq("id", targetUserId);
  if (updErr) {
    return NextResponse.json(
      { error: `Could not update VIP status: ${updErr.message}` },
      { status: 500 },
    );
  }

  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: targetIsVip ? "vip.granted" : "vip.revoked",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
        notes,
      },
    });
  } catch (err) {
    console.error("[toggle-vip] audit log insert failed:", err);
  }

  // VIP-grant email, fire only on grant (not on revoke per the
  // founder spec). Best-effort: failures are logged but never
  // bubble up to the API response. The admin already saw the
  // modal succeed and clicked away by the time this runs.
  if (targetIsVip) {
    try {
      const { data: recipient } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", targetUserId)
        .maybeSingle<{ email: string; full_name: string | null }>();
      const { data: adminProfile } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .maybeSingle<{ email: string; full_name: string | null }>();

      if (recipient?.email) {
        // Admin's email falls back to auth's user.email when the
        // profile row doesn't carry one, the auth row is the
        // source of truth and the profile mirror occasionally
        // lags.
        const adminEmailValue =
          adminProfile?.email ?? user.email ?? "support@veroax.com";
        const adminNameValue = adminProfile?.full_name ?? null;
        const sendResult = await sendVipGrantEmail({
          recipientEmail: recipient.email,
          recipientFullName: recipient.full_name ?? null,
          adminEmail: adminEmailValue,
          adminFullName: adminNameValue,
        });
        if (!sendResult.ok) {
          console.error(
            "[toggle-vip] VIP grant email send failed:",
            sendResult.error,
          );
        }
      } else {
        console.warn(
          "[toggle-vip] could not send VIP grant email, recipient profile has no email",
        );
      }
    } catch (err) {
      console.error("[toggle-vip] VIP grant email threw:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    user_id: targetUserId,
    is_vip: targetIsVip,
  });
}
