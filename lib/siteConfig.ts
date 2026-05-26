// Server-side accessor for the public.site_config singleton row.
//
// Loaded by the root layout to decide whether to inject the GA4
// gtag.js snippet, and by /admin/integrations to render + save the
// form. The row is cached in-memory for SITE_CONFIG_CACHE_MS to
// avoid hitting Supabase on every page render (a single concurrent
// request burst at peak traffic would otherwise hammer the DB for
// the same row).

import { createServiceRoleClient } from "@/lib/supabase/server";

const SITE_CONFIG_ID = "00000000-0000-0000-0000-000000000001";
// 60s cache: admin edits become visible within a minute, the DB is
// happy, and the cost of a stale render is "the gtag.js snippet is
// briefly missing on a few pages." Acceptable.
const SITE_CONFIG_CACHE_MS = 60 * 1000;

export type SiteConfig = {
  google_analytics_id: string | null;
  notes: string | null;
  updated_at: string | null;
};

let cached: { value: SiteConfig; expiresAt: number } | null = null;

/**
 * Read the singleton config row. Returns a default-ish object when
 * the row is missing (e.g. before migration 0023 runs); never throws.
 */
export async function getSiteConfig(
  opts: { skipCache?: boolean } = {},
): Promise<SiteConfig> {
  const now = Date.now();
  if (!opts.skipCache && cached && cached.expiresAt > now) {
    return cached.value;
  }

  const defaultConfig: SiteConfig = {
    google_analytics_id: null,
    notes: null,
    updated_at: null,
  };

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_config")
      .select("google_analytics_id, notes, updated_at")
      .eq("id", SITE_CONFIG_ID)
      .maybeSingle();
    if (error || !data) {
      // Migration not applied yet, or DB hiccup; cache the default
      // briefly so we don't re-hit the DB on every render.
      cached = {
        value: defaultConfig,
        expiresAt: now + SITE_CONFIG_CACHE_MS,
      };
      return defaultConfig;
    }
    const value = data as SiteConfig;
    cached = {
      value,
      expiresAt: now + SITE_CONFIG_CACHE_MS,
    };
    return value;
  } catch (err) {
    console.error("[siteConfig] read failed:", err);
    return defaultConfig;
  }
}

/**
 * Bust the in-memory cache. Called by the /api/admin/integrations
 * mutation route after a save so the next layout render sees the
 * new value immediately.
 */
export function invalidateSiteConfigCache(): void {
  cached = null;
}

/**
 * Lightweight syntactic check on a GA4 Measurement ID. The real one
 * looks like "G-XXXXXXXXXX" (G-, then 10+ uppercase alphanumerics).
 * We're permissive here: accept G-, GA-, or UA- prefixes (UA- is
 * legacy but some old properties still use it) and any reasonable
 * length. Returns the trimmed/normalized string or null if it does
 * not match.
 */
export function normalizeGaId(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (!/^(G|GA|UA)-[A-Z0-9-]{6,}$/i.test(t)) {
    return null;
  }
  return t.toUpperCase();
}
