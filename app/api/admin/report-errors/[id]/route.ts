import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";

// PATCH /api/admin/report-errors/[id]
// Body: {
//   action: "grant_credit" | "acknowledge" | "dismiss",
//   credit_count?: number,   // for grant_credit, defaults to 1
//   admin_notes?: string,
// }
//
// Admin-only. Updates the submission's status and (for grant_credit)
// adds N credits to the submitter's profiles.report_credits_balance,
// writing a corresponding admin_grant entry on the credit ledger
// linked back to the submission.

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const adminNotes =
    typeof body?.admin_notes === "string" ? body.admin_notes.trim() : null;

  const admin = createServiceRoleClient();
  const { data: submission } = await admin
    .from("report_error_submissions")
    .select("id, user_id, email, report_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!submission) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (action === "acknowledge") {
    await admin
      .from("report_error_submissions")
      .update({ status: "acknowledged", admin_notes: adminNotes })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "acknowledged" });
  }

  if (action === "dismiss") {
    await admin
      .from("report_error_submissions")
      .update({ status: "dismissed", admin_notes: adminNotes })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  if (action === "grant_credit") {
    const count = Math.max(1, Math.min(20, Number(body?.credit_count) || 1));

    // Resolve the target user. If the submission has user_id, use it.
    // Otherwise look up by email so anonymous public-form submissions
    // can still receive a credit when the email matches a known account.
    let targetUserId: string | null =
      (submission as { user_id?: string | null }).user_id ?? null;
    if (!targetUserId) {
      const { data: maybeProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("email", (submission as { email: string }).email)
        .maybeSingle();
      targetUserId = (maybeProfile as { id?: string } | null)?.id ?? null;
    }
    if (!targetUserId) {
      return NextResponse.json(
        {
          error:
            "Submitter email doesn't match a Veroax account, can't grant a credit. Acknowledge or dismiss instead.",
        },
        { status: 409 },
      );
    }

    // Increment profile balance + write a ledger row.
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("report_credits_balance")
      .eq("id", targetUserId)
      .maybeSingle();
    const current =
      (targetProfile as { report_credits_balance?: number } | null)
        ?.report_credits_balance ?? 0;
    await admin
      .from("profiles")
      .update({ report_credits_balance: current + count })
      .eq("id", targetUserId);

    const { data: ledger } = await admin
      .from("report_credit_ledger")
      .insert({
        user_id: targetUserId,
        amount: count,
        reason: "admin_refund",
        report_id:
          (submission as { report_id?: string | null }).report_id ?? null,
        metadata: {
          submission_id: id,
          actor_user_id: user.id,
          actor_email: user.email,
          admin_notes: adminNotes,
        },
      })
      .select("id")
      .single();

    await admin
      .from("report_error_submissions")
      .update({
        status: "credit_granted",
        admin_notes: adminNotes,
        credit_ledger_id: (ledger as { id?: string } | null)?.id ?? null,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      status: "credit_granted",
      credits_granted: count,
      target_user_id: targetUserId,
    });
  }

  return NextResponse.json(
    { error: "Unknown action. Use grant_credit / acknowledge / dismiss." },
    { status: 400 },
  );
}
