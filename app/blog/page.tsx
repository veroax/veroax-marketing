import Link from "next/link";

export const metadata = { title: "Blog — Veroax" };

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-xs text-slate-500 hover:text-slate-900 inline-block mb-6"
        >
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Veroax Blog</h1>
        <p className="text-slate-600 leading-relaxed">
          Coming soon — disclosure-analysis playbooks, California real-estate
          regulatory updates, agent tactics, and behind-the-scenes notes on
          how Veroax flags critical issues before contingency removal.
        </p>
        <p className="text-sm text-slate-500 mt-8">
          In the meantime, follow updates via{" "}
          <a
            href="mailto:support@veroax.com?subject=Add%20me%20to%20Veroax%20updates"
            className="text-indigo-700 underline underline-offset-2"
          >
            support@veroax.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
