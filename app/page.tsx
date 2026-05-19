"use client";

import { useState, FormEvent } from "react";

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: "14-Section Report",
    desc: "Covers every angle — from critical findings and permit history to HOA health, negotiation leverage, and an overall property rating.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    title: "Severity-Rated Findings",
    desc: "Every issue is rated Critical, High, Moderate, or Cosmetic — weighted by cost and active hazard, not gut instinct.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Regional Cost Estimates",
    desc: "A fresh cost reference library is built for each property's market — South Bay, SF, East Bay, LA, San Diego, and more.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
    title: "Confidence Tags",
    desc: "Every finding is labeled High, Medium, or Low confidence so clients know what is a direct read versus an inference.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: "Agent QA Before Delivery",
    desc: "Every report goes through a structured spot-check with the agent before the PDF is generated. No surprises for the client.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    title: "Privacy by Design",
    desc: "Seller PII — names, mortgage balances, lender details — is purged from temp storage after every report is delivered.",
  },
];

const steps = [
  {
    number: "01",
    title: "Upload the disclosure package",
    desc: "Drop in the PDF from Disclosures.io or any other source. The tool reads the TDS, SPQ, AVID, NHD, HOA documents, inspection reports, and third-party disclosures — whatever is in the package.",
  },
  {
    number: "02",
    title: "Veroax AI runs the 14-section analysis",
    desc: "Each section is analyzed against a fresh regional cost library pulled from live web sources for that property's market. Every finding is severity-rated, cost-estimated, and tagged with a confidence level.",
  },
  {
    number: "03",
    title: "You review, then the client gets a polished PDF",
    desc: "Before anything goes to the client, you see a structured summary of every critical and high finding. Approve it, make corrections if needed, and your branded PDF is ready to send. We even prepare a client email you can copy straight into your CRM or inbox.",
  },
];

const stats = [
  { value: "14", label: "Sections per report" },
  { value: "4", label: "Severity levels" },
  { value: "12+", label: "California markets" },
  { value: "7 yr", label: "Audit log retention" },
];

const plans = [
  {
    name: "Solo",
    price: "$49",
    period: "/month",
    perReport: "1 report included · $59 per additional",
    description: "For new agents and low-volume solos building a transaction at a time.",
    features: [
      "1 disclosure report included monthly",
      "$59 per additional report",
      "California disclosures (TDS, SPQ, AVID, NHD, HOA)",
      "Standard 24-hour turnaround",
      "Email support",
      "Month-to-month — cancel anytime",
    ],
    cta: "Start with Solo",
    highlighted: false,
    badge: null,
  },
  {
    name: "Professional",
    price: "$149",
    period: "/month",
    perReport: "8 reports included · works out to $18.60 each",
    description: "For active agents and small teams running multiple deals a month.",
    features: [
      "8 disclosure reports included monthly",
      "$29 per additional report",
      "All supported states as they launch (CA, TX, FL, WA)",
      "Priority 12-hour turnaround",
      "Branded PDF — your logo, photo, and contact details",
      "Buyer-ready summary email template included",
      "Phone and email support",
    ],
    cta: "Choose Professional",
    highlighted: true,
    badge: "Most Popular",
  },
  {
    name: "Brokerage",
    price: "Custom",
    period: "",
    perReport: "Volume pricing — typically under $15 each",
    description: "For brokerages and teams that want disclosure analysis as a built-in service.",
    features: [
      "Unlimited reports across the team",
      "Multi-agent admin dashboard",
      "White-label branding (broker logo and colors)",
      "Dedicated success manager",
      "CRM, dotloop, and Skyslope integrations",
      "Volume pricing on overages",
      "Annual contract with quarterly business review",
    ],
    cta: "Talk to sales",
    highlighted: false,
    badge: null,
  },
];

