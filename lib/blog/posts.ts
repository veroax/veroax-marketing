// Blog post loader. Reads Markdown files from content/blog/, parses
// the YAML frontmatter, renders the body to HTML, and exposes typed
// helpers the App Router pages can use.
//
// Posts live as plain .md files so the founder (or a future editor)
// can edit them in any text editor without touching React. The
// frontmatter shape is fixed at:
//
//   ---
//   title: "..."
//   slug: "..."
//   description: "..."
//   author: "..."
//   published_at: "YYYY-MM-DD"
//   tags: ["..."]
//   reading_time_min: 7
//   ---
//
// Anything missing falls back to a safe default rather than throwing.
// Runtime: Node only (we use fs). Don't import this from a Client
// Component. The blog pages that consume it are all Server Components.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  author: string;
  publishedAt: string;        // ISO date string
  publishedAtDisplay: string; // "May 23, 2026"
  tags: string[];
  readingTimeMin: number;
};

export type BlogPost = BlogPostMeta & {
  html: string; // rendered body
};

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

function safeReadDir(): string[] {
  try {
    return fs
      .readdirSync(BLOG_DIR)
      .filter((f) => f.endsWith(".md") && !f.startsWith("."));
  } catch {
    return [];
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

function parseFrontmatter(filename: string, raw: string): {
  meta: BlogPostMeta;
  content: string;
} {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const fallbackSlug = filename.replace(/\.md$/, "");
  const slug = typeof data.slug === "string" ? data.slug : fallbackSlug;
  const title = typeof data.title === "string" ? data.title : fallbackSlug;
  const description =
    typeof data.description === "string" ? data.description : "";
  const author =
    typeof data.author === "string" ? data.author : "Veroax editorial";
  const publishedAt =
    typeof data.published_at === "string"
      ? data.published_at
      : new Date().toISOString().slice(0, 10);
  const tags = Array.isArray(data.tags)
    ? (data.tags as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const readingTimeMin =
    typeof data.reading_time_min === "number" && data.reading_time_min > 0
      ? Math.round(data.reading_time_min)
      : Math.max(1, Math.round(parsed.content.split(/\s+/).length / 220));

  return {
    meta: {
      slug,
      title,
      description,
      author,
      publishedAt,
      publishedAtDisplay: formatDate(publishedAt),
      tags,
      readingTimeMin,
    },
    content: parsed.content,
  };
}

/**
 * Return every published post, newest first.
 */
export function listPosts(): BlogPostMeta[] {
  const files = safeReadDir();
  const all: BlogPostMeta[] = [];
  for (const filename of files) {
    try {
      const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf8");
      const { meta } = parseFrontmatter(filename, raw);
      all.push(meta);
    } catch (err) {
      console.error(`[blog] failed to parse ${filename}:`, err);
    }
  }
  return all.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

/**
 * Return one post (rendered to HTML) by slug, or null if not found.
 */
export function getPostBySlug(slug: string): BlogPost | null {
  const files = safeReadDir();
  for (const filename of files) {
    try {
      const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf8");
      const { meta, content } = parseFrontmatter(filename, raw);
      if (meta.slug !== slug) continue;
      const html = marked.parse(content, {
        async: false,
        gfm: true,
        breaks: false,
      }) as string;
      return { ...meta, html };
    } catch (err) {
      console.error(`[blog] failed to render ${filename}:`, err);
    }
  }
  return null;
}

/**
 * Slugs for `generateStaticParams`. Skips files that fail to parse.
 */
export function listSlugs(): string[] {
  return listPosts().map((p) => p.slug);
}
