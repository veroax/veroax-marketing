// POST /api/admin/brokerages/[id]/invite
//
// Site-admin issues a brokerage-level invite. Email-only; the recipient
// clicks the link, signs in/signs up, and the accept route attaches
// them to brokerage_admins or brokerage_agents depending on role.
//
// Body: { email: string, role: 'owner' | 'admin' | 'agent', team_id?: string | null }
//
// For role='agent', team_id can target an existing team under this
// brokerage; null means direct brokerage agent (no team).

import { NextResponse } from "next/server";
import { sendTransactional } from "@/lib/email/sender";
import { requireAdmin } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { newInviteToken } from "@/lib/team/membership";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: brokerageId } = await context.params;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const admin = createServiceRoleClient();

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    role?: string;
    team_id?: string | null;
  };
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role =
    body.role === "owner" || body.role === "admin" ? body.role : "agent";
  const teamId =
    typeof body.team_id === "string" && body.team_id ? body.team_id : null;

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  // Verify brokerage exists + grab its name for the email.
  const { data: brokerageRow } = await admin
    .from("brokerages")
    .select("id, name, status")
    .eq("id", brokerageId)
    .maybeSingle();
  const brokerage = brokerageRow as
    | { id: string; name: string; status: string }
    | null;
  if (!brokerage) {
    return NextResponse.json(
      { error: "Brokerage not found." },
      { status: 404 },
    );
  }
  if (brokerage.status !== "active") {
    return NextResponse.json(
      {
        error: `Cannot invite while brokerage is ${brokerage.status}. Reactivate first.`,
      },
      { status: 409 },
    );
  }

  // If team_id is set, validate it belongs to this brokerage.
  if (teamId) {
    const { data: teamRow } = await admin
      .from("teams")
      .select("id, brokerage_id")
      .eq("id", teamId)
      .maybeSingle();
    const team = teamRow as
      | { id: string; brokerage_id: string | null }
      | null;
    if (!team || team.brokerage_id !== brokerageId) {
      return NextResponse.json(
        { error: "That team is not in this brokerage." },
        { status: 400 },
      );
    }
  }

  const token = newInviteToken();
  const { data: inviteRow, error: insErr } = await admin
    .from("brokerage_invites")
    .insert({
      brokerage_id: brokerageId,
      email,
      role,
      team_id: teamId,
      invited_by: user.id,
      token,
    })
    .select("id, token")
    .single();
  if (insErr || !inviteRow) {
    if (insErr?.message?.includes("brokerage_invites_pending_unique")) {
      return NextResponse.json(
        {
          error:
            "There's already a pending invite for that email on this brokerage. Revoke it before sending a new one.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create invite." },
      { status: 500 },
    );
  }

  // Send the email. The invite row is already created, so a send
  // failure (or a missing RESEND_API_KEY in dev) is logged but does
  // not block the admin's request.
  const acceptUrl = `${SITE_URL}/invite/brokerage/${token}`;
  const inviteResult = await sendTransactional({
    to: email,
    subject: `Invitation to join ${brokerage.name} on Veroax`,
    html: `
          <p>You've been invited to join <strong>${escapeHtml(brokerage.name)}</strong> on Veroax as <strong>${escapeHtml(role)}</strong>.</p>
          <p>Veroax is an AI-assisted disclosure analysis tool for California real estate agents. Joining ${escapeHtml(brokerage.name)} gives you access to the brokerage's shared report quota and unified branding.</p>
          <p><a href="${acceptUrl}" style="display:inline-block;background:#0F0E2E;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Accept invitation</a></p>
          <p style="color:#888;font-size:12px;">Or paste this link into your browser: ${acceptUrl}</p>
          <p style="color:#888;font-size:12px;">This invite expires in 14 days.</p>
        `,
  });
  if (inviteResult.skipped) {
    console.warn(
      "[admin/brokerages/invite] RESEND_API_KEY missing; invite row was created but no email sent.",
    );
  } else if (!inviteResult.ok) {
    console.error(
      "[admin/brokerages/invite] resend send failed:",
      inviteResult.error,
    );
  }

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "brokerage.invite_sent",
      metadata: {
        brokerage_id: brokerageId,
        role,
        team_id: teamId,
      },
    });
  } catch (err) {
    console.error("[admin/brokerages/invite] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    invite_id: (inviteRow as { id: string }).id,
  });
}
