import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";

// POST /api/admin/grant-credits/[userId]
// Body: { count: number, type: "trial" | "oneoff", notes?: string }
//
// Admin-only. Grants N credits to a user's account:
//   - type="trial" increments profiles.trial_credits_remaining
//     (reports produced will be watermarked SAMPLE — VEROAX TRIAL)
//   - type="oneoff" increments profiles.report_credits_balance
//     (full-quality reports, don't expire)
//
// Writes a report_credit_ledger entry with reason="admin_grant"
// so the agent sees the credit on /dashboard/billing.

const MAX_GRANT_AT_ONCE = 1000;

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: targetUserId } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = await request.json().catch(() => ({}));
  const rawCount = Number(body?.count);
  const type = body?.type;
  const notes =
    typeof body?.notes === "string" ? body.notes.trim() : null;

  if (!targetUserId) {
    return NextResponse.json(
      { error: "userId is required." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(rawCount) || rawCount <= 0) {
    return NextResponse.json(
      { error: "count must be a positive integer." },
      { status: 400 },
    );
  }
  if (rawCount > MAX_GRANT_AT_ONCE) {
    return NextResponse.json(
      { error: `Won't grant more than ${MAX_GRANT_AT_ONCE} at a time.` },
      { status: 400 },
    );
  }
  if (type !== "trial" && type !== "oneoff") {
    return NextResponse.json(
      { error: 'type must be "trial" or "oneoff".' },
      { status: 400 },
    );
  }
  const count = Math.floor(rawCount);

  const admin = createServiceRoleClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, trial_credits_remaining, report_credits_balance, email")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const t = target as {
    trial_credits_remaining?: number;
    report_credits_balance?: number;
    email?: string;
  };
  const currentTrial = t.trial_credits_remaining ?? 0;
  const currentOneoff = t.report_credits_balance ?? 0;

  // Update the right column atomically per request.
  if (type === "trial") {
    await admin
      .from("profiles")
      .update({ trial_credits_remaining: currentTrial + count })
      .eq("id", targetUserId);
  } else {
    await admin
      .from("profiles")
      .update({ report_credits_balance: currentOneoff + count })
      .eq("id", targetUserId);
  }

  // Ledger row — the agent's billing dashboard shows this with the
  // "Grant" pill, including the notes for transparency. (Notes are
  // visible to the recipient — they need to know what they're being
  // granted and why.)
  await admin.from("report_credit_ledger").insert({
    user_id: targetUserId,
    amount: count,
    reason: "admin_grant",
    metadata: {
      type,
      notes,
      actor_user_id: user.id,
      actor_email: user.email,
    },
  });

  // Audit log for the admin-side trail.
  try {
    await admin.from("audit_log").insert({
      user_id: targetUserId,
      event_type: "credits.granted_by_admin",
      metadata: {
        actor_user_id: user.id,
        actor_email: user.email,
        count,
        type,
        notes,
      },
    });
  } catch (err) {
    console.error("[grant-credits] audit log insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    user_id: targetUserId,
    type,
    count,
    new_balance:
      type === "trial" ? currentTrial + count : currentOneoff + count,
  });
}
