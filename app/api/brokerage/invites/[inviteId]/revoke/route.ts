// POST /api/brokerage/invites/[inviteId]/revoke
//
// Brokerage admin revokes a pending invite under their brokerage.
// The invite's status flips to 'revoked'; the token can no longer
// be used to accept.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getCurrentUserBrokerageContext,
  isBrokerageAdmin,
} from "@/lib/brokerage/admin";

export async function POST(
  _request: Request,
  context: { params: Promise<{ inviteId: string }> },
) {
  const { inviteId } = await context.params;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const brokerageContext = await getCurrentUserBrokerageContext(
    supabase,
    user.id,
  );
  if (!isBrokerageAdmin(brokerageContext) || !brokerageContext) {
    return NextResponse.json(
      { error: "Brokerage admin access required." },
      { status: 403 },
    );
  }

  const admin = createServiceRoleClient();

  const { data: inviteRow } = await admin
    .from("brokerage_invites")
    .select("id, brokerage_id, email, status")
    .eq("id", inviteId)
    .maybeSingle();
  const invite = inviteRow as
    | {
        id: string;
        brokerage_id: string;
        email: string;
        status: "pending" | "accepted" | "expired" | "revoked";
      }
    | null;
  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  if (invite.brokerage_id !== brokerageContext.brokerage.id) {
    return NextResponse.json(
      { error: "That invite is not part of your brokerage." },
      { status: 404 },
    );
  }
  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: `Invite is already ${invite.status}.` },
      { status: 409 },
    );
  }

  await admin
    .from("brokerage_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId);

  try {
    await admin.from("audit_log").insert({
      user_id: user.id,
      event_type: "brokerage.invite_revoked",
      metadata: {
        invite_id: inviteId,
        brokerage_id: invite.brokerage_id,
        invitee_email: invite.email,
        actor_email: user.email ?? null,
      },
    });
  } catch (err) {
    console.error("[invite/revoke] audit insert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
