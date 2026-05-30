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
import { sendTransactional } from "@/lib/email/sender";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { newInviteToken } from "@/lib/team/membership";
import {
  renderEmailLayout,
  plainTextSupportFooter,
  escapeHtml as escapeHtmlShared,
} from "@/lib/email/layout";

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

  // Fetch the team name and the inviter's friendly name for the
  // email body. Falls back to email when no full_name profile field
  // is set on the inviter.
  const { data: teamRow } = await admin
    .from("teams")
    .select("name")
    .eq("id", member.team_id)
    .maybeSingle();
  const teamName =
    (teamRow as { name?: string } | null)?.name ?? "your team";

  let inviterFriendlyName = user.email ?? "Your colleague";
  try {
    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const inviterFullName =
      (inviterProfile as { full_name?: string | null } | null)?.full_name ??
      null;
    if (inviterFullName && inviterFullName.trim().length > 0) {
      inviterFriendlyName = inviterFullName.trim();
    }
  } catch {
    // best-effort; inviter friendly name falls back to email
  }

  // Send the invite email via Resend. Failure here doesn't undo the
  // invite row; an admin can resend later. sendTransactional swallows
  // both API-level errors and missing-key conditions internally.
  const acceptUrl = `${SITE_URL}/invite/${token}`;
  const safeInviter = escapeHtmlShared(inviterFriendlyName);
  const safeTeamName = escapeHtmlShared(teamName);
  const bodyHtml = `
                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  Hi there,
                </p>
                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  <strong>${safeInviter}</strong> invited you to join
                  <strong>${safeTeamName}</strong> on Veroax.
                </p>
                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1e293b;">
                  Veroax is an AI-assisted disclosure analysis tool for
                  California real estate agents. Joining ${safeTeamName}
                  gives you access to the team's shared report quota and
                  lets the team owner see the reports you generate.
                </p>
                <p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#64748b;">
                  Or paste this link into your browser:
                  <br />
                  <a href="${acceptUrl}" style="color:#4f46e5;text-decoration:underline;word-break:break-all;">${acceptUrl}</a>
                </p>
                <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#64748b;">
                  This invite expires in 14 days. If you didn't expect
                  this email, you can ignore it safely.
                </p>`;
  const html = renderEmailLayout({
    eyebrow: "Veroax · Invitation",
    headline: `Join ${teamName} on Veroax`,
    documentTitle: `You're invited to join ${teamName} on Veroax`,
    bodyHtml,
    ctaText: "Accept invite",
    ctaUrl: acceptUrl,
    reasonReceiving:
      `You're receiving this because ${inviterFriendlyName} sent you an invite at`,
  });
  const text = [
    `Hi there,`,
    "",
    `${inviterFriendlyName} invited you to join ${teamName} on Veroax.`,
    "",
    "Veroax is an AI-assisted disclosure analysis tool for California real",
    `estate agents. Joining ${teamName} gives you access to the team's`,
    "shared report quota and lets the team owner see the reports you generate.",
    "",
    `Accept invite: ${acceptUrl}`,
    "",
    "This invite expires in 14 days. If you didn't expect this email, you",
    "can ignore it safely.",
    "",
    plainTextSupportFooter(),
  ].join("\n");
  const inviteResult = await sendTransactional({
    to: email,
    subject: `You're invited to join ${teamName} on Veroax`,
    text,
    html,
  });
  if (inviteResult.skipped) {
    console.warn(
      "[team/invite] RESEND_API_KEY missing; invite was created but no email was sent.",
    );
  } else if (!inviteResult.ok) {
    console.error("[team/invite] resend send failed:", inviteResult.error);
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
