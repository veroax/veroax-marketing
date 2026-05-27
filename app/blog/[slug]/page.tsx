// Per-post page at /blog/[slug]. Statically generated for each slug
// returned by listSlugs(); served as plain HTML. Includes:
//
//  - JSON-LD BlogPosting schema (helps Google understand the page)
//  - Inline prose styling that matches the rest of the marketing site
//    (we deliberately avoid @tailwindcss/typography to keep the bundle
//    small and to stay independent of plugin versioning)
//  - "Prev / Next" navigation footer
//  - SubscribeForm at the bottom

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPostBySlug, listPosts, listSlugs } from "@/lib/blog/posts";
import SubscribeForm from "../_components/SubscribeForm";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

type Props = {
  params: Promise<{ slug: string }>;
};

// Pre-generate every post at build time. New posts ship by editing the
// .md file and redeploying.
export function generateStaticParams() {
  return listSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) {
    return { title: "Post not found, Veroax" };
  }
  return {
    title: `${post.title}, Veroax`.replace(/,/g, "|"),
    description: post.description,
    alternates: {
      canonical: `${SITE_URL}/blog/${post.slug}`,
      types: {
        "application/rss+xml": "/blog/rss.xml",
      },
    },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/blog/${post.slug}`,
      publishedTime: post.publishedAt,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  // Prev / Next based on the chronological ordering of listPosts().
  const all = listPosts();
  const index = all.findIndex((p) => p.slug === post.slug);
  const newer = index > 0 ? all[index - 1] : null;
  const older = index >= 0 && index < all.length - 1 ? all[index + 1] : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    author: { "@type": "Organization", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "Veroax",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/brand/final/veroax-lockup-light.svg`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${post.slug}`,
    },
    keywords: post.tags.join(", "),
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="Veroax">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/final/veroax-lockup-light.svg"
              alt="Veroax"
              style={{ height: 30 }}
            />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-slate-600">
            <Link href="/blog" className="hover:text-slate-900">
              All posts
            </Link>
            <Link href="/" className="hover:text-slate-900">
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 sm:py-14">
        <Link
          href="/blog"
          className="text-xs text-slate-500 hover:text-slate-900 inline-block mb-6"
        >
          ← All posts
        </Link>

        <article>
          <header className="mb-8">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-3">
              <time dateTime={post.publishedAt}>
                {post.publishedAtDisplay}
              </time>
              <span className="text-slate-300">·</span>
              <span>{post.readingTimeMin} min read</span>
              <span className="text-slate-300">·</span>
              <span>{post.author}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
              {post.title}
            </h1>
            {post.description && (
              <p className="text-base sm:text-lg text-slate-600 mt-4 leading-relaxed">
                {post.description}
              </p>
            )}
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-5">
                {post.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </header>

          {/* Rendered Markdown. The css class is defined in
              globals.css and styles every <h2>, <h3>, <p>, <ul>,
              <ol>, <blockquote>, <code>, <a> the content includes. */}
          <div
            className="veroax-prose"
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
        </article>

        <hr className="my-12 border-slate-200" />

        <SubscribeForm source={`post:${post.slug}`} variant="card" />

        {(newer || older) && (
          <nav
            aria-label="More posts"
            className="mt-12 grid sm:grid-cols-2 gap-4"
          >
            {newer ? (
              <Link
                href={`/blog/${newer.slug}`}
                className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Newer
                </p>
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  {newer.title}
                </p>
              </Link>
            ) : (
              <div />
            )}
            {older ? (
              <Link
                href={`/blog/${older.slug}`}
                className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all sm:text-right"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Older
                </p>
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  {older.title}
                </p>
              </Link>
            ) : (
              <div />
            )}
          </nav>
        )}

        <p className="text-xs text-slate-500 mt-12 text-center">
          Disclaimer: Veroax editorial posts are general information for
          California real-estate professionals. They are not legal,
          financial, or tax advice and should not substitute for
          licensed inspection, attorney review, or lender underwriting.
        </p>
      </main>
    </div>
  );
}
