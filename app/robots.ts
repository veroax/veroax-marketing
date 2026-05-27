// Dynamic robots.txt for veroax.com. Next.js 16 serves /robots.txt
// from the MetadataRoute.Robots object this function returns.
//
// Crawl posture:
//   - Allow everything public-facing
//   - Disallow auth-gated app surfaces (dashboard, admin, api)
//   - Disallow transient + token-protected paths
//   - Point search engines at the sitemap
//
// We do NOT use noindex meta tags as the only mechanism; robots.txt
// gives an upfront crawl signal so crawlers don't fetch private
// paths in the first place. Sensitive pages also carry
// `robots: { index: false }` in their metadata as defense-in-depth.

import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/admin",
          "/admin/",
          "/api/",
          "/auth/",
          "/invite/",
          "/checkout/",
          "/r/",
          "/forgot-password",
          "/login",
          "/signup",
        ],
      },
      // Block AI training crawlers from scraping the marketing site
      // and blog into model training corpora. Veroax produces
      // proprietary California disclosure analysis; we keep the
      // crawler door open for actual search engines (Googlebot,
      // Bingbot) but close it to commercial trainers.
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "ChatGPT-User",
        disallow: "/",
      },
      {
        userAgent: "CCBot",
        disallow: "/",
      },
      {
        userAgent: "Google-Extended",
        disallow: "/",
      },
      {
        userAgent: "anthropic-ai",
        disallow: "/",
      },
      {
        userAgent: "ClaudeBot",
        disallow: "/",
      },
      {
        userAgent: "PerplexityBot",
        disallow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
