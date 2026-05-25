// POST /api/team/invite
//
// Send an email invite to add a new member to the current user's
// team. Requires the caller to be an owner or admin of the team.
//
// Body: { email: string, role?: 'admin' | 'agent' }
//
// Creates a row in team_invites with a random token, then emails
// the recipient a link to /invite/{token}. The link authenticates
// the invitee against the token (no Veroax account needed yet) and
// walks them through signup or sign-in.

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { newInviteToken } from "@/lib/team/membership";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    role?: string;
  };
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role: "admin" | "agent" = body.role === "admin" ? "admin" : "agent";

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();

  // Resolve the inviter's team + role.
  const { data: memberRow } = await admin
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  const member = memberRow as
    | { team_id: string; role: "owner" | "admin" | "agent" }
    | null;
  if (!member) {
    return NextResponse.json(
      { error: "You're not part of a team yet. Create one first." },
      { status: 409 },
    );
  }
  if (member.role !== "owner" && member.role !== "admin") {
    return NextResponse.json(
      { error: "Only team owners and admins can send invites." },
      { status: 403 },
    );
  }

  // Reject if the invitee is already a member of the same team or
  // any other team (one-team-per-user MVP).
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    const { data: alreadyMember } = await admin
      .from("team_members")
      .select("team_id")
      .eq("user_id", (existingProfile as { id: string }).id)
      .maybeSingle();
    if (
      alreadyMember &&
      (alreadyMember as { team_id: string }).team_id === member.team_id
    ) {
      return NextResponse.json(
        { error: "That user is already on your team." },
        { status: 409 },
      );
    }
    if (alreadyMember) {
      return NextResponse.json(
        {
          error:
            "That user is already a member of another team. They'd need to leave their current team first.",
        },
        { status: 409 },
      );
    }
  }

  // Generate a fresh token. Schema's partial-unique index on
  // (team_id, lower(email)) where status='pending' enforces single-
  // pending-invite-per-address.
  const token = newInviteToken();
  const { data: inviteRow, error: insErr } = await admin
    .from("team_invites")
    .insert({
      team_id: member.team_id,
      email,
      role,
      invited_by: user.id,
      token,
    })
    .select("id, token")
    .single();
  if (insErr || !inviteRow) {
    if (insErr?.message?.includes("team_invites_pending_unique")) {
      return NextResponse.json(
        {
          error:
            "There's already a pending invite for that email. Revoke it before sending a new one.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create invite." },
      { status: 500 },
    );
  }

  // Fetch the team name for the email body.
  const { data: teamRow } = await admin
    .from("teams")
    .select("name")
    .eq("id", member.team_id)
    .maybeSingle();
  const teamName =
    (teamRow as { name?: string } | null)?.name ?? "your team";
  const inviterName = user.email ?? "Your colleague";

  // Send the invite email via Resend. Failure here doesn't undo the
  // invite row; an admin can resend later.
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const fromAddress =
        process.env.SUPPORT_FROM_EMAIL || "Veroax <support@veroax.com>";
      const acceptUrl = `${SITE_URL}/invite/${token}`;
      await resend.emails.send({
        from: fromAddress,
        to: email,
        subject: `You're invited to join ${teamName} on Veroax`,
        html: `
          <p>${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(teamName)}</strong> on Veroax.</p>
          <p>Veroax is an AI-assisted disclosure analysis tool for California real estate agents. Joining ${escapeHtml(teamName)} gives you access to the team's shared report quota and lets the team owner see reports you generate.</p>
          <p><a href="${acceptUrl}" style="display:inline-block;background:#0F0E2E;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Accept invite</a></p>
          <p style="color:#888;font-size:12px;">Or paste this link into your browser: ${acceptUrl}</p>
          <p style="color:#888;font-size:12px;">This invite expires in 14 days. If you didn't expect this email, you can ignore it.</p>
        `,
      });
    } catch (err) {
      console.error("[team/invite] resend send failed:", err);
    }
  } else {
    console.warn("[team/invite] RESEND_API_KEY missing; invite was created but no email was sent.");
  }

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "team.invite_sent",
      metadata: {
        team_id: member.team_id,
        invitee_email_sha256_16: await emailHash(email),
        role,
      },
    });
  } catch (err) {
    console.error("[team/invite] audit insert failed:", err);
  }

  return NextResponse.json({
    ok: true,
    invite_id: (inviteRow as { id: string }).id,
  });
}

async function emailHash(email: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(email).digest("hex").slice(0, 16);
}
