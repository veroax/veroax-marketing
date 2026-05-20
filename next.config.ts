import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse v2 wraps Mozilla's pdf.js which uses a worker file at
  // runtime. Next.js's default bundler stripped or relocated that worker,
  // causing module-load crashes in Vercel serverless functions.
  // Marking these as external preserves their on-disk layout so worker
  // resolution succeeds at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
