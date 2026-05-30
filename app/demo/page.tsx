import Link from "next/link";

export const metadata = {
  title: "Watch a Demo, Veroax",
};

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-xs text-slate-500 hover:text-slate-900 inline-block mb-6"
        >
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          Watch a Veroax Demo
        </h1>
        <p className="text-slate-600 leading-relaxed">
          We&apos;re assembling a short walkthrough that takes a real CA
          disclosure package from upload to a defensible analysis in about
          90 seconds. While we polish it,{" "}
          <a
            href="mailto:support@veroax.com?subject=Book%20a%20Veroax%20demo"
            className="text-indigo-700 underline underline-offset-2"
          >
            email support
          </a>{" "}
          to schedule a live walkthrough. We&apos;ll run a sample disclosure
          package end-to-end on a screen-share and answer questions in real
          time.
        </p>
        <div className="mt-8 bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-700">
          <p className="font-semibold text-slate-900 mb-2">
            What we&apos;ll cover in a live demo
          </p>
          <ul className="space-y-1.5 list-disc list-inside text-slate-600">
            <li>14-section disclosure analysis on your actual package</li>
            <li>Critical vs. high vs. moderate severity rubric in practice</li>
            <li>
              Two formats: live dashboard view and downloadable PDF for
              offline review
            </li>
            <li>Drafting a brief email summary to invite the conversation</li>
            <li>Add-documents-and-re-analyze workflow</li>
            <li>Pricing model and what credits cover</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
