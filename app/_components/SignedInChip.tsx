import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cookies, headers } from "next/headers";
import { IMPERSONATE_COOKIE } from "@/lib/admin/impersonation";

// Floating "Signed in as <name>" chip rendered at the bottom-left
// of every page. Server component, no JS needed. Reads the auth
// session and the profile row, hides itself when not authenticated.
//
// Why: founder wanted a persistent indicator so they (and any
// regular user) can tell at a glance which account they're on,
// across both marketing and authenticated surfaces. The
// dashboard sidebar already shows it, but the sidebar is hidden
// on mobile AND on every marketing page; without a global chip
// the user could land on / (the marketing home) thinking they
// were signed out.
//
// Special-cases:
//   - When the admin has activated "View as user" mode, the
//     chip reads "Signed in as <admin>, viewing as <target>" so
//     the impersonation is doubly visible (in addition to the
//     red banner on the dashboard surface itself).
//   - On the public report view at /r/<code> the chip would
//     leak the agent's identity to an anonymous buyer, which is
//     a no-go. The PublicReportLayout opts out of rendering
//     this chip; everywhere else, it's on.

type Props = {
  // Allow surfaces that intentionally show neither agent nor
  // buyer identity (the public report view) to suppress the
  // chip explicitly. Default false, render the chip.
  hidden?: boolean;
};

export async function SignedInChip({ hidden = false }: Props) {
  if (hidden) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve the display name from the profile. Fall back to the
  // email prefix when the user hasn't set a name yet.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const displayName =
    (profile as { full_name?: string | null } | null)?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "you";
  const isAdmin = Boolean(
    (profile as { is_admin?: boolean } | null)?.is_admin,
  );

  // Impersonation: when the admin has activated "View as user"
  // mode the chip reads "<admin>, viewing as <target>" so the
  // impersonation state is obvious from any surface, not just
  // the dashboard's red banner.
  let impersonatedLabel: string | null = null;
  if (isAdmin) {
    const store = await cookies();
    const targetUserId = store.get(IMPERSONATE_COOKIE)?.value ?? null;
    if (targetUserId) {
      // We use the user-scoped client here. Admin RLS on profiles
      // allows reading any row, so this works without escalation.
      const { data: target } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", targetUserId)
        .maybeSingle();
      if (target) {
        impersonatedLabel =
          (target as { full_name?: string | null }).full_name?.trim() ||
          ((target as { email?: string }).email ?? "user");
      }
    }
  }

  // On dashboard + admin surfaces the layout renders a 240px-wide
  // sidebar on md+ screens; the chip needs to clear it so it
  // doesn't sit on top of the sidebar's own "Signed in as" block.
  // Mobile sidebar is hidden so the default left-3 position is
  // correct there. We read the pathname out of the x-pathname
  // header set by middleware to make this decision.
  const reqHeaders = await headers();
  const pathname = reqHeaders.get("x-pathname") ?? "";
  const hasSidebar =
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
  const positionClass = hasSidebar
    ? "fixed bottom-3 left-3 md:left-[252px] z-30 pointer-events-none"
    : "fixed bottom-3 left-3 z-30 pointer-events-none";

  return (
    <div
      className={positionClass}
      // pointer-events-none on the wrapper so the chip never
      // intercepts a click that was meant for content underneath.
      // The inner <a> re-enables pointer events on itself only.
    >
      <Link
        href="/dashboard/settings"
        className="pointer-events-auto inline-flex items-center gap-2 bg-slate-900/90 backdrop-blur text-white text-[11px] font-medium px-3 py-1.5 rounded-full shadow-lg hover:bg-slate-800 transition-colors max-w-[80vw] truncate"
        title="Open your profile settings"
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${impersonatedLabel ? "bg-red-400" : isAdmin ? "bg-red-400" : "bg-emerald-400"}`}
          aria-hidden="true"
        />
        <span className="truncate">
          {impersonatedLabel ? (
            <>
              {displayName}
              <span className="text-slate-300">, viewing as </span>
              <span className="font-semibold">{impersonatedLabel}</span>
            </>
          ) : (
            <>
              Signed in as{" "}
              <span className="font-semibold">{displayName}</span>
              {isAdmin ? (
                <span className="text-red-300 ml-1">(admin)</span>
              ) : null}
            </>
          )}
        </span>
      </Link>
    </div>
  );
}
