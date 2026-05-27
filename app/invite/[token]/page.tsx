// /invite/[token], invite acceptance landing page.
//
// Branches by auth state:
//   1. Not signed in: tell them what the invite is for, send them
//      to /signup or /login with next set back here.
//   2. Signed in, signed-in email matches invite email: show the
//      accept button.
//   3. Signed in, wrong email: tell them to sign in with the
//      invited email.
//   4. Already a team member: tell them they need to leave their
//      current team first.
//   5. Invite expired / revoked / accepted: error message.

import Link from "next/link";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { AcceptInviteButton } from "./_components/AcceptInviteButton";

type Params = Promise<{ token: string }>;

export const metadata = {
  title: "Team invite, Veroax",
  robots: { index: false, follow: false },
};

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;

  // Look up the invite via service-role (the visitor may not have a
  // session yet, so RLS would block them otherwise).
  const admin = createServiceRoleClient();
  const { data: inviteRow } = await admin
    .from("team_invites")
    .select("id, team_id, email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  const invite = inviteRow as
    | {
        id: string;
        team_id: string;
        email: string;
        role: "admin" | "agent";
        status: "pending" | "accepted" | "expired" | "revoked";
        expires_at: string;
      }
    | null;

  if (!invite) {
    return (
      <InviteFrame title="Invite not found">
        <p>
          That invite link is not valid. Ask whoever invited you to
          send a fresh one, or sign in to your existing account at{" "}
          <Link href="/login" className="text-indigo-700 underline">
            /login
          </Link>
          .
        </p>
      </InviteFrame>
    );
  }

  // Fetch team name for display.
  const { data: teamRow } = await admin
    .from("teams")
    .select("name")
    .eq("id", invite.team_id)
    .maybeSingle();
  const teamName = (teamRow as { name?: string } | null)?.name ?? "a team";

  // Lifecycle states.
  if (invite.status === "accepted") {
    return (
      <InviteFrame title={`Already accepted`}>
        <p>
          This invite to <strong>{teamName}</strong> was already accepted.
          Sign in to your account at{" "}
          <Link href="/login" className="text-indigo-700 underline">
            /login
          </Link>{" "}
          to see your team.
        </p>
      </InviteFrame>
    );
  }
  if (invite.status === "revoked") {
    return (
      <InviteFrame title="Invite revoked">
        <p>
          This invite to <strong>{teamName}</strong> was revoked by a
          team admin. Ask them to send a new one if you should still
          have access.
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
          This invite to <strong>{teamName}</strong> has expired. Ask
          the team admin who invited you to send a new one.
        </p>
      </InviteFrame>
    );
  }

  // Now check the current user's auth state.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in: route them to signup/login with next set.
  if (!user) {
    const next = `/invite/${token}`;
    return (
      <InviteFrame title={`Join ${teamName} on Veroax`}>
        <p>
          You have been invited to join <strong>{teamName}</strong> on
          Veroax as a <span className="capitalize">{invite.role}</span>.
        </p>
        <p className="mt-3">
          To accept, sign in or create your Veroax account. Make sure
          you use the email this invite was sent to:{" "}
          <strong>{invite.email}</strong>.
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

  // Signed in but wrong email.
  if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <InviteFrame title="Sign in as the invited email">
        <p>
          This invite was sent to <strong>{invite.email}</strong>, but
          you&apos;re signed in as <strong>{user.email}</strong>. Sign
          out and sign in with the invited email to accept.
        </p>
        <p className="text-sm text-slate-500 mt-3">
          Or ask the team admin to send a new invite to{" "}
          <strong>{user.email}</strong>.
        </p>
      </InviteFrame>
    );
  }

  // Already in a team.
  const { data: existingMember } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingMember) {
    return (
      <InviteFrame title="Already on a team">
        <p>
          You&apos;re already a member of another Veroax team. Leave
          that team first (from{" "}
          <Link
            href="/dashboard/team"
            className="text-indigo-700 underline"
          >
            /dashboard/team
          </Link>
          ) before accepting this invite.
        </p>
      </InviteFrame>
    );
  }

  // Happy path: signed in, right email, no existing team. Show the
  // accept button (client component handles the POST).
  return (
    <InviteFrame title={`Join ${teamName}`}>
      <p>
        You&apos;re about to join <strong>{teamName}</strong> on Veroax
        as a <span className="capitalize">{invite.role}</span>. The
        team&apos;s owner will be able to see reports you create.
      </p>
      <AcceptInviteButton token={token} orgName={teamName} />
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
          <p className="text-indigo-200 text-sm mt-2">Team invite</p>
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
