import Link from "next/link";

export const metadata = {
  title: "Help Videos, Veroax",
};

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-xs text-slate-500 hover:text-slate-900 inline-block mb-6"
        >
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Help Videos</h1>
        <p className="text-slate-600 leading-relaxed">
          Short walkthroughs of the most common Veroax tasks are coming soon.
          The planned lineup:
        </p>
        <ul className="mt-6 space-y-3 text-sm text-slate-700">
          {[
            "Uploading a disclosure package",
            "Reading the agent summary view",
            "Customizing your branding (logo, headshot, accent color)",
            "Drafting and sending the client email",
            "Adding new documents to an existing report",
            "Handling an HOA-heavy package (split documents, large size)",
          ].map((label) => (
            <li
              key={label}
              className="flex items-start gap-3 bg-white rounded-2xl border border-slate-200 p-4"
            >
              <span className="text-xs font-mono uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded">
                Coming
              </span>
              <span className="flex-1">{label}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-500 mt-8">
          Want a specific topic covered first?{" "}
          <Link
            href="/feedback"
            className="text-indigo-700 underline underline-offset-2"
          >
            Let us know
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
