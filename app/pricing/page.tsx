import Link from "next/link";
import { PLAN_TIERS, ONEOFF_REPORT_PRICE_USD } from "@/lib/billing/plans";

import { SUPPORT } from "@/lib/site";
export const metadata = {
  title: "Pricing, Veroax",
  description:
    "Per-deal pricing for AI-powered California disclosure analysis. Solo agents, busy producers, and brokerages.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header strip. Minimal, no nav, to match the marketing-site
          pattern. Uses the light-variant lockup (dark text on light
          bg) since the strip itself is white. */}
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

      <main className="max-w-6xl mx-auto px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <p className="text-xs font-bold tracking-widest text-amber-600 uppercase">
            Pricing
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3">
            One report per deal. Pay only for what you actually use.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 mt-4 leading-relaxed">
            Veroax analyses include unlimited document re-runs within
            30 days, the live dashboard view, and a downloadable PDF
            for offline reference. Cancel or change tiers anytime.
          </p>
        </div>

        {/* Plan cards. The Brokerage tier is custom-priced, so its
            card swaps the dollar amount for "Custom pricing" and the
            CTA links to the support mailto. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 mb-12">
          {PLAN_TIERS.map((tier) => (
            <article
              key={tier.id}
              className={
                tier.highlight
                  ? "bg-white rounded-2xl border-2 border-indigo-600 shadow-lg p-6 sm:p-8 relative"
                  : "bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8"
              }
            >
              {tier.highlight ? (
                <p className="absolute -top-3 left-6 bg-indigo-600 text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded">
                  Most popular
                </p>
              ) : null}
              <h2 className="text-xl font-bold text-slate-900">{tier.label}</h2>
              <p className="text-sm text-slate-500 mt-1">{tier.tagline}</p>
              {tier.isCustom ? (
                <div className="mt-5">
                  <span className="text-2xl font-bold text-slate-900">
                    Contact for details
                  </span>
                  <p className="text-xs text-slate-500 mt-1">
                    Per-brokerage contract; site-admin onboarded.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-5">
                    <span className="text-4xl font-bold text-slate-900">
                      ${tier.priceMonthlyUsd}
                    </span>
                    <span className="text-sm text-slate-500"> /month</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    or ${tier.priceAnnualUsd}/year ·{" "}
                    {Math.round(
                      ((tier.priceMonthlyUsd * 12 - tier.priceAnnualUsd) /
                        (tier.priceMonthlyUsd * 12)) *
                        100,
                    )}
                    % off
                  </p>
                </>
              )}
              <ul className="mt-6 space-y-2.5">
                {tier.features.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-700"
                  >
                    <span className="text-emerald-600 shrink-0 mt-0.5">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 space-y-2">
                {tier.isCustom ? (
                  <a
                    href={`mailto:${SUPPORT.email}?subject=Brokerage%20tier%20inquiry`}
                    className="block w-full text-center bg-slate-900 text-white font-semibold py-3 rounded-lg hover:bg-slate-800"
                  >
                    Contact for details
                  </a>
                ) : (
                  <>
                    <a
                      href={`/api/checkout?plan=${tier.id}&billing=monthly`}
                      className={
                        tier.highlight
                          ? "block w-full text-center bg-indigo-700 text-white font-semibold py-3 rounded-lg hover:bg-indigo-600"
                          : "block w-full text-center bg-slate-900 text-white font-semibold py-3 rounded-lg hover:bg-slate-800"
                      }
                    >
                      Start {tier.label}, ${tier.priceMonthlyUsd}/mo
                    </a>
                    <a
                      href={`/api/checkout?plan=${tier.id}&billing=annual`}
                      className="block w-full text-center bg-white border border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-50"
                    >
                      Annual, save ~17%
                    </a>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>

        {/* Pay-as-you-go + free-trial strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 mb-12">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-bold text-slate-900">
              Just trying it out?
            </h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              New accounts get one free analysis on us, full quality,
              no watermark. Run a real deal through Veroax before you
              commit to a plan. After that, paid tiers gate by how
              many analyses you run per month.
            </p>
            <Link
              href="/signup"
              className="inline-block mt-5 text-indigo-700 font-semibold underline underline-offset-2"
            >
              Create a free account →
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-bold text-slate-900">
              Pay per report
            </h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Don&apos;t want a subscription? Buy a single full-quality
              report for{" "}
              <span className="font-bold text-slate-900">
                ${ONEOFF_REPORT_PRICE_USD}
              </span>
              . Credits don&apos;t expire and stack with anything else
              on your account.
            </p>
            <a
              href="/api/checkout?plan=oneoff"
              className="inline-block mt-5 text-indigo-700 font-semibold underline underline-offset-2"
            >
              Buy one report, ${ONEOFF_REPORT_PRICE_USD} →
            </a>
          </div>
        </div>

        {/* Trust strip */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-4">
            What every plan includes
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                30-day free re-analysis window, add documents or
                re-run on the same deal without consuming another
                credit
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                Live dashboard view, mobile-friendly, available on
                every device you use during the deal
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                Branded PDF with your photo, brokerage, and DRE for
                offline review, printing, or your records
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                Click-to-source on every finding, open the underlying
                disclosure PDF at the cited page
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                Live mortgage-rate + comp data baked into the Market
                Context section, refreshed per run
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                California-tuned analyzer with always-Critical rules
                for FPE panels, polybutylene, lead paint, asbestos,
                and more
              </span>
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-500 mt-8 text-center max-w-2xl mx-auto">
          Prices in USD. California sales tax applied where applicable.
          Subscriptions auto-renew at the listed rate; cancel anytime
          from the Billing dashboard. Reports outside the 30-day free-
          update window consume a new credit; admin grants and refunds
          appear in your billing ledger.
        </p>
      </main>
    </div>
  );
}
