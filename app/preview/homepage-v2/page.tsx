// Preview page, Direction 2: Editorial / WSJ Real Estate-style.
//
// Not linked from anywhere on the real site. Routed at
// /preview/homepage-v2 so the founder can see the design rendered
// for real (Tailwind utilities, real fonts, real layout) without
// touching the actual homepage at /.
//
// Typographic, document-credible. Almost zero photography or
// gradients. The page itself feels like the kind of report Veroax
// produces.

import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Homepage preview, Editorial-style",
  robots: { index: false, follow: false },
};

export default function HomepagePreviewV2() {
  return (
    <div
      className={`${serif.variable} min-h-screen bg-[#FAF8F2] text-[#0F0E2E]`}
    >
      <PreviewBanner />

      {/* ============ NAV (thin, type-only) ============ */}
      <header className="border-b-2 border-[#0F0E2E] bg-[#FAF8F2]">
        <div className="max-w-6xl mx-auto px-8 h-20 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/final/veroax-lockup-light.svg"
            alt="Veroax"
            style={{ height: 42 }}
          />
          <nav className="hidden md:flex items-center gap-9 text-[11px] tracking-[0.18em] uppercase font-semibold text-[#0F0E2E]">
            <a href="#features" className="hover:text-[#C9A84C] transition-colors">
              Features
            </a>
            <a href="#how" className="hover:text-[#C9A84C] transition-colors">
              How it works
            </a>
            <a href="#pricing" className="hover:text-[#C9A84C] transition-colors">
              Pricing
            </a>
            <a href="#contact" className="hover:text-[#C9A84C] transition-colors">
              Contact
            </a>
          </nav>
          <div className="flex items-center gap-5">
            <a
              href="/login"
              className="hidden sm:inline text-[12px] tracking-wider uppercase text-[#0F0E2E] hover:text-[#C9A84C]"
            >
              Sign in
            </a>
            <a
              href="#trial"
              className="text-[11px] tracking-[0.18em] uppercase font-bold bg-[#0F0E2E] text-[#FAF8F2] px-4 py-2.5 hover:bg-[#191970] transition-colors"
            >
              Start free report
            </a>
          </div>
        </div>
      </header>

      {/* ============ HERO (typographic) ============ */}
      <section className="border-b border-[#0F0E2E]/15">
        <div className="max-w-3xl mx-auto px-8 py-24 text-center">
          <p
            className="text-[10px] tracking-[0.35em] uppercase font-bold text-[#C9A84C] mb-10"
            style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
          >
            Vol. I &middot; Disclosure analysis, for California
          </p>

          <h1
            className="text-5xl sm:text-6xl lg:text-7xl text-[#0F0E2E] leading-[1.04] tracking-tight mb-9"
            style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 600 }}
          >
            Every page of every disclosure,
            <br />
            <em className="text-[#C9A84C] font-normal italic">read closely</em>,
            <br />
            delivered as a PDF.
          </h1>

          <p
            className="text-lg text-[#3A3A3A] leading-relaxed max-w-2xl mx-auto mb-10"
            style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
          >
            Veroax turns a California residential disclosure package
            into a polished, fourteen-section buyer report in
            minutes. Severity-rated findings, regional cost
            estimates, negotiation guidance, and an overall property
            rating, grounded in what the documents actually say.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <a
              href="#trial"
              className="inline-flex items-center gap-2 bg-[#0F0E2E] text-[#FAF8F2] font-semibold px-7 py-3.5 hover:bg-[#191970] transition-colors text-[14px] tracking-wide"
            >
              Start free report
              <span aria-hidden="true">&rarr;</span>
            </a>
            <a
              href="#sample"
              className="text-[14px] text-[#0F0E2E] border-b border-[#C9A84C] hover:text-[#C9A84C] pb-0.5 transition-colors tracking-wide"
            >
              Read a sample report
            </a>
          </div>

          <p
            className="text-[11px] tracking-[0.18em] uppercase text-[#4A4A4A] mt-10"
            style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
          >
            One free report per DRE license, no credit card required
          </p>
        </div>
      </section>

      {/* ============ STATS STRIP (newsprint-style) ============ */}
      <section className="border-b border-[#0F0E2E]/15 bg-[#F2EDDE]">
        <div className="max-w-5xl mx-auto px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-y-6 divide-x divide-[#0F0E2E]/15">
          {[
            { value: "14", label: "Sections per report" },
            { value: "4", label: "Severity levels" },
            { value: "12+", label: "California markets" },
            { value: "7 yr", label: "Audit log retention" },
          ].map((s, i) => (
            <div key={s.label} className={i === 0 ? "" : "pl-8 md:pl-12"}>
              <p
                className="text-5xl text-[#0F0E2E] tracking-tight"
                style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 600 }}
              >
                {s.value}
              </p>
              <p
                className="text-[10px] tracking-[0.22em] uppercase font-bold text-[#4A4A4A] mt-2"
                style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ WHAT THE REPORT COVERS (TOC-style) ============ */}
      <section id="features" className="border-b border-[#0F0E2E]/15">
        <div className="max-w-5xl mx-auto px-8 py-20">
          <div className="grid md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <p
                className="text-[10px] tracking-[0.3em] uppercase font-bold text-[#C9A84C] mb-4"
                style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
              >
                What's in every report
              </p>
              <h2
                className="text-4xl text-[#0F0E2E] tracking-tight leading-tight"
                style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 600 }}
              >
                Fourteen sections, no shortcuts.
              </h2>
              <p
                className="text-[15px] text-[#4A4A4A] leading-relaxed mt-5"
                style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
              >
                Each section answers a question the buyer is going to
                ask. The agent reviews the structured summary before
                anything reaches the client.
              </p>
            </div>
            <div className="md:col-span-8">
              <ul className="divide-y divide-[#0F0E2E]/15">
                {[
                  ["I", "Property Snapshot", "Address, year built, square footage, MLS#, list price."],
                  ["II", "Document Inventory", "Every file in the package, dated, with a status tag."],
                  ["III", "Executive Summary", "The agent's pre-call read, in two paragraphs."],
                  ["IV", "Critical and High-Priority Findings", "What requires action before contingency removal."],
                  ["V", "Moderate Concerns", "Items to negotiate as credits or pre-close repairs."],
                  ["VI", "Cosmetic Notes", "Smaller fit-and-finish items, optional."],
                  ["VII", "Environmental and Hazard Assessment", "Zones, dry-cleaner cases, airport overlay."],
                  ["VIII", "HOA Financial Health", "Reserves, special assessments, master insurance."],
                  ["IX", "Permits and Compliance", "What's permitted, what's not, what to research."],
                  ["X", "Cost Summary", "Buyer out-of-pocket exposure, in ranges."],
                  ["XI", "Title and Vesting", "How the unit is vested, liens, recorded matters."],
                  ["XII", "Negotiation Leverage", "What to ask for, with anchors."],
                  ["XIII", "Market Context", "Where the listing sits, with comps."],
                  ["XIV", "Overall Property Rating", "One word, plus the why and the conditions."],
                ].map(([num, title, desc]) => (
                  <li
                    key={num}
                    className="grid grid-cols-[40px_1fr] sm:grid-cols-[60px_1fr_2fr] gap-x-4 py-3.5 items-baseline"
                  >
                    <span
                      className="text-[#C9A84C] font-bold text-[12px] tracking-[0.18em]"
                      style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
                    >
                      {num}
                    </span>
                    <span
                      className="text-[#0F0E2E] font-semibold text-[15px]"
                      style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
                    >
                      {title}
                    </span>
                    <span
                      className="hidden sm:block text-[14px] text-[#4A4A4A] leading-snug"
                      style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
                    >
                      {desc}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SAMPLE TEASE ============ */}
      <section id="sample" className="border-b border-[#0F0E2E]/15">
        <div className="max-w-5xl mx-auto px-8 py-20">
          <div className="text-center mb-12">
            <p
              className="text-[10px] tracking-[0.3em] uppercase font-bold text-[#C9A84C] mb-4"
              style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
            >
              Sample report, fictional property
            </p>
            <h2
              className="text-4xl text-[#0F0E2E] tracking-tight leading-tight"
              style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 600 }}
            >
              The document your client receives.
            </h2>
          </div>

          {/* Sample, rendered like a print article extract, no
              browser chrome. */}
          <article className="max-w-3xl mx-auto bg-white border border-[#C8C8DC] shadow-xl p-10">
            <p
              className="text-[10px] tracking-[0.3em] uppercase font-bold text-[#C9A84C] mb-3"
              style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
            >
              Disclosure Analysis Report, Fictional Sample
            </p>
            <h3
              className="text-3xl text-[#191970] tracking-tight leading-tight mb-2"
              style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 600 }}
            >
              123 Example Drive, Sample City, CA 95000
            </h3>
            <p className="text-xs text-[#4A4A4A] mb-8">
              SFR &middot; 1962 &middot; 1,650 sqft &middot; 3 bed / 2 bath &middot; Illustrative example only
            </p>

            <div className="h-px bg-[#0F0E2E]/20 mb-8" />

            <div className="flex items-center gap-3 mb-5">
              <span
                className="text-[10px] tracking-[0.22em] uppercase font-bold text-[#C9A84C] bg-[#191970] px-3 py-1.5"
                style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
              >
                Section IV
              </span>
              <p
                className="text-[#191970] font-bold tracking-tight"
                style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
              >
                Critical and High-Priority Findings
              </p>
            </div>

            <div className="space-y-3">
              {[
                ["1. Unpermitted garage conversion", "Critical", "#7A2E2E"],
                ["2. Active roof leak in master bedroom", "Critical", "#7A2E2E"],
                ["3. Federal Pacific Stab-Lok panel", "High", "#8B5A2B"],
              ].map(([title, sev, bg]) => (
                <div
                  key={title}
                  className="border-l-4 pl-4 py-2 flex items-baseline justify-between gap-4"
                  style={{ borderColor: bg }}
                >
                  <span
                    className="font-semibold text-[#191970] text-[15px]"
                    style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
                  >
                    {title}
                  </span>
                  <span
                    className="text-[10px] font-bold text-white px-3 py-1 uppercase tracking-widest whitespace-nowrap"
                    style={{ backgroundColor: bg, fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
                  >
                    {sev}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-[#0F0E2E]/15 flex items-center justify-between">
              <span
                className="text-[11px] tracking-[0.22em] uppercase font-bold text-[#4A4A4A]"
                style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
              >
                Total exposure
              </span>
              <span
                className="text-2xl text-[#191970]"
                style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 600 }}
              >
                $39,700 to $81,500
              </span>
            </div>
          </article>

          <p
            className="text-center text-[12px] text-[#4A4A4A] mt-8 italic"
            style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
          >
            The example above is a fictional property used for illustration only. Format and finding types reflect what a real report contains; the property, owners, and details do not exist.
          </p>
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
        Preview, Direction 2, Editorial / WSJ Real Estate-style. Not
        the real homepage.
      </span>
      <div className="flex items-center gap-3">
        <a href="/preview/homepage-v1" className="underline underline-offset-2">
          View Direction 1 (Compass)
        </a>
        <a href="/" className="underline underline-offset-2">
          Back to live homepage
        </a>
      </div>
    </div>
  );
}
