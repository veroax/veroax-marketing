// Standalone contact page. Higher polish than the inline form on the
// homepage: phone + hours hero, dedicated sales contact form,
// trust signals. Brokerage tier CTAs across the marketing site
// route here (with ?topic=brokerage), which prefills the subject
// line + the message body so the visitor doesn't start at a blank
// textarea.
//
// Supported ?topic= values:
//   brokerage   -> "Brokerage tier inquiry"
//   team        -> "Team tier inquiry"
//   investor    -> "Investor inquiry" (used by /investors)
//   sales       -> "Sales question" (default; no topic param)
//
// The form submits via a server action (lib/server/sendContactEmail)
// for the same reasons as /feedback: useActionState() lets the
// acknowledgement render inline with no client-side fetch wiring.

import Link from "next/link";
import { Suspense } from "react";
import { ContactForm } from "./_components/ContactForm";
import { SUPPORT } from "@/lib/site";

export const metadata = {
  title: "Contact sales, Veroax",
  description:
    "Talk to Veroax about brokerage pricing, team accounts, integrations, or general questions. Phone support 8 AM to 8 PM Pacific.",
};

type Search = Promise<{ topic?: string }>;

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const topic = (sp.topic ?? "sales").toLowerCase();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top strip mirrors /pricing for visual consistency. */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" aria-label="Veroax">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/final/veroax-lockup-light.svg"
              alt="Veroax"
              style={{ height: 32 }}
            />
          </Link>
          <Link
            href="/login"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
        {/* Hero. The phone number sits at the top, intentionally bigger
            than anything else on the page so a prospect on mobile can
            tap-to-call in one motion. */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-14">
          <p className="text-xs font-bold tracking-widest text-amber-600 uppercase">
            Contact Veroax
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3">
            {topicTitle(topic)}
          </h1>
          <p className="text-base sm:text-lg text-slate-600 mt-4 leading-relaxed">
            {topicSubtitle(topic)}
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-8 lg:gap-12 items-start">
          {/* Left rail: phone, hours, email. Designed to read as a
              trust card; the phone number is the visual anchor. */}
          <aside className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-7 lg:sticky lg:top-8">
            <div>
              <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-2">
                Call us
              </p>
              <a
                href={`tel:${SUPPORT.phoneTel}`}
                className="block text-3xl sm:text-4xl font-bold text-indigo-950 hover:text-indigo-800 transition-colors"
                aria-label={`Call Veroax at ${SUPPORT.phone}`}
              >
                {SUPPORT.phone}
              </a>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                  Monitored {SUPPORT.hours}.
                </span>
                <br />
                Calls outside those hours go to voicemail and we return
                them the next business morning.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-2">
                Email
              </p>
              <a
                href={`mailto:${SUPPORT.email}`}
                className="text-lg font-semibold text-indigo-700 hover:text-indigo-900 transition-colors underline underline-offset-2"
              >
                {SUPPORT.email}
              </a>
              <p className="text-xs text-slate-500 mt-1">
                Replies within one business day.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-2">
                Mailing address
              </p>
              <address className="not-italic text-sm text-slate-700 leading-relaxed">
                Veroax, Inc.
                <br />
                {SUPPORT.address.street}
                <br />
                {SUPPORT.address.city}, {SUPPORT.address.region} {SUPPORT.address.postalCode}
              </address>
            </div>
          </aside>

          {/* Right rail: form. */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              Send us a note
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Fill out the form and someone from our team will follow
              up by phone or email, whichever you prefer.
            </p>
            <Suspense fallback={null}>
              <ContactForm topic={topic} />
            </Suspense>
          </section>
        </div>

        {/* Footer-style trust strip. */}
        <div className="mt-12 grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto text-center text-xs text-slate-500">
          <TrustItem label="California-licensed real estate technology" />
          <TrustItem label="Custom contracts available for brokerages" />
          <TrustItem label="PII purged after every report" />
        </div>
      </main>
    </div>
  );
}

function topicTitle(topic: string): string {
  if (topic === "brokerage") return "Brokerage pricing and onboarding";
  if (topic === "team") return "Team tier and shared quotas";
  if (topic === "investor") return "Investor inquiries";
  return "Talk to Veroax";
}

function topicSubtitle(topic: string): string {
  if (topic === "brokerage") {
    return "Tell us about your office: how many agents, which markets, and what disclosure volume looks like in a typical month. We will get back within one business day with a custom proposal.";
  }
  if (topic === "team") {
    return "Tell us about your team and we will help you figure out whether the standalone Team tier or a custom Brokerage contract is the right fit.";
  }
  if (topic === "investor") {
    return "We are always happy to talk with investors who focus on California real estate technology or B2B SaaS. Drop a note and we will set up a call.";
  }
  return "Sales questions, partnership ideas, press, or anything else. We are real humans, and a real human will reply.";
}

function TrustItem({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <svg
        className="w-4 h-4 text-emerald-500 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}
