// Supabase clients for server-side use (Server Components, Server Actions,
// Route Handlers). Uses @supabase/ssr with Next.js cookies() to maintain
// the auth session across the server/client boundary.
//
// Two helpers:
// - createClient(): RLS-respecting client bound to the current user's
//   session. Use this for any user-facing data fetch.
// - createServiceRoleClient(): bypasses RLS using the service_role key.
//   Use ONLY in trusted server contexts (webhook handlers, analysis
//   workers) where the request is not on behalf of a user.

import { createServerClient } from "@supabase/ssr";
import { createClient as createBaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var: ${name}. Add it to .env.local and Vercel.`,
    );
  }
  return value;
}

/**
 * RLS-respecting Supabase client for the current user's session.
 * Reads/writes are subject to the policies defined in the schema.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component
            // (which cannot set cookies). Ignored when a middleware
            // refreshes user sessions.
          }
        },
      },
    },
  );
}

/**
 * Service-role Supabase client. Bypasses RLS. Use only in webhook
 * handlers and trusted background jobs. NEVER expose to the browser.
 */
export function createServiceRoleClient() {
  return createBaseClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
