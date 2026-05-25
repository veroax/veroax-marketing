// /invite/brokerage/[token] — brokerage invite acceptance landing.
//
// Mirrors /invite/[token] (team invite) but joins the user to a
// brokerage as either:
//   - owner / admin: row in brokerage_admins
//   - agent with team_id: row in team_members under the target team
//   - agent without team_id: row in brokerage_agents (direct agent)

import Link from "next/link";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { AcceptBrokerageInviteButton } from "./_components/AcceptBrokerageInviteButton";

type Params = Promise<{ token: string }>;

export const metadata = {
  title: "Brokerage invite, Veroax",
  robots: { index: false, follow: false },
};

export default async function BrokerageInvitePage({
  params,
}: {
  params: Params;
}) {
  const { token } = await params;

  const admin = createServiceRoleClient();
  const { data: inviteRow } = await admin
    .from("brokerage_invites")
    .select("id, brokerage_id, email, role, team_id, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  const invite = inviteRow as
    | {
        id: string;
        brokerage_id: string;
        email: string;
        role: "owner" | "admin" | "agent";
        team_id: string | null;
        status: "pending" | "accepted" | "expired" | "revoked";
        expires_at: string;
      }
    | null;

  if (!invite) {
    return (
      <InviteFrame title="Invite not found">
        <p>
          That invite link is not valid. Ask whoever invited you to
          send a fresh one, or sign in at{" "}
          <Link href="/login" className="text-indigo-700 underline">
            /login
          </Link>
          .
        </p>
      </InviteFrame>
    );
  }

  const { data: brokerageRow } = await admin
    .from("brokerages")
    .select("name")
    .eq("id", invite.brokerage_id)
    .maybeSingle();
  const brokerageName =
    (brokerageRow as { name?: string } | null)?.name ?? "a brokerage";

  if (invite.status === "accepted") {
    return (
      <InviteFrame title="Already accepted">
        <p>
          This invite to <strong>{brokerageName}</strong> was already
          accepted. Sign in at{" "}
          <Link href="/login" className="text-indigo-700 underline">
            /login
          </Link>{" "}
          to see your brokerage.
        </p>
      </InviteFrame>
    );
  }
  if (invite.status === "revoked") {
    return (
      <InviteFrame title="Invite revoked">
        <p>
          This invite to <strong>{brokerageName}</strong> was revoked.
          Ask the brokerage admin to send a new one if you should
          still have access.
        </p>
      </InviteFrame>
    );
  }
  if (
    invite.status === "expired" ||
    new Date(invite.expires_at).getTime() < Date.now()
  ) {
    return (
      <InviteFrame title="Invite expired">
        <p>
          This invite to <strong>{brokerageName}</strong> has expired.
          Ask the brokerage admin to send a new one.
        </p>
      </InviteFrame>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/invite/brokerage/${token}`;
    return (
      <InviteFrame title={`Join ${brokerageName}`}>
        <p>
          You&apos;ve been invited to join <strong>{brokerageName}</strong>{" "}
          on Veroax as a{" "}
          <span className="capitalize">{invite.role}</span>.
        </p>
        <p className="mt-3">
          To accept, sign in or create your account with the email this
          invite was sent to: <strong>{invite.email}</strong>.
        </p>
        <div className="flex gap-3 mt-5 flex-wrap">
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="bg-indigo-700 text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-indigo-600"
          >
            Create an account
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="bg-white border border-slate-300 text-slate-900 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-slate-50"
          >
            Sign in
          </Link>
        </div>
      </InviteFrame>
    );
  }

  if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <InviteFrame title="Sign in as the invited email">
        <p>
          This invite was sent to <strong>{invite.email}</strong>, but
          you&apos;re signed in as <strong>{user.email}</strong>. Sign
          out and back in with the invited email to accept.
        </p>
      </InviteFrame>
    );
  }

  return (
    <InviteFrame title={`Join ${brokerageName}`}>
      <p>
        You&apos;re about to join <strong>{brokerageName}</strong> on
        Veroax as a <span className="capitalize">{invite.role}</span>
        {invite.role === "agent" && invite.team_id ? " on a team" : ""}.
      </p>
      <AcceptBrokerageInviteButton
        token={token}
        brokerageName={brokerageName}
        role={invite.role}
      />
    </InviteFrame>
  );
}

function InviteFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 px-6 py-16">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/" aria-label="Veroax">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/final/veroax-lockup-dark.svg"
              alt="Veroax"
              style={{ height: 30 }}
              className="inline-block"
            />
          </Link>
          <p className="text-indigo-200 text-sm mt-2">Brokerage invite</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <div className="text-sm text-slate-700 leading-relaxed mt-3 space-y-2">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
