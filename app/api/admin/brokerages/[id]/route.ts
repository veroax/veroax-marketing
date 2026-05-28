// PATCH /api/admin/brokerages/[id]
//
// Site-admin only. Updates a brokerage's allocation, branding, or
// status. The detail page POSTs a partial body; only the keys
// present in the request are updated.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

type Body = {
  name?: string;
  dre_license?: string | null;
  logo_url?: string | null;
  brand_accent_hex?: string | null;
  contact_email?: string | null;
  agent_seat_limit?: number;
  reports_per_month?: number;
  per_report_overage_cents?: number;
  contract_notes?: string | null;
  status?: "active" | "paused" | "archived";
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  const body = (await request.json().catch(() => ({}))) as Body;

  // Only forward keys that were actually present in the request, so
  // an empty PATCH leaves the row untouched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (n) update.name = n;
  }
  if ("dre_license" in body)
    update.dre_license = body.dre_license?.toString().trim() || null;
  if ("logo_url" in body)
    update.logo_url = body.logo_url?.toString().trim() || null;
  if ("brand_accent_hex" in body)
    update.brand_accent_hex = body.brand_accent_hex?.toString().trim() || null;
  if ("contact_email" in body)
    update.contact_email =
      body.contact_email?.toString().trim().toLowerCase() || null;
  if (typeof body.agent_seat_limit === "number" && body.agent_seat_limit >= 0)
    update.agent_seat_limit = Math.floor(body.agent_seat_limit);
  if (
    typeof body.reports_per_month === "number" &&
    body.reports_per_month >= 0
  )
    update.reports_per_month = Math.floor(body.reports_per_month);
  if (
    typeof body.per_report_overage_cents === "number" &&
    body.per_report_overage_cents >= 0
  )
    update.per_report_overage_cents = Math.floor(body.per_report_overage_cents);
  if ("contract_notes" in body)
    update.contract_notes =
      body.contract_notes?.toString().trim() || null;
  if (
    body.status &&
    ["active", "paused", "archived"].includes(body.status)
  )
    update.status = body.status;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No fields to update." },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("brokerages")
    .update(update)
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to update brokerage." },
      { status: 500 },
    );
  }

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "brokerage.updated",
      metadata: {
        brokerage_id: id,
        fields_changed: Object.keys(update),
      },
    });
  } catch (err) {
    console.error("[admin/brokerages/update] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
