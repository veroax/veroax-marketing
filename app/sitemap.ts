// Dynamic sitemap for veroax.com. Next.js 16 generates /sitemap.xml
// from the MetadataRoute.Sitemap array this function returns,
// regenerated at build time and on revalidation.
//
// Indexable public surfaces only. Excludes:
//   - /dashboard/*  (auth-gated app surface)
//   - /admin/*      (auth-gated admin surface)
//   - /api/*        (route handlers, not pages)
//   - /invite/*     (token-protected single-use pages)
//   - /auth/*       (transient OAuth callbacks)
//   - /r/[code]     (per-report share pages; per-report sitemap noise
//                    would be huge and the value is share-via-link
//                    not crawl)
//   - /checkout/*   (post-payment transient pages)
//   - /forgot-password, /(auth)/login, /(auth)/signup

import type { MetadataRoute } from "next";
import { listPosts } from "@/lib/blog/posts";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

// Build-time deploy timestamp. Vercel exports the originating commit's
// date as VERCEL_GIT_COMMIT_DATE on every build (ISO 8601 string).
// Use it as the lastModified for static marketing pages so that
// Google sees a real, stable "this is when this page last changed"
// signal rather than "always just now."
//
// Why this matters: if every regen reports new Date(), Google
// eventually discounts the priority field on the assumption that
// the publisher is lying about freshness. A stable deploy timestamp
// lets Google trust the field and crawl according to its hints.
//
// Local dev fallback: when running outside Vercel (no env var), we
// fall back to new Date() so the sitemap still validates and serves.
const BUILD_DATE: Date = (() => {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_DATE;
  if (fromEnv) {
    const parsed = new Date(fromEnv);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
})();

export default function sitemap(): MetadataRoute.Sitemap {
  // Static public pages with stable priority and change frequency.
  // priority is relative within OUR sitemap (Google uses it as a
  // hint), not an absolute ranking signal. lastModified is the
  // deploy-time timestamp computed above, stable across every entry.
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: BUILD_DATE,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: BUILD_DATE,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: BUILD_DATE,
      changeFrequency: "yearly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/investors`,
      lastModified: BUILD_DATE,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: BUILD_DATE,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/demo`,
      lastModified: BUILD_DATE,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/help`,
      lastModified: BUILD_DATE,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: BUILD_DATE,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: BUILD_DATE,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: BUILD_DATE,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  // Blog posts: one URL per published post, with lastModified set
  // to the post's published date. Newer = higher priority within
  // the blog cohort.
  const blogPosts = listPosts();
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...blogEntries];
}
