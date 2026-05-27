"use client";

// Client island that holds the pricing toggle, plan cards, the free
// trial banner CTA, the high-volume upsell, and the contact form.
// All the interactive state on the landing page lives here so the
// rest of the page (hero, features, how-it-works, stats, footer) can
// render as a server component and ship zero JS for those sections.
//
// The plan cards are derived from PLAN_TIERS (lib/billing/plans.ts)
// via planTierToHomepagePlan() so the homepage and /pricing read
// from one source. The adapter expands the homepage's richer shape
// (monthly/annual price points with savings labels, per-report copy,
// CTA wording, badge) on top of the lean PLAN_TIERS struct.

import { useState, FormEvent } from "react";
import { PLAN_TIERS, type PlanTier } from "@/lib/billing/plans";

type PricePoint = {
  price: string;
  billed: string | null;
  savings: string | null;
};

type Plan = {
  // PlanId from PLAN_TIERS, drives checkout-link routing.
  id: PlanTier["id"];
  // Display label ("Solo", "Professional", "Team", "Brokerage").
  name: string;
  pricing: { monthly: PricePoint; annual: PricePoint };
  period: string;
  perReport: string;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
  badge: string | null;
  // True when this is the custom-priced Brokerage tier (no checkout).
  isCustom: boolean;
};

// Render-friendly USD with thousands separators.
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

// Compute the homepage's richer plan shape from a PLAN_TIERS row.
// Pure function, easy to unit-test if we ever want to.
function planTierToHomepagePlan(tier: PlanTier): Plan {
  if (tier.isCustom) {
    return {
      id: tier.id,
      name: tier.label,
      pricing: {
        monthly: { price: "Contact for details", billed: null, savings: null },
        annual: { price: "Contact for details", billed: null, savings: null },
      },
      period: "",
      perReport: "Custom per-brokerage contract",
      description: tier.tagline,
      features: tier.features,
      cta: "Contact for details",
      highlighted: Boolean(tier.highlight),
      badge: null,
      isCustom: true,
    };
  }

  // Annual prepay savings vs. paying monthly for 12 months. Rounded
  // to the nearest dollar and presented as a "Save $X" badge.
  const monthlyTotal = tier.priceMonthlyUsd * 12;
  const annualSavings = Math.max(0, monthlyTotal - tier.priceAnnualUsd);
  const annualMonthlyEquivalent = Math.round(tier.priceAnnualUsd / 12);

  // Per-report copy. The Professional tier traditionally shows the
  // effective per-report cost when the included quota is fully used,
  // which is the strongest pricing argument. For the others we just
  // restate the included + overage to avoid making the math feel
  // forced ("works out to $14.97 each" sounds promotional in a way
  // that doesn't fit Solo or Team's positioning).
  let perReport: string;
  if (tier.id === "pro") {
    const effective = (
      tier.priceMonthlyUsd / tier.reportsIncluded
    ).toFixed(2);
    perReport = `${tier.reportsIncluded} reports included, works out to $${effective} each`;
  } else {
    perReport = `${tier.reportsIncluded} report${tier.reportsIncluded === 1 ? "" : "s"} included, $${tier.overageUsd} per additional`;
  }

  return {
    id: tier.id,
    name: tier.label,
    pricing: {
      monthly: { price: usd(tier.priceMonthlyUsd), billed: null, savings: null },
      annual: {
        price: usd(annualMonthlyEquivalent),
        billed: `${usd(tier.priceAnnualUsd)} billed annually`,
        savings: annualSavings > 0 ? `Save ${usd(annualSavings)}` : null,
      },
    },
    period: "/month",
    perReport,
    description: tier.tagline,
    features: tier.features,
    cta: `Choose ${tier.label}`,
    highlighted: Boolean(tier.highlight),
    badge: tier.highlight ? "Most Popular" : null,
    isCustom: false,
  };
}

const plans: Plan[] = PLAN_TIERS.map(planTierToHomepagePlan);

