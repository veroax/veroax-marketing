// Marketing landing page. Server-rendered for the static content
// (hero, features, how-it-works, stats, footer) so visitors don't
// pay the JS cost for the parts that don't move. The pricing
// toggle, plan buttons, and contact form live in a client island
// at ./_components/PricingAndContact so all that interactivity
// hydrates as one bundle.

import PricingAndContact from "./_components/PricingAndContact";
import { SUPPORT } from "@/lib/site";

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: "14-Section Report",
    desc: "Covers every angle, from critical findings and permit history to HOA health, negotiation leverage, and an overall property rating.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    title: "Severity-Rated Findings",
    desc: "Every issue is rated Critical, High, Moderate, or Cosmetic, weighted by cost and active hazard, not gut instinct.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Regional Cost Estimates",
    desc: "A fresh cost reference library is built for each property's market, including South Bay, SF, East Bay, LA, San Diego, and more.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
    title: "Confidence Tags",
    desc: "Every finding is labeled High, Medium, or Low confidence so you know what is a direct read versus an inference before you advise.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: "Structured QA Pass",
    desc: "Every analysis runs through a structured spot-check before it lands on your dashboard. The verifier pass catches findings the first pass missed and demotes ones it couldn't quote-verify against the source.",
  },
  {
    // Link + paper-stack icon, signals "live web + PDF" together.
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    title: "Dashboard View + Offline PDF",
    desc: "Read the analysis on your dashboard during the deal and download a branded PDF for offline reference, print, or your own records. Same 14-section content, both surfaces.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    title: "Privacy by Design",
    desc: "Seller PII (names, mortgage balances, lender details) is purged from temp storage after every analysis completes. Reports are scoped to your account via row-level security.",
  },
];

const steps = [
  {
    number: "01",
    title: "Upload the disclosure package",
    desc: "Drop in the PDF from Disclosures.io or any other source. The tool reads the TDS, SPQ, AVID, NHD, HOA documents, inspection reports, and third-party disclosures, whatever is in the package.",
  },
  {
    number: "02",
    title: "Veroax AI runs the 14-section analysis",
    desc: "Each section is analyzed against a fresh regional cost library pulled from live web sources for that property's market. Every finding is severity-rated, cost-estimated, and tagged with a confidence level.",
  },
  {
    number: "03",
    title: "You review the analysis and walk into the conversation prepared",
    desc: "Open the dashboard, read the critical and high findings, scan the HOA review, the environmental section, the cost summary, the negotiation guidance, the title vesting notes. Use it as the spine of the call with your buyer. Download the PDF for offline reference, or draft a short email summary to invite your client into a deeper conversation. The analysis is your prep tool; you stay in the driver's seat with your client.",
  },
];

