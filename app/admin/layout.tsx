// Admin shell. Two gates: middleware authenticates the user, the layout
// then redirects non-admins back to /dashboard. The redirect on this
// layout is the canonical access check, individual page files inside
// /admin assume the layout has already gated.
//
// Visual chrome deliberately mirrors the dashboard's sidebar (so admins
// don't get disoriented switching contexts) but adds a bold "ADMIN"
// eyebrow so it's obvious which surface you're on. The sidebar uses a
// red accent for the eyebrow because admin actions on this section can
// span all users, destructive operations need visual heat.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "../(auth)/actions";

export const metadata = {
  title: "Admin, Veroax",
  // Cascades to every page under /admin. Admin surfaces should
  // never appear in any search index.
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
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

  // Defense-in-depth: every admin page additionally checks is_admin
  // via service-role queries when it needs cross-user data. The
  // layout-level redirect catches the bulk of bad navigations.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(
    (profile as { is_admin?: boolean } | null)?.is_admin,
  );
  if (!isAdmin) {
    redirect("/dashboard");
  }

  const displayName =
    (profile as { full_name?: string | null } | null)?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Admin";

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside
        className="w-60 shrink-0 hidden md:flex flex-col text-indigo-100"
        style={{
          background: "linear-gradient(180deg, #1e1b4b 0%, #0f0e2e 100%)",
        }}
      >
        <div className="px-6 h-16 flex items-center border-b border-white/5">
          <Link href="/admin" aria-label="Veroax admin">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/final/veroax-lockup-dark.svg"
              alt="Veroax"
              style={{ height: 26 }}
            />
          </Link>
        </div>
        <div className="px-6 pt-5 pb-2">
          <p className="text-[10px] font-bold tracking-widest text-red-400 uppercase">
            Admin
          </p>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1 text-sm">
          <NavLink href="/admin" label="Dashboard" />
          <NavLink href="/admin/tasks" label="Tasks" />
          <NavLink href="/admin/users" label="Users" />
          <NavLink href="/admin/brokerages" label="Brokerages" />
          <NavLink href="/admin/reports" label="All reports" />
          <NavLink href="/admin/free-credits" label="Free credits" />
          <NavLink href="/admin/alerts" label="Alert history" />
          <NavLink href="/admin/audit" label="Audit log" />
          <NavLink href="/admin/report-errors" label="Error inbox" />
          <NavLink href="/admin/finding-flags" label="Finding flags" />
          <NavLink href="/admin/regressions" label="Regressions" />
          <NavLink href="/admin/health" label="System health" />
          <NavLink href="/admin/integrations" label="Integrations" />
          <NavLink href="/admin/docs/billing-setup" label="Billing setup doc" />
        </nav>
        <div className="px-6 py-4 border-t border-white/5">
          <p className="text-[10px] font-bold tracking-widest text-indigo-300 uppercase mb-2">
            Back to app
          </p>
          <Link
            href="/dashboard"
            className="block text-indigo-100 hover:text-white text-sm transition-colors underline underline-offset-2"
          >
            ← Agent dashboard
          </Link>
        </div>
        <div className="px-6 py-4 border-t border-white/5">
          <p className="text-xs text-indigo-300 mb-1">Signed in as</p>
          <p className="text-sm text-white truncate">{displayName}</p>
          <p className="text-xs text-indigo-400 truncate">{user.email}</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="text-xs text-indigo-300 hover:text-white transition-colors underline underline-offset-2"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with a hamburger menu that mirrors the
            admin sidebar nav. Without this, mobile admins could not
            reach /admin/tasks, /admin/users, /admin/brokerages, etc.
            Uses <details>/<summary> so it stays server-only and no
            client state is needed; clicking a link navigates and the
            new page renders with the menu collapsed. */}
        <header className="md:hidden border-b border-slate-200 bg-white">
          <details className="group">
            <summary className="h-14 px-4 flex items-center justify-between list-none cursor-pointer [&::-webkit-details-marker]:hidden">
              <Link
                href="/admin"
                aria-label="Veroax admin"
                className="flex items-center gap-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/final/veroax-lockup-light.svg"
                  alt="Veroax"
                  style={{ height: 22 }}
                />
                <span className="text-[10px] font-bold uppercase tracking-widest bg-red-700 text-white px-1.5 py-0.5 rounded">
                  Admin
                </span>
              </Link>
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span aria-hidden="true" className="block group-open:hidden">
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
            <nav className="px-2 pb-3 pt-1 border-t border-slate-100 bg-white">
              <Link
                href="/admin"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/tasks"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Tasks
              </Link>
              <Link
                href="/admin/users"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Users
              </Link>
              <Link
                href="/admin/brokerages"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Brokerages
              </Link>
              <Link
                href="/admin/reports"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                All reports
              </Link>
              <Link
                href="/admin/free-credits"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Free credits
              </Link>
              <Link
                href="/admin/alerts"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Alert history
              </Link>
              <Link
                href="/admin/audit"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Audit log
              </Link>
              <Link
                href="/admin/report-errors"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Error inbox
              </Link>
              <Link
                href="/admin/finding-flags"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Finding flags
              </Link>
              <Link
                href="/admin/regressions"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Regressions
              </Link>
              <Link
                href="/admin/health"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                System health
              </Link>
              <Link
                href="/admin/integrations"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Integrations
              </Link>
              <Link
                href="/admin/docs/billing-setup"
                className="block px-3 py-2.5 rounded-lg text-sm text-slate-800 hover:bg-slate-100"
              >
                Billing setup doc
              </Link>
              <Link
                href="/dashboard"
                className="block mt-2 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100 border-t border-slate-200 pt-3"
              >
                ← Agent dashboard
              </Link>
              <form
                action={logoutAction}
                className="mt-2 border-t border-slate-200 pt-3"
              >
                <button
                  type="submit"
                  className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </form>
            </nav>
          </details>
        </header>

        {/* Admin-mode banner, narrow strip at the top of every admin
            page so an admin who lands here from a deep link knows
            they're in a privileged surface. */}
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-xs text-red-900 flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest uppercase bg-red-700 text-white px-1.5 py-0.5 rounded">
            Admin
          </span>
          <span>
            You're viewing data across ALL accounts. Actions taken here
            are audited.
          </span>
        </div>

        <main className="flex-1 px-6 py-8">
          <div className="max-w-6xl mx-auto">{children}</div>
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
