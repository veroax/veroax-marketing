import Link from "next/link";
import { FeedbackForm } from "./_components/FeedbackForm";

export const metadata = {
  title: "Feedback, Veroax",
  robots: { index: false, follow: false },
};

export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="text-xs text-slate-500 hover:text-slate-900 inline-block mb-6"
        >
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          Send us feedback
        </h1>
        <p className="text-slate-600 mb-8 leading-relaxed">
          Bug, missing feature, weird PDF rendering, accuracy concern on a
          specific finding, anything goes. Messages land in our support inbox
          and a human reads each one.
        </p>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <FeedbackForm />
        </div>
        <p className="text-xs text-slate-500 mt-6">
          Prefer email? Reach us directly at{" "}
          <a
            href="mailto:support@veroax.com"
            className="text-indigo-700 underline underline-offset-2"
          >
            support@veroax.com
          </a>{" "}
          or call{" "}
          <a
            href="tel:+18662478833"
            className="text-indigo-700 underline underline-offset-2"
          >
            (866) 247-8833
          </a>
          .
        </p>
      </div>
    </div>
  );
}
