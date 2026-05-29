// Next.js middleware — refreshes the Supabase session cookie on each
// request and protects /dashboard routes by redirecting unauthenticated
// visitors to /login.
//
// Runs at the edge before any route handler or page component.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard"];

export async function middleware(request: NextRequest) {
  // Pass the pathname through as an x-pathname header so server
  // components in the root layout can render path-aware chrome
  // without re-parsing the request URL. The bottom-left
  // SignedInChip uses this to suppress itself on /r/<code> (the
  // public buyer-facing report view), where rendering the agent's
  // identity would leak it to the anonymous viewer. Mutating
  // request.headers in place is the documented way; the
  // NextResponse.next({ request }) call below forwards the
  // mutated headers downstream to server components.
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase env vars aren't configured, skip auth refresh entirely.
  // This keeps the marketing site fully functional even before the app
  // backend is wired up.
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not put any logic between createServerClient and getUser.
  // Calling getUser refreshes the auth tokens; reordering can cause logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  // Archived-account gate. When an authenticated user is hitting any
  // protected route, check whether their profile is archived. If so,
  // sign them out and redirect to /account-archived. The /account-
  // archived page itself is intentionally unauthenticated and not in
  // PROTECTED_PREFIXES, so we never bounce in a loop.
  //
  // Reads profiles via the same user-scoped client used for auth so
  // we don't need to construct a service-role client here at the
  // edge. RLS on profiles is own-row-only, which is exactly what we
  // need.
  if (user && isProtected && path !== "/account-archived") {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("archived_at")
      .eq("id", user.id)
      .maybeSingle();
    const archivedAt =
      (profileRow as { archived_at?: string | null } | null)?.archived_at ??
      null;
    if (archivedAt) {
      await supabase.auth.signOut();
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/account-archived";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on all routes EXCEPT static assets, images, and Next internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
