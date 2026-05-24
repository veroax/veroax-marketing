// RSS 2.0 feed at /blog/rss.xml. Lists every published post, newest
// first. Cached for 5 minutes at the edge so the feed render does
// not happen on every reader poll. Manual revalidation via redeploy
// when new posts ship.
//
// The blog index <head> links this feed via
//   metadata.alternates.types["application/rss+xml"]
// so RSS readers can auto-discover it.

import { listPosts } from "@/lib/blog/posts";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = listPosts();
  const buildDate = new Date().toUTCString();

  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}`;
      const pubDate = new Date(p.publishedAt).toUTCString();
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(p.description)}</description>
      <pubDate>${pubDate}</pubDate>
      <author>support@veroax.com (${escapeXml(p.author)})</author>${p.tags
        .map((t) => `\n      <category>${escapeXml(t)}</category>`)
        .join("")}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Veroax Blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Disclosure-analysis playbooks for California real-estate agents. Practical, statute-aware, written for working professionals.</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
