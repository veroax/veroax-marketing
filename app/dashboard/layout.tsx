// Authenticated app shell. Middleware enforces auth before this layout
// renders, but we double-check here as a defense-in-depth measure.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserBrokerageContext } from "@/lib/brokerage/admin";
import { SUPPORT } from "@/lib/site";
import { logoutAction } from "../(auth)/actions";
import { resolveDashboardViewer } from "@/lib/admin/impersonation";
import { ImpersonationBanner } from "./_components/ImpersonationBanner";

// Cascades to every page under /dashboard. Authenticated app
// surfaces should never appear in any search index.
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the profile row (created automatically by the on-signup trigger).
  // full_name, dre_license, and brokerage are all REQUIRED before a
  // report PDF will render, the dashboard nudges to /settings when
  // any are missing. is_admin gates the optional "Admin" link in the
  // sidebar.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, dre_license, brokerage, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const profileIncomplete =
    !profile?.full_name?.trim() ||
    !profile?.dre_license?.trim() ||
    !profile?.brokerage?.trim();
  const isAdmin = Boolean(
    (profile as { is_admin?: boolean } | null)?.is_admin,
  );

  // The Brokerage nav link appears only for users with a brokerage
  // relationship (admin role, direct agent, or via a team under the
  // brokerage). Solo agents and team-only users do not see it.
  const brokerageContext = await getCurrentUserBrokerageContext(
    supabase,
    user.id,
  );
  const showBrokerageLink = brokerageContext !== null;

  const displayName =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "Agent";

  // Admin impersonation: when the cookie is set AND the actual user
  // is an admin, the banner renders + read queries on subsequent
  // pages scope to the impersonated user_id. The actual auth
  // session stays put, write paths remain scoped to the admin.
  const viewer = await resolveDashboardViewer({
    actualUserId: user.id,
    isAdmin,
  });

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside
        className="w-60 shrink-0 hidden md:flex flex-col text-indigo-100"
        style={{ background: "linear-gradient(180deg, #1e1b4b 0%, #0f0e2e 100%)" }}
      >
        <div className="px-6 h-16 flex items-center border-b border-white/5">
          <Link href="/dashboard" aria-label="Veroax">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/final/veroax-lockup-dark.svg"
              alt="Veroax"
              style={{ height: 26 }}
            />
          </Link>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1 text-sm">
          <NavLink href="/dashboard" label="Reports" />
          <NavLink href="/dashboard/upload" label="New report" />
          <NavLink href="/dashboard/archive" label="Archive" />
          <NavLink href="/dashboard/team" label="Team" />
          {showBrokerageLink ? (
            <NavLink href="/dashboard/brokerage" label="Brokerage" />
          ) : null}
          <NavLink href="/dashboard/billing" label="Billing" />
          <NavLink href="/dashboard/settings" label="Settings" />
          {/* Admin link, visible only when profiles.is_admin = true.
              Rendered with a red accent + caps badge so it's
              visually obvious you're crossing into a privileged
              surface. */}
          {isAdmin ? (
            <Link
              href="/admin"
              className="flex items-center justify-between px-3 py-2 rounded-lg text-indigo-100 hover:bg-white/5 hover:text-white transition-colors mt-4 border-t border-white/10 pt-4"
            >
              <span>Admin</span>
              <span className="text-[9px] font-bold tracking-widest uppercase bg-red-700 text-white px-1.5 py-0.5 rounded">
                Admin
              </span>
            </Link>
          ) : null}
        </nav>
        {/* Support contact block, sits just above the signed-in
            chrome so it's visible without scrolling, but doesn't
            shout for attention. Both lines are clickable: phone
            opens the OS dialer / FaceTime / etc. via tel:, email
            opens the default mail client via mailto:. */}
        <div className="px-6 py-4 border-t border-white/5 text-xs">
          <p className="text-indigo-200 font-semibold tracking-widest uppercase text-[10px] mb-2">
            Need help?
          </p>
          <a
            href={`tel:${SUPPORT.phoneTel}`}
            className="block text-indigo-100 hover:text-white transition-colors"
          >
            {SUPPORT.phone}
          </a>
          <a
            href={`mailto:${SUPPORT.email}`}
            className="block text-indigo-100 hover:text-white transition-colors underline underline-offset-2 truncate"
          >
            {SUPPORT.email}
          </a>
          <a
            href="/feedback"
            className="block text-amber-300 hover:text-amber-200 transition-colors mt-2"
          >
            Send feedback →
          </a>
          {/* Legal links. Muted so they sit quietly under the
              primary support contacts but still reachable from
              every authenticated page without having to bounce
              back to the marketing footer. */}
          <p className="mt-3 text-[10px] text-indigo-300">
            <Link
              href="/terms"
              className="hover:text-white transition-colors"
            >
              Terms
            </Link>
            <span className="mx-1.5 text-indigo-500">·</span>
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              Privacy
            </Link>
          </p>
        </div>
        <div className="px-6 py-4 border-t border-white/5">
          <p className="text-xs text-indigo-200 mb-1">Signed in as</p>
          <p className="text-sm text-white truncate">{displayName}</p>
          <p className="text-xs text-indigo-400 truncate">{user.email}</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="text-xs text-indigo-200 hover:text-white transition-colors underline underline-offset-2"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with a hamburger-menu reveal that mirrors
            the desktop sidebar nav. Uses <details>/<summary> so we
            stay server-only and don't need client state: clicking a
            link inside navigates away which collapses the menu
            implicitly. The same nav links and the Admin link that
            appear in the sidebar appear here on mobile. */}
        <header className="md:hidden border-b border-slate-200 bg-white">
          <details className="group">
            <summary className="h-14 px-4 flex items-center justify-between list-none cursor-pointer [&::-webkit-details-marker]:hidden">
              <Link href="/dashboard" aria-label="Veroax">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/final/veroax-lockup-light.svg"
                  alt="Veroax"
                  style={{ height: 22 }}
                />
              </Link>
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span aria-hidden="true" className="block group-open:hidden">
                  {/* Hamburger icon */}
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </span>
                <span aria-hidden="true" className="hidden group-open:block">
                  {/* X icon */}
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </span>
                <span className="block group-open:hidden">Menu</span>
                <span className="hidden group-open:block">Close</span>
              </span>
            </summary>

            {/* Menu panel. Drops in below the header bar; same link
                inventory as the desktop sidebar. Admin gets the same
                red accent badge so the visual signal carries across
                surfaces. */}
            <nav className="px-2 pb-3 pt-1 border-t border-slate-100 bg-white">
              <Link
                href="/dashboard"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Reports
              </Link>
              <Link
                href="/dashboard/upload"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                New report
              </Link>
              <Link
                href="/dashboard/archive"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Archive
              </Link>
              <Link
                href="/dashboard/team"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Team
              </Link>
              {showBrokerageLink ? (
                <Link
                  href="/dashboard/brokerage"
                  className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
                >
                  Brokerage
                </Link>
              ) : null}
              <Link
                href="/dashboard/billing"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Billing
              </Link>
              <Link
                href="/dashboard/settings"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Settings
              </Link>
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="flex items-center justify-between mt-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-900 hover:bg-slate-100 border-t border-slate-200 pt-3"
                >
                  <span>Admin</span>
                  <span className="text-[9px] font-bold tracking-widest uppercase bg-red-700 text-white px-1.5 py-0.5 rounded">
                    Admin
                  </span>
                </Link>
              ) : null}
              <form action={logoutAction} className="mt-2 border-t border-slate-200 pt-3">
                <button
                  type="submit"
                  className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </form>
            </nav>
          </details>

          {/* Support contact row stays below the (collapsed or open)
              menu so phone + email are always one tap away on
              mobile, regardless of menu state. */}
          <div className="px-4 pb-2 flex items-center gap-3 text-[11px] text-slate-600 border-t border-slate-100 pt-2">
            <a
              href={`tel:${SUPPORT.phoneTel}`}
              className="hover:text-slate-900"
              aria-label={`Call Veroax support at ${SUPPORT.phone}`}
            >
              {SUPPORT.phone}
            </a>
            <span className="text-slate-300">·</span>
            <a
              href={`mailto:${SUPPORT.email}`}
              className="hover:text-slate-900 underline underline-offset-2"
            >
              {SUPPORT.email}
            </a>
            <span className="text-slate-300">·</span>
            <Link
              href="/feedback"
              className="text-amber-700 hover:text-amber-900"
            >
              Feedback
            </Link>
            <span className="text-slate-300">·</span>
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <span className="text-slate-300">·</span>
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
          </div>
        </header>

        {/* Admin impersonation banner. Renders ONLY when an admin
            has triggered "View as user" from /admin/users/<id>. The
            banner is intentionally loud so the admin can never
            mistake the impersonated session for their own. */}
        {viewer.impersonating && viewer.impersonatedProfile ? (
          <ImpersonationBanner
            fullName={viewer.impersonatedProfile.full_name}
            email={viewer.impersonatedProfile.email}
          />
        ) : null}

        {/* Profile-completion banner, hard requirement now: reports
            won't download until name + DRE + brokerage are all set. */}
        {profileIncomplete && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-sm text-amber-900 flex items-center justify-between gap-4">
            <span>
              Add your name, DRE license, and brokerage before downloading
              reports. These print on every PDF cover.
            </span>
            <Link
              href="/dashboard/settings"
              className="text-amber-900 font-semibold underline underline-offset-2 whitespace-nowrap"
            >
              Add details →
            </Link>
          </div>
        )}

        <main className="flex-1 px-6 py-8">
          <div className="max-w-5xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-lg text-indigo-100 hover:bg-white/5 hover:text-white transition-colors"
    >
      {label}
    </Link>
  );
}
