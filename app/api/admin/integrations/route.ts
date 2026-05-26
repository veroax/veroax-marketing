// POST /api/admin/integrations
//
// Site-admin-only mutation against the public.site_config singleton.
// Used by /admin/integrations to save the GA4 Measurement ID and any
// optional notes. Invalidates the in-memory siteConfig cache on
// success so the change becomes visible on the next layout render.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { invalidateSiteConfigCache, normalizeGaId } from "@/lib/siteConfig";

const SITE_CONFIG_ID = "00000000-0000-0000-0000-000000000001";

type Body = {
  google_analytics_id?: string | null;
  notes?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  // Gate: site admin only. Layout-level checks back this up, but
  // mutation endpoints always re-verify.
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!(callerProfile as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json(
      { error: "Site admin access required." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;

  // Validate the GA ID shape. Null is allowed (means analytics off);
  // any non-null value must match the GA4 / UA pattern.
  let gaId: string | null = null;
  if (typeof body.google_analytics_id === "string" && body.google_analytics_id.trim()) {
    gaId = normalizeGaId(body.google_analytics_id);
    if (!gaId) {
      return NextResponse.json(
        {
          error:
            "GA Measurement ID doesn't look right. Expected G-XXXXXXXXXX (find it in your GA4 property under Data Streams).",
        },
        { status: 400 },
      );
    }
  }

  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim().slice(0, 2000)
      : null;

  const { error: updateErr } = await admin
    .from("site_config")
    .update({
      google_analytics_id: gaId,
      notes,
      updated_by: user.id,
    })
    .eq("id", SITE_CONFIG_ID);

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message ?? "Failed to save settings." },
      { status: 500 },
    );
  }

  // Bust the in-memory cache so the next layout render sees the new
  // GA ID immediately (rather than waiting up to 60s for the TTL).
  invalidateSiteConfigCache();

  // Audit so we know who toggled analytics.
  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "site_config.updated",
      metadata: {
        google_analytics_id_set: gaId !== null,
        notes_set: notes !== null,
      },
    });
  } catch (err) {
    console.error("[admin/integrations] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
