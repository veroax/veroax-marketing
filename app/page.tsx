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
      <header className="bg-slate-900 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-white font-semibold text-lg tracking-tight">Veroax</span>
          <nav className="hidden sm:flex items-center gap-8 text-sm text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </nav>
          <a
            href="#contact"
            className="text-sm font-medium bg-amber-400 text-slate-900 px-4 py-2 rounded-md hover:bg-amber-300 transition-colors"
          >
            Get in touch
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-slate-900 text-white py-28 px-6 text-center">
        <div className="max-w-3xl mx-auto space-y-7">
          <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest">
            AI-Powered Real Estate Due Diligence
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            Veroax — AI-assisted disclosure analysis for residential real estate
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed max-w-2xl mx-auto">
            Upload a disclosure package, get back a polished 14-section client ready buyer report — severity-rated
            findings, regional cost estimates, negotiation guidance, and an overall property rating,
            all grounded in what the documents actually say.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <a
              href="#early-access"
              className="inline-block bg-amber-400 text-slate-900 font-semibold px-7 py-3.5 rounded-md hover:bg-amber-300 transition-colors text-base"
            >
              Request early access
            </a>
            <a
              href="#how-it-works"
              className="inline-block border border-slate-600 text-white px-7 py-3.5 rounded-md hover:border-slate-400 hover:bg-slate-800 transition-colors text-base"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-slate-800 text-white py-10 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-amber-400">{s.value}</p>
              <p className="text-sm text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <p className="text-amber-500 text-sm font-semibold uppercase tracking-widest">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              Everything a buyer needs to make a confident decision
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">
              Built on California residential disclosure best practices, with safeguards that keep the
              report defensible and the analysis honest. Florida, Texas, and Washington state are coming soon.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-11 h-11 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <p className="text-amber-500 text-sm font-semibold uppercase tracking-widest">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              From disclosure package to client report in minutes
            </h2>
          </div>
          <div className="space-y-12">
            {steps.map((step, i) => (
              <div
                key={step.number}
                className={`flex flex-col sm:flex-row gap-8 items-start ${
                  i % 2 === 1 ? "sm:flex-row-reverse" : ""
                }`}
              >
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center text-xl font-bold">
                    {step.number}
                  </div>
                </div>
                <div className="flex-1 pt-2">
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
            <p className="text-amber-500 text-sm font-semibold uppercase tracking-widest">Availability</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Where Veroax is launching</h2>
            <p className="text-gray-500 text-base">States listed in order of annual residential real estate transaction volume.</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-6 py-4 font-semibold">State</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { state: "California", status: "live", note: "Live — accepting beta clients" },
                  { state: "Texas", status: "launching soon", note: "" },
                  { state: "Florida", status: "launching soon", note: "" },
                  { state: "Washington", status: "launching soon", note: "" },
                ].map((row) => (
                  <tr key={row.state} className="bg-white hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{row.state}</td>
                    <td className="px-6 py-4">
                      {row.status === "live" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          {row.note}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
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

      {/* Contact */}
      <section id="contact" className="bg-slate-900 text-white py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10 space-y-3">
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Get in touch</p>
            <h2 className="text-3xl sm:text-4xl font-bold">Be in the Know</h2>
            <p className="text-slate-300 text-base leading-relaxed">
              Veroax is launching first in California, with Florida, Texas, and Washington state close
              behind. If you work with buyers in any of those markets and want to offer a sharper due
              diligence experience, send us a message and we will be in touch.
            </p>
          </div>

          {status === "success" ? (
            <p className="text-center text-amber-400 font-medium text-lg">
              Message sent — we will be in touch shortly.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1.5">
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
                    className="w-full rounded-md bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
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
                    className="w-full rounded-md bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-1.5">
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
                  className="w-full rounded-md bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                />
              </div>
              {status === "error" && (
                <p className="text-red-400 text-sm">{errorMsg}</p>
              )}
              <div className="text-right">
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="rounded-md bg-amber-400 text-slate-900 px-7 py-3 text-sm font-semibold hover:bg-amber-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {status === "sending" ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <span className="text-white font-semibold text-base">Veroax, Inc</span>
          <p>
            Customer Support &mdash;{" "}
            <a
              href="mailto:support@veroax.com"
              className="hover:text-white underline underline-offset-2 transition-colors"
            >
              support@veroax.com
            </a>
          </p>
          <p className="text-slate-600 text-xs">
            &copy; {new Date().getFullYear()} Veroax. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  );
}