export default function PricingAndContact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  function handlePlanSelect(planName: string, period: "monthly" | "annual") {
    let message: string;
    if (planName === "Brokerage") {
      message =
        "I'd like to talk about a custom Brokerage plan for our office.";
    } else if (planName === "Free trial") {
      message = "I'd like to claim my free DRE-verified disclosure report.\n\nMy California DRE license number is: ";
    } else if (planName === "High volume") {
      message = "I run 15+ disclosure reports a month and would like to talk about a team / volume plan.";
    } else {
      const billingLabel = period === "annual" ? "annual" : "monthly";
      message = `I'd like to sign up for the ${planName} plan (${billingLabel} billing).`;
    }
    setForm((prev) => ({ ...prev, message }));
    setStatus("idle");
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  function resetAndSendAnother() {
    setForm({ name: "", email: "", message: "" });
    setStatus("idle");
    setErrorMsg("");
  }

  return (
    <>
      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-gradient-to-b from-white to-indigo-50/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <span className="inline-block bg-indigo-100 text-indigo-700 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full">
              Pricing
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              Pricing that pays for itself on the first transaction
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto text-base leading-relaxed">
              A Veroax report replaces 3 to 5 hours of agent or paralegal disclosure review per
              deal, at a defensible quality level the buyer can hold in their hands. Start with
              one free report, then pick the plan that fits your volume.
            </p>
          </div>

          {/* Free Trial Banner */}
          <div
            id="free-trial"
            className="relative overflow-hidden rounded-2xl mb-12 p-8 sm:p-10 text-white"
            style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4f46e5 100%)" }}
          >
            {/* Glow */}
            <div
              className="absolute -top-24 -right-24 w-[300px] h-[300px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(251,191,36,0.20) 0%, transparent 70%)" }}
            />
            <div className="absolute -bottom-24 -left-24 w-[300px] h-[300px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)" }} />
            <div className="relative grid sm:grid-cols-[1fr_auto] items-center gap-6">
              <div className="space-y-3">
                <span className="inline-block bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  New agents start here
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold leading-tight">
                  Try Veroax free with your first report
                </h3>
                <p className="text-indigo-200 text-sm sm:text-base leading-relaxed max-w-xl">
                  Upload a real disclosure package and see the full 14-section analysis before
                  you pay anything. Verified by your California DRE license number. One trial
                  per agent. No credit card required.
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-xs text-indigo-200">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    DRE-verified
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    No credit card
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Full branded PDF
                  </span>
                </div>
              </div>
              <div className="sm:text-right">
                <a
                  href="#contact"
                  onClick={() => handlePlanSelect("Free trial", billingPeriod)}
                  className="inline-block bg-amber-400 text-indigo-950 font-semibold px-7 py-3.5 rounded-lg hover:bg-amber-300 transition-colors text-base shadow-lg shadow-amber-400/20 whitespace-nowrap"
                >
                  Claim your free report
                </a>
                <p className="text-xs text-indigo-300 mt-3">Takes about 60 seconds to request</p>
              </div>
            </div>
          </div>

          {/* Billing period toggle */}
          <div className="flex justify-center mb-12">
            <div
              role="tablist"
              aria-label="Billing period"
              className="inline-flex items-center p-1 bg-indigo-100 rounded-full shadow-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={billingPeriod === "monthly"}
                onClick={() => setBillingPeriod("monthly")}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  billingPeriod === "monthly"
                    ? "bg-white text-indigo-950 shadow-sm"
                    : "text-indigo-700 hover:text-indigo-900"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={billingPeriod === "annual"}
                onClick={() => setBillingPeriod("annual")}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                  billingPeriod === "annual"
                    ? "bg-white text-indigo-950 shadow-sm"
                    : "text-indigo-700 hover:text-indigo-900"
                }`}
              >
                Annual
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                  Save 2 months
                </span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 items-stretch">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? "bg-white border-2 border-amber-400 shadow-2xl shadow-amber-400/15 md:-translate-y-2"
                    : "bg-white border border-indigo-100 shadow-sm"
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-indigo-950 text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md whitespace-nowrap">
                    {plan.badge}
                  </span>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-indigo-950 mb-3">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-5xl font-bold bg-gradient-to-r from-indigo-600 to-amber-500 bg-clip-text text-transparent">
                      {plan.pricing[billingPeriod].price}
                    </span>
                    {plan.period && (
                      <span className="text-gray-500 text-sm font-medium">{plan.period}</span>
                    )}
                  </div>
                  <div className="min-h-[1.5rem] mb-2 flex items-center gap-2 flex-wrap">
                    {plan.pricing[billingPeriod].billed && (
                      <span className="text-xs text-gray-500">
                        {plan.pricing[billingPeriod].billed}
                      </span>
                    )}
                    {plan.pricing[billingPeriod].savings && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {plan.pricing[billingPeriod].savings}
                      </span>
                    )}
                  </div>
                  {plan.perReport && (
                    <p className="text-xs text-indigo-600 font-medium mb-3 min-h-[2rem]">
                      {plan.perReport}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 leading-relaxed min-h-[3rem]">
                    {plan.description}
                  </p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <svg
                        className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0"
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
                      <span className="leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.isCustom ? (
                  // Brokerage tier: route to the standalone /contact
                  // page (richer than the inline general-info form
                  // and prominently features phone + hours). The
                  // ?topic=brokerage param drives the page's
                  // prefilled subject + body.
                  <a
                    href="/contact?topic=brokerage"
                    className={`block text-center font-semibold px-6 py-3 rounded-lg transition-colors ${
                      plan.highlighted
                        ? "bg-amber-400 text-indigo-950 hover:bg-amber-300 shadow-lg shadow-amber-400/20"
                        : "bg-indigo-950 text-white hover:bg-indigo-900"
                    }`}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <a
                    href={`/api/checkout?plan=${plan.id}&billing=${billingPeriod}`}
                    className={`block text-center font-semibold px-6 py-3 rounded-lg transition-colors ${
                      plan.highlighted
                        ? "bg-amber-400 text-indigo-950 hover:bg-amber-300 shadow-lg shadow-amber-400/20"
                        : "bg-indigo-950 text-white hover:bg-indigo-900"
                    }`}
                  >
                    {plan.cta}
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* High-volume upsell. Routes to the dedicated /contact
              page so brokerage inquiries land on the polished
              phone-and-hours surface instead of the inline general
              info form. */}
          <div className="mt-10 max-w-2xl mx-auto rounded-xl border border-amber-200 bg-amber-50/70 p-5 text-center">
            <p className="text-sm text-amber-900 leading-relaxed">
              <span className="font-semibold">Running an entire office?</span>{" "}
              <a
                href="/contact?topic=brokerage"
                className="font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-800"
              >
                Talk to us about a Brokerage plan
              </a>
              . Custom allocation for unlimited teams and agents under
              one contract.
            </p>
          </div>

          <div className="mt-10 grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto text-center text-xs text-gray-500">
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <span>Every plan includes the full 14-section analysis</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>PII purged after every report. Privacy by design.</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Agent QA spot-check before every delivery</span>
            </div>
          </div>

          <p className="text-center text-xs text-gray-500 mt-8 max-w-2xl mx-auto">
            By subscribing, you agree to our{" "}
            <a
              href="/terms"
              className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
            >
              Privacy Policy
            </a>
            .
          </p>

          <p className="text-center text-xs text-gray-400 mt-3 max-w-2xl mx-auto">
            Pricing in USD. Free trial is one report per California DRE license number. No credit card required. Annual prepay saves two months on Solo, Professional, and Team. Brokerage pricing is custom; contact sales for a tailored quote.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section
        id="contact"
        className="relative overflow-hidden text-white py-24 px-6"
        style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #1e1b4b 50%, #312e81 100%)" }}
      >
        {/* Dot grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* Glow */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(251,191,36,0.12) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)" }} />

        <div className="relative max-w-2xl mx-auto">
          <div className="text-center mb-10 space-y-3">
            <span className="inline-block bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full">
              Get in touch
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold">Be the first to know</h2>
            <p className="text-indigo-200 text-base leading-relaxed">
              Veroax is launching first in California, with Florida, Texas, and Washington state close
              behind. If you work with buyers in any of those markets and want to offer a sharper due
              diligence experience, send us a message and we will be in touch.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-2 pt-3 text-sm text-indigo-200">
              <a
                href="tel:+18662478833"
                className="hover:text-white transition-colors"
                aria-label="Call Veroax support at 866 247 8833"
              >
                <span className="font-semibold text-amber-300" aria-hidden="true">(866) AISTUFF</span>
                <span className="text-indigo-400 mx-2" aria-hidden="true">·</span>
                <span>(866) 247-8833</span>
              </a>
              <span className="hidden sm:inline text-indigo-500" aria-hidden="true">|</span>
              <span>3964 Rivermark Plaza, Unit #2783, Santa Clara, CA 95054</span>
            </div>
          </div>

          {status === "success" ? (
            <div className="text-center space-y-4">
              <p className="text-amber-400 font-medium text-lg">
                Message sent. We will be in touch shortly.
              </p>
              <button
                type="button"
                onClick={resetAndSendAnother}
                className="text-sm text-indigo-200 hover:text-white underline underline-offset-2"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-indigo-200 mb-1.5">
                    Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Jane Smith"
                    className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-3 text-sm text-white placeholder-indigo-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 backdrop-blur-sm"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-indigo-200 mb-1.5">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="jane@brokerage.com"
                    className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-3 text-sm text-white placeholder-indigo-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 backdrop-blur-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-indigo-200 mb-1.5">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={5}
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell us about your market and what you're looking for..."
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-3 text-sm text-white placeholder-indigo-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 backdrop-blur-sm resize-none"
                />
              </div>
              {status === "error" && (
                <p className="text-red-400 text-sm">{errorMsg}</p>
              )}
              <div className="text-right">
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="rounded-lg bg-amber-400 text-indigo-950 px-7 py-3 text-sm font-semibold hover:bg-amber-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-amber-400/20"
                >
                  {status === "sending" ? "Sending..." : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
