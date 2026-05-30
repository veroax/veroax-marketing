// Investors page. Lightweight overview of the business + a contact
// pathway for prospective investors. Not designed as a pitch deck;
// the goal is to capture interest and route the conversation to a
// real human via the /contact form.

import Link from "next/link";

import { SUPPORT } from "@/lib/site";
export const metadata = {
  title: "Investors, Veroax",
  description:
    "Veroax is building AI-assisted disclosure analysis for California real estate agents. Overview, traction, and how to get in touch.",
};

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top strip mirrors /pricing and /contact for consistency. */}
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
        {/* Hero */}
        <div className="max-w-3xl mb-12 sm:mb-14">
          <p className="text-xs font-bold tracking-widest text-amber-600 uppercase">
            Investors
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3">
            AI-assisted disclosure analysis for California real estate.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 mt-4 leading-relaxed">
            Veroax turns a disclosure package (TDS, SPQ, NHD, inspection
            reports, HOA docs) into a clear, branded 14-section analysis
            in minutes. Agents use it to prepare offers and walk their
            buyers through the package. We sell to licensed agents one
            seat at a time, to small teams that pool a shared quota,
            and to brokerages on custom contracts.
          </p>
        </div>

        {/* What we do */}
        <section className="grid md:grid-cols-3 gap-5 sm:gap-6 mb-12">
          <Card
            label="The problem"
            body="A typical California disclosure package runs hundreds of pages of dense, mixed-quality documents. Agents spend hours per deal trying to surface the material findings before they sit down with their buyer, and they still miss things."
          />
          <Card
            label="What Veroax does"
            body="Veroax reads the package end-to-end and produces a defensible analysis: critical findings up top, source citations on every claim, click-to-source back to the original page. The agent uses the analysis on the dashboard as the spine of their offer prep and their conversation with their buyer. A branded PDF is available for offline reference."
          />
          <Card
            label="Why now"
            body="Long-context AI models can finally read 300-page packages in one pass with high reliability. Disclosure obligations are tightening. Agents are eager for any tool that protects them from missed-disclosure liability and makes them look thorough on every deal, especially newer agents and out-of-state buyer pipelines."
          />
        </section>

        {/* Traction / what we are building */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-12">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Where we are
          </h2>
          <ul className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <li className="flex items-start gap-3">
              <Check />
              <span>
                Live product in private beta with California agents.
                Real analyses running on real California disclosure
                packages today.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Check />
              <span>
                Four-tier pricing ladder: pay-as-you-go, Solo, Pro,
                Team, and custom Brokerage contracts. Stripe-native
                self-serve checkout for the first three; Brokerage is
                site-admin onboarded with negotiated allocation.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Check />
              <span>
                First brokerage signed for paid pilot. Team + brokerage
                management surfaces (multi-agent dashboards, shared
                quotas, white-label branding) live in product.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Check />
              <span>
                California-first by design (statutes, forms, market
                pricing baselines). Architecture supports clean expansion
                to Texas, Florida, and Washington once we are ready.
              </span>
            </li>
          </ul>
        </section>

        {/* Market */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-12">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Market shape
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed mb-3">
            California has roughly 200,000 active real estate licensees
            and hundreds of brokerages. Every closed buyer-side
            transaction generates a disclosure package that needs
            review; that is a recurring, deal-by-deal need rather than
            a one-time sale.
          </p>
          <p className="text-sm text-slate-700 leading-relaxed">
            Beyond California, the same problem shape exists in every
            major US real estate market. The expansion path is
            jurisdiction-by-jurisdiction (each state has its own
            forms and statutes); the core analyzer + product surface
            transfers cleanly.
          </p>
        </section>

        {/* Founder */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-12">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Founder
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Veroax is founded and operated by Michael Fielden, a
            California real estate licensee and software founder with
            a long background in B2B SaaS and small-team
            infrastructure. The product is built in-house in Santa
            Clara, California.
          </p>
        </section>

        {/* CTA strip */}
        <section className="bg-indigo-950 rounded-2xl p-6 sm:p-10 text-center text-white">
          <h2 className="text-2xl font-bold">
            Interested in learning more?
          </h2>
          <p className="text-indigo-200 mt-3 max-w-xl mx-auto leading-relaxed">
            We share metrics, financials, and product roadmap with
            investors under a brief mutual NDA. Send a note and we
            will set up a call.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contact?topic=investor"
              className="inline-block bg-amber-400 text-indigo-950 font-semibold px-6 py-3 rounded-lg hover:bg-amber-300 shadow-lg shadow-amber-400/20"
            >
              Open the investor contact form
            </Link>
            <a
              href={`tel:${SUPPORT.phoneTel}`}
              className="inline-block bg-white/10 text-white font-semibold px-6 py-3 rounded-lg hover:bg-white/15"
              aria-label={`Call Veroax at ${SUPPORT.phone}`}
            >Call {SUPPORT.phone}</a>
          </div>
          <p className="text-indigo-300 text-xs mt-5">
            Calls monitored 8:00 AM to 8:00 PM Pacific, every day.
          </p>
        </section>

        {/* Forward-looking statement disclaimer. Required-feeling not
            because of any specific regulator on us yet, but because
            anything investor-facing benefits from making it clear
            this is not an offer to sell securities. */}
        <p className="text-[11px] text-slate-500 mt-10 leading-relaxed max-w-3xl mx-auto">
          This page is informational only and does not constitute an
          offer to sell, or a solicitation of an offer to buy, any
          securities. Any securities offering will be made only
          pursuant to a definitive offering document and applicable
          exemptions from registration.
        </p>
      </main>
    </div>
  );
}

function Card({ label, body }: { label: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <p className="text-[10px] font-bold tracking-widest text-amber-600 uppercase mb-2">
        {label}
      </p>
      <p className="text-sm text-slate-700 leading-relaxed">{body}</p>
    </div>
  );
}

function Check() {
  return (
    <svg
      className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
