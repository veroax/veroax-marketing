import Link from "next/link";

export const metadata = { title: "FAQ — Veroax" };

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What does Veroax actually do?",
    a: "Uploads of California disclosure packages (TDS, SPQ, AVID, NHD, HOA docs, inspection reports) get analyzed by a multi-pass AI pipeline that produces a 14-section buyer report — critical findings, cost estimates grounded in regional pricing, HOA review, environmental hazards, negotiation leverage, and an overall rating. You hand the PDF to your client.",
  },
  {
    q: "How accurate is the analysis?",
    a: "Veroax uses hybrid document mode: native PDF attachments for seller disclosures and inspection reports (so Claude sees check-boxes, signatures, and side-by-side seller/agent tables), and text extraction for long HOA packages where layout doesn't matter. Determinism is locked at temperature 0 so re-runs of the same package produce the same report.",
  },
  {
    q: "What regions do you support?",
    a: "California-wide. Cost estimates are grounded in nine regional baselines (Silicon Valley, East Bay, Sacramento, Central Valley, LA Westside / Inland, San Diego Coastal, Central Coast, North Coast) with biweekly refresh.",
  },
  {
    q: "How long does an analysis take?",
    a: "Typical packages (3-13 PDFs, 200-700 pages) finish in 60-90 seconds. Large packages with many HOA documents can take 2-3 minutes. We surface a stale-analysis detector if anything stalls.",
  },
  {
    q: "Can I add documents to a report later?",
    a: "Yes. The 'Add documents to this report' button on the report page lets you upload more files and triggers a full-package re-analysis. Updates within 30 days of the original analysis are free; outside that window, they count as a new report credit. The original report is preserved as a downloadable version so you can compare.",
  },
  {
    q: "What about pricing?",
    a: "Solo plan: $49/mo for 1 report per month plus $59 per additional report. Pro plan: $149/mo for 8 reports plus $35 per additional. Brokerage plan: $449/mo for 30 reports plus $25 per additional, with team seats and white-label branding. Pay-as-you-go (no monthly): $69 per report. See the homepage pricing section for current details.",
  },
  {
    q: "Is this a substitute for an inspection?",
    a: "No. Every Veroax report includes a clear disclaimer that it's a preliminary analytical aid. It does not replace licensed professional inspection, attorney review, or lender underwriting. The report helps you prioritize what to verify. It does not replace verification.",
  },
];

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-xs text-slate-500 hover:text-slate-900 inline-block mb-6"
        >
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          Frequently asked questions
        </h1>
        <p className="text-slate-600 mb-8">
          Quick answers about how Veroax works. Need more? Send feedback or
          email{" "}
          <a
            href="mailto:support@veroax.com"
            className="text-indigo-700 underline underline-offset-2"
          >
            support@veroax.com
          </a>
          .
        </p>
        <div className="space-y-6">
          {FAQS.map((item, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-200 p-6"
            >
              <h2 className="text-base font-bold text-slate-900 mb-2">
                {item.q}
              </h2>
              <p className="text-sm text-slate-700 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
