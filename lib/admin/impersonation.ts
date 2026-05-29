import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Admin "view as user" mode. The admin clicks Impersonate on any
// user; subsequent dashboard reads scope to that user_id instead
// of the admin's own. The admin's actual auth session stays put;
// this is a read-only viewer pattern, not a full identity swap.
//
// Cookie:
//   vx_impersonate_user_id, httpOnly, lax. Holds the target user_id.
//   Cleared explicitly via /api/admin/impersonate/stop or after 12
//   hours of inactivity (the cookie maxAge).
//
// Threat model:
//   - The cookie is only honored when the ACTUAL session user is
//     marked is_admin = true. A non-admin who manages to set the
//     cookie gets no extra access.
//   - Write paths (archive, delete, draft email, etc.) intentionally
//     do NOT consult the cookie. They stay scoped to the real
//     authenticated user. The banner makes it visually obvious
//     that impersonation is in effect so the admin doesn't try to
//     "do" something as the user.
//   - On every page render that uses the cookie we audit_log the
//     read so we have a trail of which admin viewed which user's
//     data and when.

export const IMPERSONATE_COOKIE = "vx_impersonate_user_id";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export type DashboardViewer = {
  // The user_id whose dashboard data should be displayed. Equal to
  // the actual user when not impersonating; equal to the
  // impersonated user_id when the admin is in view-as mode.
  viewingUserId: string;
  // True when the cookie is set AND the actual user is admin.
  impersonating: boolean;
  // Profile snapshot of the impersonated user, populated only when
  // impersonating = true. Used by the banner to render "Viewing as
  // <name>".
  impersonatedProfile: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
};

// Resolves the dashboard-viewing identity for a server component.
// Pass in the actual auth user (from supabase.auth.getUser()) and
// the is_admin flag from their profile. Returns the effective
// viewer plus a flag so the layout can render the banner.
//
// IMPORTANT: this function does NOT itself check the auth user's
// admin status against the database. The caller passes is_admin
// in, and we honor the cookie ONLY when is_admin is true. This
// keeps the helper synchronous and side-effect-free; auditing of
// reads happens at the page level.
export async function resolveDashboardViewer(args: {
  actualUserId: string;
  isAdmin: boolean;
}): Promise<DashboardViewer> {
  const { actualUserId, isAdmin } = args;
  const store = await cookies();
  const cookieValue = store.get(IMPERSONATE_COOKIE)?.value ?? null;
  if (!cookieValue || !isAdmin) {
    return {
      viewingUserId: actualUserId,
      impersonating: false,
      impersonatedProfile: null,
    };
  }
  // Look up the impersonated profile for the banner. Service-role
  // because the admin is reading across users.
  const admin = createServiceRoleClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", cookieValue)
    .maybeSingle();
  if (!profile) {
    // Cookie points at a deleted user. Treat as not impersonating
    // and let the caller clear the cookie on the next response.
    return {
      viewingUserId: actualUserId,
      impersonating: false,
      impersonatedProfile: null,
    };
  }
  return {
    viewingUserId: (profile as { id: string }).id,
    impersonating: true,
    impersonatedProfile: profile as {
      id: string;
      full_name: string | null;
      email: string;
    },
  };
}

// Sets the impersonation cookie. Called from POST /api/admin/impersonate.
// Caller is responsible for verifying admin status before invoking.
export async function startImpersonation(userId: string): Promise<void> {
  const store = await cookies();
  store.set(IMPERSONATE_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

// Clears the impersonation cookie. Called from POST
// /api/admin/impersonate/stop AND from the banner's Stop button.
export async function stopImpersonation(): Promise<void> {
  const store = await cookies();
  store.delete(IMPERSONATE_COOKIE);
}
