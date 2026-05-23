// Authenticated app shell. Middleware enforces auth before this layout
// renders, but we double-check here as a defense-in-depth measure.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "../(auth)/actions";

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
  // report PDF will render — the dashboard nudges to /settings when
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

  const displayName =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "Agent";

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside
        className="w-60 shrink-0 hidden md:flex flex-col text-indigo-100"
        style={{ background: "linear-gradient(180deg, #1e1b4b 0%, #0f0e2e 100%)" }}
      >
        <div className="px-6 h-16 flex items-center border-b border-white/5">
          <Link href="/dashboard" className="text-white font-bold text-lg tracking-tight">
            Veroax
          </Link>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1 text-sm">
          <NavLink href="/dashboard" label="Reports" />
          <NavLink href="/dashboard/upload" label="New report" />
          <NavLink href="/dashboard/archive" label="Archive" />
          <NavLink href="/dashboard/billing" label="Billing" />
          <NavLink href="/dashboard/settings" label="Settings" />
          {/* Admin link — visible only when profiles.is_admin = true.
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
        {/* Support contact block — sits just above the signed-in
            chrome so it's visible without scrolling, but doesn't
            shout for attention. Both lines are clickable: phone
            opens the OS dialer / FaceTime / etc. via tel:, email
            opens the default mail client via mailto:. */}
        <div className="px-6 py-4 border-t border-white/5 text-xs">
          <p className="text-indigo-300 font-semibold tracking-widest uppercase text-[10px] mb-2">
            Need help?
          </p>
          <a
            href="tel:+18662478833"
            className="block text-indigo-100 hover:text-white transition-colors"
          >
            (866) 247-8833
          </a>
          <a
            href="mailto:support@veroax.com"
            className="block text-indigo-100 hover:text-white transition-colors underline underline-offset-2 truncate"
          >
            support@veroax.com
          </a>
          <a
            href="/feedback"
            className="block text-amber-300 hover:text-amber-200 transition-colors mt-2"
          >
            Send feedback →
          </a>
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

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden h-14 px-4 flex items-center justify-between border-b border-slate-200 bg-white">
          <Link href="/dashboard" className="font-bold text-slate-900">
            Veroax
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

        {/* Profile-completion banner — hard requirement now: reports
            won't download until name + DRE + brokerage are all set. */}
        {profileIncomplete && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-sm text-amber-900 flex items-center justify-between gap-4">
            <span>
              Add your name, DRE license, and brokerage before downloading
              reports — these print on every PDF cover.
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
