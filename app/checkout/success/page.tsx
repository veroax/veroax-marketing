import Link from "next/link";

import { SUPPORT } from "@/lib/site";
export const metadata = {
  title: "Welcome to Veroax",
  robots: { index: false, follow: false },
};

export default function CheckoutSuccess() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white px-6 py-24">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/30">
          <svg
            className="w-8 h-8 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          You&apos;re in.
        </h1>
        <p className="text-indigo-200 leading-relaxed">
          Your Veroax subscription is active. Look out for a welcome email in
          the next minute, it has your login link and a quick walkthrough of
          how to upload your first disclosure package.
        </p>
        <p className="text-xs text-indigo-300">
          Need help right away?{" "}
          <a
            href={`mailto:${SUPPORT.email}`}
            className="underline underline-offset-2 hover:text-white"
          >
            {SUPPORT.email}
          </a>{" "}
          ·{" "}
          <a
            href={`tel:${SUPPORT.phoneTel}`}
            className="underline underline-offset-2 hover:text-white"
          >
            {SUPPORT.phone}
          </a>
        </p>
        <div className="pt-4">
          <Link
            href="/"
            className="inline-block bg-amber-400 text-indigo-950 font-semibold px-6 py-3 rounded-lg hover:bg-amber-300 transition-colors shadow-lg shadow-amber-400/20"
          >
            Back to veroax.com
          </Link>
        </div>
      </div>
    </main>
  );
}
