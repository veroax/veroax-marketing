// Admin shell. Two gates: middleware authenticates the user, the layout
// then redirects non-admins back to /dashboard. The redirect on this
// layout is the canonical access check — individual page files inside
// /admin assume the layout has already gated.
//
// Visual chrome deliberately mirrors the dashboard's sidebar (so admins
// don't get disoriented switching contexts) but adds a bold "ADMIN"
// eyebrow so it's obvious which surface you're on. The sidebar uses a
// red accent for the eyebrow because admin actions on this section can
// span all users — destructive operations need visual heat.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "../(auth)/actions";

export const metadata = {
  title: "Admin — Veroax",
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
          <Link
            href="/admin"
            className="text-white font-bold text-lg tracking-tight"
          >
            Veroax
          </Link>
        </div>
        <div className="px-6 pt-5 pb-2">
          <p className="text-[10px] font-bold tracking-widest text-red-400 uppercase">
            Admin
          </p>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1 text-sm">
          <NavLink href="/admin" label="Dashboard" />
          <NavLink href="/admin/users" label="Users" />
          <NavLink href="/admin/reports" label="All reports" />
          <NavLink href="/admin/audit" label="Audit log" />
          <NavLink href="/admin/health" label="System health" />
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
        <header className="md:hidden h-14 px-4 flex items-center justify-between border-b border-slate-200 bg-white">
          <Link href="/admin" className="font-bold text-slate-900">
            Veroax · <span className="text-red-700">Admin</span>
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs text-slate-500 underline underline-offset-2"
            >
              Sign out
            </button>
          </form>
        </header>

        {/* Admin-mode banner — narrow strip at the top of every admin
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
