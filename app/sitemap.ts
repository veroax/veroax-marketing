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

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Static public pages with stable priority and change frequency.
  // priority is relative within OUR sitemap (Google uses it as a
  // hint), not an absolute ranking signal.
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/investors`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/demo`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/help`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
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
