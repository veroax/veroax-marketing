// Preview page, Direction 1: Compass / Sotheby's-style.
//
// Not linked from anywhere on the real site. Routed at
// /preview/homepage-v1 so the founder can see the design rendered
// for real (Tailwind utilities, real fonts, real layout) without
// touching the actual homepage at /.
//
// Hero photo is a hot-linked Unsplash placeholder for the preview
// only. If this direction wins, we'll swap for a licensed or
// commissioned California-property photograph before shipping.

import type { Metadata } from "next";

// noindex so a stray search engine doesn't pick this up.
export const metadata: Metadata = {
  title: "Homepage preview, Compass-style",
  robots: { index: false, follow: false },
};

const PHOTO_URL =
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=2400&q=80&auto=format&fit=crop";

export default function HomepagePreviewV1() {
  return (
    <div className="min-h-screen bg-[#FAF8F2] text-[#0F0E2E]">
      <PreviewBanner />

      {/* ============ HERO ============ */}
      <section className="relative h-[88vh] min-h-[640px] overflow-hidden">
        {/* Photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PHOTO_URL}
          alt="California home"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Legibility gradient, very subtle */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(110deg, rgba(15,14,46,0.78) 0%, rgba(15,14,46,0.55) 38%, rgba(15,14,46,0.10) 70%, rgba(15,14,46,0) 100%)",
          }}
        />

        {/* Nav */}
        <header className="relative z-10 max-w-7xl mx-auto px-8 pt-7 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/final/veroax-lockup-dark.svg"
            alt="Veroax"
            style={{ height: 38 }}
          />
          <nav className="hidden md:flex items-center gap-10 text-[13px] tracking-wide text-white/85">
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#how" className="hover:text-white transition-colors">
              How it works
            </a>
            <a href="#pricing" className="hover:text-white transition-colors">
              Pricing
            </a>
            <a href="#contact" className="hover:text-white transition-colors">
              Contact
            </a>
          </nav>
          <div className="flex items-center gap-5">
            <a
              href="/login"
              className="hidden sm:inline text-[13px] text-white/85 hover:text-white"
            >
              Sign in
            </a>
            <a
              href="#trial"
              className="text-[13px] font-medium bg-[#C9A84C] text-[#0F0E2E] px-5 py-2.5 rounded-sm hover:bg-[#d4b65b] transition-colors"
            >
              Start free report
            </a>
          </div>
        </header>

        {/* Hero copy block, anchored bottom-left */}
        <div className="relative z-10 max-w-7xl mx-auto px-8 absolute bottom-0 left-0 right-0 pb-20">
          <div className="max-w-2xl">
            <p className="text-[11px] tracking-[0.3em] font-medium text-[#C9A84C] uppercase mb-5">
              Disclosure clarity, by document
            </p>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl text-white leading-[1.05] tracking-tight font-semibold mb-7">
              Read every page.<br />
              Surface what matters.
            </h1>
            <p className="text-lg text-white/85 leading-relaxed mb-8 max-w-xl">
              An AI-assisted buyer-side analysis for California
              residential disclosures, severity-rated and ready to
              hand to your client.
            </p>
            <div className="flex flex-wrap items-center gap-5">
              <a
                href="#trial"
                className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#0F0E2E] font-semibold px-7 py-3.5 rounded-sm hover:bg-[#d4b65b] transition-colors text-[15px]"
              >
                Start free report
                <span aria-hidden="true">&rarr;</span>
              </a>
              <a
                href="#sample"
                className="text-[15px] text-white/90 hover:text-white border-b border-white/40 hover:border-white pb-0.5 transition-colors"
              >
                See a sample report
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ============ TRUST LINE ============ */}
      <section className="bg-[#0F0E2E] py-8">
        <div className="max-w-7xl mx-auto px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[#FAF8F2]/70 text-[12px] tracking-[0.18em] uppercase">
          <p>One free report per DRE license</p>
          <p className="hidden sm:block">14 sections, four severities, twelve California markets</p>
          <p>No credit card required</p>
        </div>
      </section>

      {/* ============ THREE VALUE PROPS ============ */}
      <section id="features" className="py-28 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-x-12 gap-y-16">
            {[
              {
                num: "01",
                title: "Reads every page.",
                body:
                  "TDS, SPQ, AVID, NHD, prelim title, HOA bundle, inspections. Native PDF vision, not OCR guesswork. Check-boxes, signatures, severity icons.",
              },
              {
                num: "02",
                title: "Rates every finding.",
                body:
                  "Severity (Critical to Cosmetic), confidence (High to Low), regional cost range. Negotiation leverage you can defend in front of a client.",
              },
              {
                num: "03",
                title: "Delivers a polished PDF.",
                body:
                  "Your name, brokerage, DRE# on the cover. Fourteen sections. Buyer-ready. The kind of document that justifies the buyer agent fee.",
              },
            ].map((v) => (
              <div key={v.num}>
                <p className="text-[11px] tracking-[0.3em] uppercase text-[#C9A84C] font-medium mb-4">
                  {v.num}
                </p>
                <h3 className="text-2xl font-semibold tracking-tight mb-3">
                  {v.title}
                </h3>
                <p className="text-[15px] text-[#4A4A4A] leading-relaxed">
                  {v.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SAMPLE TEASE ============ */}
      <section id="sample" className="py-24 px-8 bg-white border-t border-[#E5E0D2]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-12 gap-12 items-start">
            <div className="md:col-span-5">
              <p className="text-[11px] tracking-[0.3em] uppercase text-[#C9A84C] font-medium mb-5">
                Sample report
              </p>
              <h2 className="text-4xl font-semibold tracking-tight leading-tight mb-6">
                The document your client actually reads.
              </h2>
              <p className="text-[15px] text-[#4A4A4A] leading-relaxed mb-8">
                Every report ships as a branded PDF on your letterhead.
                Fourteen sections, four severity levels, one overall
                rating. The sample on the right is a fictional property,
                used for illustration only.
              </p>
              <a
                href="#sample-full"
                className="inline-flex items-center gap-2 text-[#0F0E2E] font-medium border-b border-[#C9A84C] pb-0.5 hover:text-[#C9A84C] transition-colors"
              >
                Open the full sample
                <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
            <div className="md:col-span-7">
              <div className="aspect-[8.5/11] bg-[#FAF8F2] border border-[#C8C8DC] shadow-2xl p-10 text-sm">
                <p className="text-[10px] tracking-[0.3em] uppercase text-[#C9A84C] font-bold mb-2">
                  Disclosure Analysis Report, Fictional Sample
                </p>
                <h3 className="text-2xl text-[#191970] font-semibold tracking-tight mb-1">
                  123 Example Drive, Sample City, CA 95000
                </h3>
                <p className="text-xs text-[#4A4A4A] mb-6">
                  SFR &middot; 1962 &middot; 1,650 sqft &middot; 3 bed / 2 bath
                </p>
                <div className="h-px bg-[#C8C8DC] mb-6" />

                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#C9A84C] bg-[#191970] px-3 py-1.5">
                    Section 4
                  </span>
                  <p className="text-[#191970] font-bold tracking-tight">
                    Critical &amp; High-Priority Findings
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="border border-[#C8C8DC] bg-white p-3 flex items-start justify-between gap-3">
                    <span className="font-semibold text-[#191970]">
                      1. Unpermitted garage conversion
                    </span>
                    <span className="text-[10px] font-bold text-white bg-[#7A2E2E] px-2.5 py-1 uppercase tracking-wide whitespace-nowrap">
                      Critical
                    </span>
                  </div>
                  <div className="border border-[#C8C8DC] bg-white p-3 flex items-start justify-between gap-3">
                    <span className="font-semibold text-[#191970]">
                      2. Active roof leak in master bedroom
                    </span>
                    <span className="text-[10px] font-bold text-white bg-[#7A2E2E] px-2.5 py-1 uppercase tracking-wide whitespace-nowrap">
                      Critical
                    </span>
                  </div>
                  <div className="border border-[#C8C8DC] bg-white p-3 flex items-start justify-between gap-3">
                    <span className="font-semibold text-[#191970]">
                      3. Federal Pacific Stab-Lok panel
                    </span>
                    <span className="text-[10px] font-bold text-white bg-[#8B5A2B] px-2.5 py-1 uppercase tracking-wide whitespace-nowrap">
                      High
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[#C8C8DC] flex items-center justify-between text-xs">
                  <span className="text-[#4A4A4A]">Total exposure</span>
                  <span className="text-[#191970] font-bold">
                    $39,700 to $81,500
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER NOTE ============ */}
      <section className="py-12 px-8 bg-[#0F0E2E] text-[#FAF8F2]/70 text-sm text-center">
        Preview only. The real footer + pricing + contact sections
        would mirror what's on the live homepage.
      </section>
    </div>
  );
}

function PreviewBanner() {
  return (
    <div className="bg-amber-400 text-[#0F0E2E] text-xs font-semibold px-6 py-2 flex items-center justify-between gap-4 sticky top-0 z-50">
      <span>
        Preview, Direction 1, Compass / Sotheby's-style. Not the real
        homepage.
      </span>
      <div className="flex items-center gap-3">
        <a href="/preview/homepage-v2" className="underline underline-offset-2">
          View Direction 2 (Editorial)
        </a>
        <a href="/" className="underline underline-offset-2">
          Back to live homepage
        </a>
      </div>
    </div>
  );
}
