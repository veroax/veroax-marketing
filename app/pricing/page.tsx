import Link from "next/link";
import { PLAN_TIERS, ONEOFF_REPORT_PRICE_USD } from "@/lib/billing/plans";

export const metadata = {
  title: "Pricing — Veroax",
  description:
    "Per-deal pricing for AI-powered California disclosure analysis. Solo agents, busy producers, and brokerages.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header strip — minimal, no nav to match the marketing site
          pattern. Logo links to home. */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-slate-900">
            Veroax
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
            30 days, the public buyer-facing web report, and a
            branded PDF download. Cancel or change tiers anytime.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 mb-12">
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
                <a
                  href={`/api/checkout?plan=${tier.id}&billing=monthly`}
                  className={
                    tier.highlight
                      ? "block w-full text-center bg-indigo-700 text-white font-semibold py-3 rounded-lg hover:bg-indigo-600"
                      : "block w-full text-center bg-slate-900 text-white font-semibold py-3 rounded-lg hover:bg-slate-800"
                  }
                >
                  Start {tier.label} — ${tier.priceMonthlyUsd}/mo
                </a>
                <a
                  href={`/api/checkout?plan=${tier.id}&billing=annual`}
                  className="block w-full text-center bg-white border border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg text-sm hover:bg-slate-50"
                >
                  Annual — save ~17%
                </a>
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
              New accounts get one free analysis on us. The PDF is
              watermarked so you can&apos;t hand it to a client until
              you subscribe, but the dashboard view + the on-page
              talking points are full quality so you can see exactly
              what you&apos;d be buying.
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
              Buy one report — ${ONEOFF_REPORT_PRICE_USD} →
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
                30-day free re-analysis window — add documents or
                re-run on the same deal without consuming another
                credit
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                Public, mobile-friendly web report you can text to
                your buyer at <span className="font-mono">/r/&#123;code&#125;</span>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                Branded PDF with your photo, brokerage logo, DRE #,
                and signature
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>
                Click-to-source on every finding — open the underlying
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
