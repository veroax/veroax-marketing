// /account-archived
//
// Landing page for users whose profiles.archived_at is set. The
// middleware redirects them here before they can reach any
// authenticated route. The page is static + noindex; it shouldn't
// surface in search.
//
// Purpose: tell the user their account is archived and give them a
// way to ask about it. No live session is required to view this
// page; the middleware signs them out before redirecting.

import Link from "next/link";
import { SUPPORT } from "@/lib/site";

export const metadata = {
  title: "Account archived, Veroax",
  robots: { index: false, follow: false },
};

export default function AccountArchivedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 px-6 py-16">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/" aria-label="Veroax">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/final/veroax-lockup-dark.svg"
              alt="Veroax"
              style={{ height: 30 }}
              className="inline-block"
            />
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 text-amber-700 text-3xl mb-4">
            !
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Your account has been archived
          </h1>
          <p className="text-sm text-slate-700 mt-3 leading-relaxed">
            This account no longer has access to Veroax. Your historical
            reports are preserved and remain visible to your former
            team and brokerage.
          </p>
          <p className="text-sm text-slate-700 mt-3 leading-relaxed">
            If you think this is an error, get in touch and we will
            sort it out.
          </p>

          <div className="border-t border-slate-100 mt-6 pt-5 space-y-3">
            <p>
              <a
                href={`mailto:${SUPPORT.email}`}
                className="text-indigo-700 font-semibold hover:text-indigo-900 underline underline-offset-2"
              >
                {SUPPORT.email}
              </a>
            </p>
            <p>
              <a
                href={`tel:${SUPPORT.phoneTel}`}
                className="text-slate-700 font-semibold hover:text-slate-900"
              >
                {SUPPORT.phone}
              </a>
            </p>
            <p className="text-xs text-slate-500">
              Phone monitored {SUPPORT.hours}.
            </p>
          </div>

          <Link
            href="/"
            className="inline-block mt-6 text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2"
          >
            Back to veroax.com
          </Link>
        </div>
      </div>
    </main>
  );
}
