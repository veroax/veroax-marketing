// Blog index. Server-rendered; lists every post from content/blog/
// in reverse-chronological order. Includes a JSON-LD Blog schema for
// SEO, an RSS link in <head>, and an inline subscribe form. Posts are
// plain Markdown files so the founder can edit them in any editor and
// re-deploy.

import Link from "next/link";
import type { Metadata } from "next";
import { listPosts } from "@/lib/blog/posts";
import SubscribeForm from "./_components/SubscribeForm";

export const metadata: Metadata = {
  title: "Blog, Veroax",
  description:
    "Practical playbooks on California residential disclosures, severity triage, repair-cost estimating, and post-disclosure negotiation. Written for the working buyer's agent.",
  alternates: {
    types: {
      "application/rss+xml": "/blog/rss.xml",
    },
  },
};

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

export default function BlogIndexPage() {
  const posts = listPosts();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Veroax Blog",
    description:
      "Practical playbooks on California residential disclosures, severity triage, repair-cost estimating, and post-disclosure negotiation.",
    url: `${SITE_URL}/blog`,
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.publishedAt,
      author: { "@type": "Organization", name: p.author },
      url: `${SITE_URL}/blog/${p.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="Veroax">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/final/veroax-lockup-light.svg"
              alt="Veroax"
              style={{ height: 30 }}
            />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-slate-600">
            <a
              href="/blog/rss.xml"
              className="hover:text-slate-900"
              aria-label="Subscribe via RSS"
            >
              RSS
            </a>
            <Link href="/" className="hover:text-slate-900">
              Home
            </Link>
            <Link
              href="/login"
              className="font-semibold text-indigo-700 hover:text-indigo-900"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
        <div className="mb-10 sm:mb-14">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Veroax editorial
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2 leading-tight">
            Disclosure-analysis playbooks for California agents
          </h1>
          <p className="text-base text-slate-600 mt-4 leading-relaxed">
            Practical, working-agent guides to California residential
            disclosures. Each post focuses on something specific you can
            apply to your next transaction. We cite the actual statutes
            and forms, and we keep the language plain.
          </p>
        </div>

        {posts.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            No posts yet. Check back soon.
          </p>
        ) : (
          <ul className="space-y-4">
            {posts.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="block group bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 hover:border-indigo-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                    <time dateTime={p.publishedAt}>
                      {p.publishedAtDisplay}
                    </time>
                    <span className="text-slate-300">·</span>
                    <span>{p.readingTimeMin} min read</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 group-hover:text-indigo-700 transition-colors leading-snug">
                    {p.title}
                  </h2>
                  {p.description && (
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                      {p.description}
                    </p>
                  )}
                  {p.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {p.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12">
          <SubscribeForm source="blog-index" variant="card" />
        </div>

        <p className="text-xs text-slate-500 mt-8 text-center">
          Want to suggest a topic?{" "}
          <a
            href="mailto:support@veroax.com?subject=Veroax%20blog%20topic%20suggestion"
            className="text-indigo-700 underline underline-offset-2"
          >
            Email us
          </a>
          .
        </p>
      </main>
    </div>
  );
}
