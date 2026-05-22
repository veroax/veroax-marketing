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
  // any are missing.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, dre_license, brokerage")
    .eq("id", user.id)
    .maybeSingle();
  const profileIncomplete =
    !profile?.full_name?.trim() ||
    !profile?.dre_license?.trim() ||
    !profile?.brokerage?.trim();

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
          <NavLink href="/dashboard/settings" label="Settings" />
        </nav>
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