export default function Home() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

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

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900">

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md"
        style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)" }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-white font-bold text-xl tracking-tight">Veroax</span>
          <nav className="hidden sm:flex items-center gap-8 text-sm text-indigo-200">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </nav>
          <a
            href="#pricing"
            className="text-sm font-semibold bg-amber-400 text-indigo-950 px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors shadow-md"
          >
            Try free
          </a>
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
            Veroax — AI-assisted disclosure analysis for residential real estate
          </h1>
          <p className="text-lg sm:text-xl text-indigo-200 leading-relaxed max-w-2xl mx-auto">
            Upload a disclosure package, get back a polished 14-section client ready buyer report — severity-rated
            findings, regional cost estimates, negotiation guidance, and an overall property rating,
            all grounded in what the documents actually say.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <a
              href="#pricing"
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
          <p className="text-xs text-indigo-300 pt-1">
            One free report per DRE license · No credit card required
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
              Everything a buyer needs to make a confident decision
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">
              Built on California residential disclosure best practices, with safeguards that keep the
              report defensible and the analysis honest. Florida, Texas, and Washington state are coming soon.
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
              See what your clients receive
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">
              Every report follows the same 14-section structure. The example below is a fictional property used for illustration only — the format and finding types reflect what a real report contains, but the property, owners, and details do not exist.
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
              <div className="flex-1 mx-2 bg-white rounded px-3 py-1 text-xs text-gray-400 font-mono truncate">
                Sample_Property_Disclosure_Analysis.pdf
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
                    <p className="text-xs font-bold uppercase tracking-widest text-[#C9A84C] mb-0.5">Disclosure Analysis Report — Fictional Sample</p>
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
                      "Garage has been converted to living space. No permit is on file with the local jurisdiction. Conversion appears to predate current ownership and includes non-code electrical and drywall work." — AVID, p. 4; Permit History search.
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
                      <span className="font-bold text-[#191970] text-sm">Issue 2: Active Roof Leak — Master Bedroom</span>
                      <span className="text-xs font-bold text-white bg-[#7A2E2E] px-3 py-1 rounded-sm uppercase tracking-wide">Critical</span>
                    </div>
                    <div className="px-4 py-3 text-[#1A1A2E] text-xs leading-relaxed italic border-b border-[#C8C8DC] bg-[#FAF8F2]">
                      "Active moisture intrusion at ridge line above master bedroom. Insulation saturated. Visible water staining on drywall, approximately 6 ft × 3 ft area. Immediate repair recommended." — General Home Inspection, p. 8.
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
                    ["Active roof leak — repair, insulation, drywall", "$8,500 to $14,000", false],
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
                    Two Critical findings — an unpermitted conversion that carries appraisal and lending risk and an active roof leak — combined with a fire-risk electrical panel push this property into Significant Concerns territory. All three issues are negotiable, but the buyer should not remove contingencies until contractor bids are in hand and the lender has confirmed it will fund subject to the permit condition. The underlying bones of the property are sound; the exposure is concentrated and addressable.
                    <span className="block mt-2 italic text-[#4A4A4A]">This rating reflects the disclosure documents only. It is contingent on inspections confirming the document review and is not a substitute for licensed professional inspection of the property's physical condition.</span>
                  </p>
                </div>
              </div>

            </div>
          </div>
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
              From disclosure package to client report in minutes
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
                  { state: "California", status: "live", note: "Live — accepting beta clients" },
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
              deal — at a defensible quality level the buyer can hold in their hands. Start with
              one free report, then pick the plan that fits your volume.
            </p>
          </div>

          {/* Free Trial Banner */}
          <div
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
                  per agent — no credit card required.
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-xs text-indigo-300">
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
                  className="inline-block bg-amber-400 text-indigo-950 font-semibold px-7 py-3.5 rounded-lg hover:bg-amber-300 transition-colors text-base shadow-lg shadow-amber-400/20 whitespace-nowrap"
                >
                  Claim your free report
                </a>
                <p className="text-xs text-indigo-300 mt-3">Takes about 60 seconds to request</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
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
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-5xl font-bold bg-gradient-to-r from-indigo-600 to-amber-500 bg-clip-text text-transparent">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-gray-500 text-sm font-medium">{plan.period}</span>
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
                <a
                  href="#contact"
                  className={`block text-center font-semibold px-6 py-3 rounded-lg transition-colors ${
                    plan.highlighted
                      ? "bg-amber-400 text-indigo-950 hover:bg-amber-300 shadow-lg shadow-amber-400/20"
                      : "bg-indigo-950 text-white hover:bg-indigo-900"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          {/* High-volume upsell */}
          <div className="mt-10 max-w-2xl mx-auto rounded-xl border border-amber-200 bg-amber-50/70 p-5 text-center">
            <p className="text-sm text-amber-900 leading-relaxed">
              <span className="font-semibold">Running 15+ reports a month?</span>{" "}
              <a
                href="#contact"
                className="font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-800"
              >
                Talk to us about a team plan
              </a>{" "}
              — per-report pricing drops meaningfully at higher volume.
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
              <span>PII purged after every report — privacy by design</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Agent QA spot-check before every delivery</span>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-8 max-w-2xl mx-auto">
            Pricing in USD. Free trial is one report per California DRE license number — no credit card required. Annual prepay saves two months on Solo and Professional. Brokerage pricing scales with team size and integrations — contact sales for a tailored quote.
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
            <h2 className="text-3xl sm:text-4xl font-bold">Be in the Know</h2>
            <p className="text-indigo-200 text-base leading-relaxed">
              Veroax is launching first in California, with Florida, Texas, and Washington state close
              behind. If you work with buyers in any of those markets and want to offer a sharper due
              diligence experience, send us a message and we will be in touch.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-x-8 gap-y-2 pt-3 text-sm text-indigo-200">
              <a
                href="tel:+18662478833"
                className="hover:text-white transition-colors"
              >
                <span className="font-semibold text-amber-300">(866) AISTUFF</span>
                <span className="text-indigo-400 mx-2">·</span>
                (866) 247-8833
              </a>
              <span className="hidden sm:inline text-indigo-500">|</span>
              <span>3964 Rivermark Plaza, Unit #2783, Santa Clara, CA 95054</span>
            </div>
          </div>

          {status === "success" ? (
            <p className="text-center text-amber-400 font-medium text-lg">
              Message sent — we will be in touch shortly.
            </p>
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
                  {status === "sending" ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-slate-400 py-10 px-6"
        style={{ background: "linear-gradient(135deg, #0f0e2e 0%, #1e1b4b 100%)" }}>
        <div className="max-w-6xl mx-auto space-y-6 text-sm">
          <div className="grid gap-6 sm:grid-cols-3 sm:items-start">
            <div className="space-y-2">
              <span className="text-white font-bold text-base block">Veroax, Inc</span>
              <p className="text-slate-400 leading-relaxed">
                3964 Rivermark Plaza, Unit #2783<br />
                Santa Clara, CA 95054
              </p>
            </div>
            <div className="space-y-2 sm:text-center">
              <p className="text-white font-semibold text-xs uppercase tracking-widest">Contact</p>
              <p>
                <a
                  href="tel:+18662478833"
                  className="hover:text-white transition-colors"
                >
                  <span className="font-semibold text-amber-300">(866) AISTUFF</span>
                  <span className="text-slate-500 mx-1.5">·</span>
                  (866) 247-8833
                </a>
              </p>
              <p>
                <a
                  href="mailto:support@veroax.com"
                  className="hover:text-white underline underline-offset-2 transition-colors"
                >
                  support@veroax.com
                </a>
              </p>
            </div>
            <p className="text-slate-600 text-xs sm:text-right">
              &copy; {new Date().getFullYear()} Veroax, Inc. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
