// Shared auth-gate helpers for API route handlers. Encapsulates the
// "create RLS client, fetch user, 401 if absent" pattern that was
// duplicated across 20+ routes (per the audit). Use these instead of
// hand-rolling the gate. The discriminated-union return shape forces
// callers to handle the unauthorized case explicitly:
//
//   const auth = await requireUser();
//   if (!auth.ok) return auth.response;
//   const { supabase, user } = auth;
//
//   const adminAuth = await requireAdmin();
//   if (!adminAuth.ok) return adminAuth.response;
//   const { supabase, user } = adminAuth;
//
// The admin gate validates the user FIRST (returns 401 if not
// signed in) and only THEN checks profiles.is_admin (returns 403 if
// signed in but not an admin). Status codes intentionally differ so
// client-side logging can distinguish "log in" from "you can never
// do this."

import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type RequireUserResult =
  | {
      ok: true;
      supabase: SupabaseClient;
      user: User;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export type RequireAdminResult =
  | {
      ok: true;
      supabase: SupabaseClient;
      user: User;
      isAdmin: true;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * Require an authenticated user. Returns either { ok: true, supabase,
 * user } or { ok: false, response } where response is a ready-to-return
 * 401 NextResponse.
 */
export async function requireUser(): Promise<RequireUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 },
      ),
    };
  }
  return { ok: true, supabase, user };
}

/**
 * Require an authenticated admin user. Returns 401 if not signed in,
 * 403 if signed in but profiles.is_admin is false (or unset).
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const userAuth = await requireUser();
  if (!userAuth.ok) return userAuth;
  const { supabase, user } = userAuth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle<{ is_admin: boolean | null }>();

  if (!profile?.is_admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Admin only." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, supabase, user, isAdmin: true };
}