const stats = [
  { value: "14", label: "Sections per report" },
  { value: "4", label: "Severity levels" },
  { value: "12+", label: "California markets" },
  { value: "7 yr", label: "Audit log retention" },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900">

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md"
        style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/final/veroax-lockup-dark.svg"
            alt="Veroax"
            className="h-9 sm:h-11 w-auto shrink-0"
          />
          <nav className="hidden sm:flex items-center gap-8 text-sm text-indigo-200">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Sign in: visible at every breakpoint. Was previously
                hidden on mobile (hidden sm:inline), which left
                existing-account users on phones with no entry point
                to /login from the homepage. The text-base / weight
                bump on mobile keeps it tappable next to the amber
                CTA. */}
            <a
              href="/login"
              className="text-sm font-semibold text-indigo-100 hover:text-white transition-colors sm:font-normal sm:text-indigo-200"
            >
              Sign in
            </a>
            <a
              href="#free-trial"
              className="text-sm font-semibold bg-amber-400 text-indigo-950 px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors shadow-md"
            >
              Try free
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden text-white py-32 px-6 text-center"
        style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #1e3a5f 100%)" }}
      >
        {/* Dot grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* Glow blobs */}
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(251,191,36,0.15) 0%, transparent 70%)" }} />
        <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)" }} />

        <div className="relative max-w-3xl mx-auto space-y-7">
          <span className="inline-block bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full">
            AI-Powered Real Estate Due Diligence
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            Veroax. AI-assisted disclosure analysis for residential real estate.
          </h1>
          <p className="text-lg sm:text-xl text-indigo-200 leading-relaxed max-w-2xl mx-auto">
            Upload a disclosure package and get back a polished, 14-section
            analysis. Severity-rated findings, regional cost estimates,
            negotiation guidance, and an overall property rating. Built so
            you can walk into the next conversation with your buyer knowing
            exactly what the documents say.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <a
              href="#free-trial"
              className="inline-block bg-amber-400 text-indigo-950 font-semibold px-7 py-3.5 rounded-lg hover:bg-amber-300 transition-colors text-base shadow-lg shadow-amber-400/20"
            >
              Start your free report
            </a>
            <a
              href="#how-it-works"
              className="inline-block border border-indigo-400/40 text-white px-7 py-3.5 rounded-lg hover:bg-white/10 transition-colors text-base"
            >
              See how it works
            </a>
          </div>
          <p className="text-xs text-indigo-200 pt-1">
            One free report per DRE license, no credit card required
          </p>
          {/* Format strip. Communicates the two surfaces the agent
              actually works with: the live dashboard view they use
              during the deal, and a downloadable PDF for offline
              review (printing, archive, in-meeting note-taking). */}
          <p className="text-[11px] text-indigo-300/90 tracking-wide pt-3">
            Live dashboard view for your review &nbsp;&middot;&nbsp;
            Downloadable PDF for offline reference
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-white border-b border-gray-100 py-12 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-amber-500 bg-clip-text text-transparent">
                {s.value}
              </p>
              <p className="text-sm text-gray-500 mt-1.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="py-24 px-6 bg-gradient-to-b from-white to-indigo-50/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <span className="inline-block bg-indigo-100 text-indigo-700 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full">
              Features
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              Everything you need to walk into the deal prepared
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">
              Built on California residential disclosure best practices, with safeguards that keep the
              analysis defensible and the findings honest. Florida, Texas, and Washington state are coming soon.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl bg-white border border-indigo-100 p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-white shadow-md"
                  style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
                  {f.icon}
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sample Report Preview */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 space-y-3">
            <span className="inline-block bg-indigo-100 text-indigo-700 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full">
              Sample Report
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              What an analysis looks like
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">
              Every analysis follows the same 14-section structure. The example below is a fictional property used for illustration only. The format and finding types reflect what a real analysis contains, but the property, owners, and details do not exist.
            </p>
          </div>

          {/* Browser chrome wrapper */}
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
            {/* Browser bar */}
            <div className="bg-gray-100 px-4 py-3 flex items-center gap-3 border-b border-gray-200">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              {/* URL bar reflects the AGENT'S DASHBOARD URL shape.
                  Previously this showed the public share-link path
                  (veroax.com/r/<code>) back when the share link
                  was the marketed deliverable. With the repositioning
                  to "agents use the analysis to prepare the deal",
                  the dashboard view is the canonical surface. */}
              <div className="flex-1 mx-2 bg-white rounded px-3 py-1 text-xs text-gray-400 font-mono truncate">
                veroax.com/dashboard/reports/sample
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded shrink-0">
                Fictional Example
              </span>
            </div>

            {/* Report body */}
            <div className="bg-[#FAF8F2] p-6 sm:p-10 space-y-8 text-sm">

              {/* Property snapshot */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#C9A84C] mb-0.5">Disclosure Analysis Report: Fictional Sample</p>
                    <h3 className="text-xl font-bold text-[#191970]">123 Example Drive, Sample City, CA 95000</h3>
                    <p className="text-[#4A4A4A] text-xs mt-1">SFR · 1962 · 1,650 sq ft · 3 bed / 2 bath · Illustrative example only</p>
                  </div>
                  <div className="text-right text-xs text-[#4A4A4A] space-y-0.5 shrink-0">
                    <p><span className="font-semibold">List Price:</span> $1,150,000</p>
                    <p><span className="font-semibold">Days on Market:</span> 12</p>
                    <p><span className="font-semibold">Analysis Date:</span> May 17, 2026</p>
                    <p><span className="font-semibold">Cost Reference:</span> Sample regional library</p>
                  </div>
                </div>
                <div className="h-px bg-[#C8C8DC]" />
              </div>

              {/* Section 4: Critical/High Issues */}
              <div>
                <div className="flex items-center gap-3 mb-4 rounded-sm overflow-hidden">
                  <div className="bg-[#191970] text-[#C9A84C] text-xs font-bold px-3 py-2 uppercase tracking-widest shrink-0">Section 4</div>
                  <p className="text-white bg-[#191970] font-bold text-sm py-2 pr-4 flex-1">Critical &amp; High-Priority Findings</p>
                </div>

                <div className="space-y-4">
                  {/* Critical finding 1 */}
                  <div className="border border-[#C8C8DC] rounded bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#C8C8DC]">
                      <span className="font-bold text-[#191970] text-sm">Issue 1: Unpermitted Garage Conversion</span>
                      <span className="text-xs font-bold text-white bg-[#7A2E2E] px-3 py-1 rounded-sm uppercase tracking-wide">Critical</span>
                    </div>
                    <div className="px-4 py-3 text-[#1A1A2E] text-xs leading-relaxed italic border-b border-[#C8C8DC] bg-[#FAF8F2]">
                      &quot;Garage has been converted to living space. No permit is on file with the local jurisdiction. Conversion appears to predate current ownership and includes non-code electrical and drywall work.&quot; Source: AVID, p. 4; Permit History search.
                    </div>
                    <div className="divide-y divide-[#C8C8DC]">
                      {[
                        ["Source", "AVID p.4 / City Permit Records"],
                        ["Confidence", "High"],
                        ["Est. Cost", "$18,000 to $45,000 (permit, remediation, or removal)"],
                        ["Risk if Ignored", "Lender may refuse to fund; appraiser may exclude sq footage; city may require removal at close"],
                        ["Recommended Action", "Request seller permit or demolish before close; get contractor bids during contingency"],
                      ].map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[140px_1fr] text-xs">
                          <div className="px-3 py-2 font-semibold text-[#2E4057] bg-[#F5F2EA]">{k}</div>
                          <div className="px-3 py-2 text-[#1A1A2E]">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Critical finding 2 */}
                  <div className="border border-[#C8C8DC] rounded bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#C8C8DC]">
                      <span className="font-bold text-[#191970] text-sm">Issue 2: Active Roof Leak in Master Bedroom</span>
                      <span className="text-xs font-bold text-white bg-[#7A2E2E] px-3 py-1 rounded-sm uppercase tracking-wide">Critical</span>
                    </div>
                    <div className="px-4 py-3 text-[#1A1A2E] text-xs leading-relaxed italic border-b border-[#C8C8DC] bg-[#FAF8F2]">
                      &quot;Active moisture intrusion at ridge line above master bedroom. Insulation saturated. Visible water staining on drywall, approximately 6 ft × 3 ft area. Immediate repair recommended.&quot; Source: General Home Inspection, p. 8.
                    </div>
                    <div className="divide-y divide-[#C8C8DC]">
                      {[
                        ["Source", "General Home Inspection, p.8"],
                        ["Confidence", "High"],
                        ["Est. Cost", "$8,500 to $14,000 (roof repair, insulation, drywall)"],
                        ["Risk if Ignored", "Accelerating structural damage; mold risk within 30 days"],
                        ["Recommended Action", "Require seller repair or full credit before close"],
                      ].map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[140px_1fr] text-xs">
                          <div className="px-3 py-2 font-semibold text-[#2E4057] bg-[#F5F2EA]">{k}</div>
                          <div className="px-3 py-2 text-[#1A1A2E]">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* High finding */}
                  <div className="border border-[#C8C8DC] rounded bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#C8C8DC]">
                      <span className="font-bold text-[#191970] text-sm">Issue 3: Federal Pacific Stab-Lok Electrical Panel</span>
                      <span className="text-xs font-bold text-white bg-[#8B5A2B] px-3 py-1 rounded-sm uppercase tracking-wide">High</span>
                    </div>
                    <div className="divide-y divide-[#C8C8DC]">
                      {[
                        ["Source", "General Home Inspection, p.12"],
                        ["Confidence", "High"],
                        ["Est. Cost", "$4,500 to $7,000 (full panel replacement)"],
                        ["Risk if Ignored", "Fire risk; some insurers refuse to bind on FPE panels"],
                        ["Recommended Action", "Budget for replacement; confirm insurability before removing contingency"],
                      ].map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[140px_1fr] text-xs">
                          <div className="px-3 py-2 font-semibold text-[#2E4057] bg-[#F5F2EA]">{k}</div>
                          <div className="px-3 py-2 text-[#1A1A2E]">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 10: Cost Summary */}
              <div>
                <div className="flex items-center gap-3 mb-4 rounded-sm overflow-hidden">
                  <div className="bg-[#191970] text-[#C9A84C] text-xs font-bold px-3 py-2 uppercase tracking-widest shrink-0">Section 10</div>
                  <p className="text-white bg-[#191970] font-bold text-sm py-2 pr-4 flex-1">Repair Cost Summary</p>
                </div>
                <div className="border border-[#C8C8DC] rounded overflow-hidden bg-white">
                  <div className="grid grid-cols-[1fr_160px] bg-[#2E4057] text-white text-xs font-bold">
                    <div className="px-4 py-2.5">Item</div>
                    <div className="px-4 py-2.5 text-right">Est. Cost Range</div>
                  </div>
                  {[
                    ["A. CRITICAL AND HIGH-PRIORITY REPAIRS", "", true],
                    ["Unpermitted garage conversion", "$18,000 to $45,000", false],
                    ["Active roof leak (repair, insulation, drywall)", "$8,500 to $14,000", false],
                    ["Federal Pacific panel replacement", "$4,500 to $7,000", false],
                    ["Subtotal", "$31,000 to $66,000", "sub"],
                    ["B. MODERATE REPAIRS (1 to 5 year horizon)", "", true],
                    ["HVAC system replacement (16-year-old furnace)", "$7,500 to $12,000", false],
                    ["Sewer lateral scope + spot repair", "$1,200 to $3,500", false],
                    ["Subtotal", "$8,700 to $15,500", "sub"],
                  ].map(([label, cost, type], i) => (
                    <div
                      key={i}
                      className={`grid grid-cols-[1fr_160px] text-xs border-t border-[#C8C8DC] ${
                        type === true ? "bg-[#2E4057]/10 font-bold text-[#2E4057]" :
                        type === "sub" ? "bg-[#FAF8F2] font-bold text-[#191970]" :
                        i % 2 === 0 ? "bg-white" : "bg-[#F5F2EA]"
                      }`}
                    >
                      <div className="px-4 py-2">{label}</div>
                      <div className="px-4 py-2 text-right">{cost}</div>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_160px] text-xs border-t-2 border-[#191970] bg-[#191970] text-white font-bold">
                    <div className="px-4 py-3">TOTAL ESTIMATED REPAIR EXPOSURE</div>
                    <div className="px-4 py-3 text-right">$39,700 to $81,500</div>
                  </div>
                </div>
              </div>

              {/* Section 14: Rating */}
              <div>
                <div className="flex items-center gap-3 mb-4 rounded-sm overflow-hidden">
                  <div className="bg-[#191970] text-[#C9A84C] text-xs font-bold px-3 py-2 uppercase tracking-widest shrink-0">Section 14</div>
                  <p className="text-white bg-[#191970] font-bold text-sm py-2 pr-4 flex-1">Overall Property Rating</p>
                </div>
                <div className="border border-[#C8C8DC] rounded bg-white p-5 flex flex-col sm:flex-row items-start gap-5">
                  <div className="shrink-0">
                    <div className="bg-[#8B5A2B] text-white text-sm font-bold px-5 py-3 rounded text-center uppercase tracking-wide whitespace-nowrap">
                      Significant Concerns
                    </div>
                  </div>
                  <p className="text-[#1A1A2E] text-xs leading-relaxed">
                    Two Critical findings (an unpermitted conversion that carries appraisal and lending risk, and an active roof leak), combined with a fire-risk electrical panel, push this property into Significant Concerns territory. All three issues are negotiable, but the buyer should not remove contingencies until contractor bids are in hand and the lender has confirmed it will fund subject to the permit condition. The underlying bones of the property are sound; the exposure is concentrated and addressable.
                    <span className="block mt-2 italic text-[#4A4A4A]">This rating reflects the disclosure documents only. It is contingent on inspections confirming the document review and is not a substitute for licensed professional inspection of the property&apos;s physical condition.</span>
                  </p>
                </div>
              </div>

            </div>
          </div>
          {/* Caption below the sample card. Reinforces the dashboard
              is the canonical surface; the PDF is for offline. */}
          <p className="text-center text-xs text-gray-500 mt-5 leading-relaxed max-w-2xl mx-auto">
            Your analysis at a glance on the dashboard.{" "}
            <span className="text-gray-700 font-semibold">
              Also downloadable as a branded PDF
            </span>{" "}
            for offline review, printing, or your own records.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6"
        style={{ background: "linear-gradient(135deg, #eef2ff 0%, #f0fdf4 100%)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full">
              How it works
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              From disclosure package to defensible analysis in minutes
            </h2>
          </div>
          <div className="space-y-10">
            {steps.map((step, i) => (
              <div
                key={step.number}
                className={`flex flex-col sm:flex-row gap-6 items-start bg-white rounded-2xl p-8 shadow-sm border border-indigo-100/60 ${
                  i % 2 === 1 ? "sm:flex-row-reverse" : ""
                }`}
              >
                <div className="flex-shrink-0">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-lg"
                    style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)" }}
                  >
                    {step.number}
                  </div>
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">{step.title}</h3>
                  <p className="text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* State availability table */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12 space-y-3">
            <span className="inline-block bg-amber-100 text-amber-700 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full">
              Availability
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Where Veroax is launching</h2>
            <p className="text-gray-500 text-base">States listed in order of annual residential real estate transaction volume.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-indigo-100 shadow-sm">
            <table className="w-full text-sm text-left">
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)" }}>
                  <th className="px-6 py-4 font-semibold text-white">State</th>
                  <th className="px-6 py-4 font-semibold text-white">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-50">
                {[
                  { state: "California", status: "live", note: "Live, accepting beta clients" },
                  { state: "Texas", status: "launching soon", note: "" },
                  { state: "Florida", status: "launching soon", note: "" },
                  { state: "Washington", status: "launching soon", note: "" },
                ].map((row) => (
                  <tr key={row.state} className="bg-white hover:bg-indigo-50/40 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{row.state}</td>
                    <td className="px-6 py-4">
                      {row.status === "live" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          {row.note}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                          Launching Soon
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing + Contact (client island) */}
      <PricingAndContact />

      {/* Footer */}
      <footer className="text-slate-400 py-10 px-6"
        style={{ background: "linear-gradient(135deg, #0f0e2e 0%, #1e1b4b 100%)" }}>
        <div className="max-w-6xl mx-auto space-y-6 text-sm">
          <div className="grid gap-6 sm:grid-cols-3 sm:items-start">
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/final/veroax-lockup-dark.svg"
                alt="Veroax, Inc"
                style={{ height: 36 }}
              />
              <p className="text-slate-400 leading-relaxed">
                {SUPPORT.address.street}<br />
                {SUPPORT.address.city}, {SUPPORT.address.region} {SUPPORT.address.postalCode}
              </p>
            </div>
            <div className="space-y-2 sm:text-center">
              <p className="text-white font-semibold text-xs uppercase tracking-widest">Contact</p>
              <p>
                <a
                  href={`tel:${SUPPORT.phoneTel}`}
                  className="hover:text-white transition-colors"
                  aria-label={`Call Veroax support at ${SUPPORT.phone}`}
                >
                  <span className="font-semibold text-amber-300" aria-hidden="true">(866) AISTUFF</span>
                  <span className="text-slate-500 mx-1.5" aria-hidden="true">·</span>
                  <span>{SUPPORT.phone}</span>
                </a>
              </p>
              <p>
                <a
                  href={`mailto:${SUPPORT.email}`}
                  className="hover:text-white underline underline-offset-2 transition-colors"
                >
                  {SUPPORT.email}
                </a>
              </p>
            </div>
            {/* Resources column, right-aligned on desktop to
                balance the address column on the left. Stub pages
                stand in for Blog / Demo / FAQ / Help while we
                build content; Feedback links to the real form
                that emails support. */}
            <div className="space-y-2 sm:text-right">
              <p className="text-white font-semibold text-xs uppercase tracking-widest">
                Resources
              </p>
              <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm justify-center sm:justify-end">
                <a href="/blog" className="hover:text-white transition-colors">
                  Blog
                </a>
                <a href="/demo" className="hover:text-white transition-colors">
                  Watch a Demo
                </a>
                <a href="/faq" className="hover:text-white transition-colors">
                  FAQ
                </a>
                <a href="/help" className="hover:text-white transition-colors">
                  Help Videos
                </a>
                <a
                  href="/contact"
                  className="hover:text-white transition-colors"
                >
                  Contact
                </a>
                <a
                  href="/investors"
                  className="hover:text-white transition-colors"
                >
                  Investors
                </a>
                <a
                  href="/feedback"
                  className="hover:text-white transition-colors text-amber-300 font-semibold"
                >
                  Feedback
                </a>
              </nav>
            </div>
          </div>
          <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2">
              <a
                href="/terms"
                className="hover:text-white transition-colors underline underline-offset-2"
              >
                Terms of Service
              </a>
              <a
                href="/privacy"
                className="hover:text-white transition-colors underline underline-offset-2"
              >
                Privacy Policy
              </a>
              <span>
                &copy; {new Date().getFullYear()} Veroax, Inc. All rights reserved.
              </span>
            </div>
            <p>Built in California, serving licensed real estate professionals</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
