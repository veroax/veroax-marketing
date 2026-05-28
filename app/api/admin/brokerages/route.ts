// POST /api/admin/brokerages
//
// Site-admin only. Creates a new brokerage row with the requested
// allocation knobs. Logo + accent + owner-admin invite happen on the
// detail page once the row exists.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";

type Body = {
  name?: string;
  dre_license?: string | null;
  contact_email?: string | null;
  agent_seat_limit?: number;
  reports_per_month?: number;
  per_report_overage_cents?: number;
  contract_notes?: string | null;
};

export async function POST(request: Request) {
  // Site admin only. requireAdmin handles both the auth check + the
  // is_admin lookup in one call; the API route checks this because
  // the mutation can be hit without the layout having rendered.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  const body = (await request.json().catch(() => ({}))) as Body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "Brokerage name is required." },
      { status: 400 },
    );
  }

  // Slug: lowercase + dash-cased. Schema has unique constraint on
  // slug, so a duplicate gets a 409 below.
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const insertRow = {
    name,
    slug: slug || null,
    dre_license:
      typeof body.dre_license === "string" && body.dre_license.trim()
        ? body.dre_license.trim()
        : null,
    contact_email:
      typeof body.contact_email === "string" && body.contact_email.trim()
        ? body.contact_email.trim().toLowerCase()
        : null,
    agent_seat_limit:
      typeof body.agent_seat_limit === "number" && body.agent_seat_limit > 0
        ? Math.floor(body.agent_seat_limit)
        : 100,
    reports_per_month:
      typeof body.reports_per_month === "number" &&
      body.reports_per_month >= 0
        ? Math.floor(body.reports_per_month)
        : 100,
    per_report_overage_cents:
      typeof body.per_report_overage_cents === "number" &&
      body.per_report_overage_cents >= 0
        ? Math.floor(body.per_report_overage_cents)
        : 2500,
    contract_notes:
      typeof body.contract_notes === "string" && body.contract_notes.trim()
        ? body.contract_notes.trim()
        : null,
  };

  const { data: row, error } = await admin
    .from("brokerages")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !row) {
    if (error?.message?.includes("brokerages_slug_key")) {
      return NextResponse.json(
        {
          error: `A brokerage with that name already exists (slug collision: ${slug}). Use a more specific name.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error?.message ?? "Failed to create brokerage." },
      { status: 500 },
    );
  }

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "brokerage.created",
      metadata: {
        brokerage_id: (row as { id: string }).id,
        name,
        agent_seat_limit: insertRow.agent_seat_limit,
        reports_per_month: insertRow.reports_per_month,
        per_report_overage_cents: insertRow.per_report_overage_cents,
      },
    });
  } catch (err) {
    console.error("[admin/brokerages/create] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    id: (row as { id: string }).id,
  });
}
