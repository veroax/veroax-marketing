// Supabase client for use in Client Components (`"use client"` files).
// Uses the public anon key only. RLS policies enforce data isolation.
//
// For server-side code, use lib/supabase/server.ts instead.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Add to .env.local and Vercel.",
    );
  }
  return createBrowserClient(url, key);
}
