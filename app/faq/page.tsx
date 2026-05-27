// FAQ page. Organized into eight subgroups with anchor IDs for
// deep-linking. Each Q/A pair renders as a native <details> element
// so the page works without JavaScript and stays accessible to
// screen readers. JSON-LD FAQPage schema in the <head> helps the
// page surface as a rich-result block in Google.

import Link from "next/link";
import type { Metadata } from "next";

import { SUPPORT } from "@/lib/site";
export const metadata: Metadata = {
  title: "FAQ, Veroax",
  description:
    "Answers about Veroax disclosure analysis: product basics, pricing, the analysis pipeline, brand and PDF customization, privacy, and team accounts.",
};

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

type Faq = { q: string; a: string };
type Group = { id: string; label: string; intro?: string; items: Faq[] };

const GROUPS: Group[] = [
  {
    id: "product-basics",
    label: "Product basics",
    intro: "What Veroax is, who it is for, and what makes it different.",
    items: [
      {
        q: "What does Veroax actually do?",
        a: "You upload a California residential disclosure package (TDS, SPQ, AVID, NHD, HOA documents, inspection reports, and any third-party disclosures). A multi-pass AI pipeline produces a 14-section buyer report: critical findings, cost estimates grounded in regional pricing, HOA review, environmental hazards, negotiation leverage, and an overall property rating. You review the report, make any agent-side corrections, and hand the polished PDF to your buyer client.",
      },
      {
        q: "Who is Veroax for?",
        a: "California buyer's agents and small brokerages who want to deliver a defensible, written disclosure review to their clients without the 3 to 5 hours of paralegal or junior-agent labor each transaction normally requires. New agents use it to look thorough on day one. Experienced agents use it as a quality floor on every deal.",
      },
      {
        q: "How is Veroax different from Disclosures.io or a paralegal or ChatGPT?",
        a: "Disclosures.io is a delivery platform for the documents themselves; it does not analyze them. A paralegal does analyze them, but the cost (3 to 5 hours per package, often $300+ in fully-loaded time) makes it impractical on every deal. ChatGPT can summarize a single document but does not handle a 600-page mixed-PDF package, does not ground costs in California regional pricing, and does not produce a branded buyer deliverable. Veroax is purpose-built for the working flow: upload, review, deliver.",
      },
      {
        q: "How accurate is the analysis?",
        a: "Veroax uses hybrid document mode: native PDF attachments for seller disclosures and inspection reports (so Claude sees check-boxes, signatures, and side-by-side seller / agent tables), and text extraction for long HOA packages where layout does not matter. The model temperature is locked at 0, so the same package produces the same report on every run. Every finding is tagged with a confidence level (High, Medium, Low) so you and your client know what was a direct read versus an inference.",
      },
      {
        q: "Is this a substitute for a professional inspection?",
        a: "No. Every Veroax report includes a clear disclaimer that it is a preliminary analytical aid. It does not replace licensed professional inspection, attorney review, or lender underwriting. The report helps you and your buyer prioritize what to verify. It does not replace verification.",
      },
      {
        q: "What regions do you support?",
        a: "California-wide. Cost estimates are grounded in nine regional baselines: Silicon Valley / South Bay, East Bay, Sacramento Valley, Central Valley, Greater LA Westside, Greater LA Inland, San Diego Coastal, Central Coast, and North Coast. The pricing reference library is refreshed biweekly so estimates track real market labor and materials.",
      },
      {
        q: "What states are coming next?",
        a: "Texas, Florida, and Washington are next on the roadmap, in that order. Texas and Florida have similar disclosure structures (mandatory seller disclosure plus optional supplements). Washington is statutorily different but shares enough common ground for the same pipeline. Sign up to the blog and we will announce as each launches.",
      },
    ],
  },
  {
    id: "getting-started",
    label: "Getting started",
    intro: "Sign up, claim a trial, and run your first report.",
    items: [
      {
        q: "How do I sign up?",
        a: "Go to the signup page and create an account with your work email and a password. We send a verification link; click it and you are in. There is no credit card requirement to create an account or to claim your trial report.",
      },
      {
        q: "How do I get my free trial report?",
        a: "Every California-licensed agent gets one free, watermarked trial report when they sign up, verified by their DRE license number. From the dashboard, click New report, upload a disclosure package, and the analysis runs against your trial credit. The PDF carries a small Veroax watermark; everything else is identical to a paid report.",
      },
      {
        q: "What file formats can I upload?",
        a: "PDF only, for now. The analyzer handles multi-PDF packages (typical disclosure packages are 3 to 13 PDFs totaling 200 to 700 pages). Scanned PDFs work, but text quality drops if the scan is low resolution. If a PDF is image-only and unreadable, Veroax flags it in the report instead of silently skipping it.",
      },
      {
        q: "How large can the disclosure package be?",
        a: "We handle packages up to roughly 50 MB and 1,000 pages without issue. Larger HOA-heavy packages (with hundreds of pages of association budgets and minutes) get auto-split so each call to the model stays inside the context window. If something is too large, you will see a clear error rather than a silent truncation.",
      },
    ],
  },
  {
    id: "pricing-billing",
    label: "Pricing and billing",
    intro: "Plans, credits, refunds, and the 30-day re-analysis window.",
    items: [
      {
        q: "What about pricing?",
        a: "Solo: $49/mo for 1 report per month plus $59 per additional report. Pro: $149/mo for 8 reports plus $35 per additional. Brokerage: $449/mo for 30 reports plus $25 per additional, with team seats and white-label branding. Pay-as-you-go: $69 per report, no subscription. PAYG is intentionally priced higher per unit than the cheapest plan so that any repeat user has a clear upgrade path. If you do even one report a month, Solo saves you $20 vs paying as you go. Annual prepay saves two months on Solo and Pro. See the homepage pricing section for the live numbers.",
      },
      {
        q: "What counts as one report?",
        a: "One disclosure package on one property. You can upload any number of PDFs (TDS, SPQ, NHD, inspections, HOA documents, etc.) as long as they are all for the same property. Each property is one report credit. There is no per-page or per-PDF charge.",
      },
      {
        q: "Do unused monthly reports roll over?",
        a: "No. Monthly plan reports reset on each billing cycle. If you need more flexibility, the pay-as-you-go option does not expire and overage credits on subscription plans roll forward as long as the subscription stays active.",
      },
      {
        q: "How does the 30-day re-analysis window work?",
        a: "When a seller amends a disclosure or you receive additional documents after your initial report, you can add them to the same report and trigger a full-package re-analysis. The new analysis is free as long as it is within 30 days of the original. Outside that window, the re-analysis counts as a new report credit. The original report is preserved as a downloadable prior version so you can compare.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. All paid plans are month-to-month unless you choose annual billing for a discount. Cancel from the dashboard billing page or by emailing support. Cancellation stops the next renewal; you keep access through the end of the current period.",
      },
      {
        q: "Are refunds available?",
        a: `Yes, on a case-by-case basis. If a report fails to render, comes back materially wrong, or you signed up by mistake, email ${SUPPORT.email} and we will refund the credit or the period. We do not bait-and-switch refund policies; if a report did not deliver the value, we make it right.`,
      },
      {
        q: "Can I get an invoice or receipt?",
        a: "Yes. Every payment is processed through Stripe; you can download invoices and receipts from the dashboard billing page or directly from the Stripe customer portal. Brokerage accounts can have invoices sent to a different billing email than the account owner.",
      },
    ],
  },
  {
    id: "analysis",
    label: "Disclosures and analysis",
    intro: "How the pipeline runs and what it finds.",
    items: [
      {
        q: "How long does an analysis take?",
        a: "Typical packages (3 to 13 PDFs, 200 to 700 pages) finish in 60 to 90 seconds. Large packages with hundreds of HOA pages can take 2 to 3 minutes. A stale-analysis detector surfaces anything that stalls so you are never left guessing.",
      },
      {
        q: "Can I add documents to a report later?",
        a: "Yes. The Add documents to this report button on the report page lets you upload more files and triggers a full-package re-analysis. Updates within 30 days of the original analysis are free; outside that window, they count as a new report credit. The original report is preserved as a downloadable version.",
      },
      {
        q: "Can I remove a file I uploaded by mistake?",
        a: "Yes. Each file in the report's document inventory has a Remove button. Removing a file triggers a full-package re-analysis on the remaining files. Within the 30-day free window there is no charge for the re-run.",
      },
      {
        q: "What does Critical actually mean? How are severities decided?",
        a: "Critical means a finding that can stop the deal or kill financing if not addressed. High means significant negotiation leverage (often $5K+ in repair exposure or a known safety issue). Moderate means the buyer should address it but it will not kill the deal. Cosmetic means the buyer should be aware but it is not actionable. The blog post What a Critical severity finding actually means walks through real examples.",
      },
      {
        q: "Where do the cost estimates come from?",
        a: "From a curated California cost-reference library grounded in publicly available CSLB, RSMeans, and HomeAdvisor data plus typical agent expectations. The library is keyed to nine California regions and is refreshed biweekly. Per-finding estimates are also calibrated against the specific scope in the disclosure (a roof leak in a 1,200 sqft bungalow is a different number than a roof leak in a 3,500 sqft home).",
      },
      {
        q: "What if the analysis misses something or makes a mistake?",
        a: "Every report has a Report an error button. Tell us what is wrong (wrong severity, missed finding, bad cost estimate, fact error, anything) and an admin reviews it. Confirmed errors get a credit on your account and the underlying prompts get adjusted so the same error does not recur for other agents.",
      },
      {
        q: "Can I edit findings before sending to the client?",
        a: "You can correct any finding from the agent QA view before the final PDF is generated. Edits are tracked so you have an audit trail of what was changed and when. The buyer-facing PDF only renders after you approve the report.",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports and deliverables",
    intro: "The PDF you hand to the buyer, plus sharing and branding.",
    items: [
      {
        q: "Can I customize the PDF with my brand?",
        a: "Yes. The dashboard settings page lets you upload a headshot, a brokerage logo, and set your name, DRE license, brokerage name, tagline, contact phone, contact email, and an accent color. The PDF cover and the running header on every page pick up your branding. Brokerage plans also support white-label (no Veroax credit at the bottom of the cover).",
      },
      {
        q: "Can I share the report online instead of attaching the PDF?",
        a: "Yes. Every finished report has a public share link at /r/{code} where {code} is a 12-character unguessable code. The page is mobile-first, looks great on a phone, and shows the full report in HTML alongside a download-the-PDF button. You can revoke the link at any time.",
      },
      {
        q: "Can I send the report directly to the buyer's email?",
        a: "Yes. From the report page, click Send to client. We render the PDF, draft a buyer-ready email (which you can edit), and send it through Resend from your branded email address. We log the send to the report's history.",
      },
    ],
  },
  {
    id: "privacy",
    label: "Compliance and privacy",
    intro: "How we handle your buyer's data and the disclosure documents.",
    items: [
      {
        q: "How is buyer PII handled?",
        a: "Buyer names, financial details, lender information, and similar PII are never written to our audit log. Filenames (which often embed buyer or seller names like Smith_TDS.pdf) are hashed before logging so the audit trail can still de-duplicate without exposing names. Reports themselves are scoped per-user via row-level security; admins can access them for support but every access is logged.",
      },
      {
        q: "Do you train AI models on my client data?",
        a: "No. Our agreements with Anthropic and any other AI model providers we use explicitly prohibit using customer content (your disclosure packages and the resulting reports) for foundation model training. The agreement is published in our privacy policy.",
      },
      {
        q: "Do you store the disclosure documents?",
        a: "Yes, while the report exists. The original PDFs live in encrypted Supabase storage scoped to your user account. You can delete a report from the dashboard at any time, which removes both the report and the underlying PDFs from storage. We keep an audit log entry of the deletion but it does not contain the document contents or names.",
      },
    ],
  },
  {
    id: "team",
    label: "Account and team",
    intro: "Multiple agents, white-label, and brokerage administration.",
    items: [
      {
        q: "Can my brokerage have multiple agents on one account?",
        a: "Yes, on the Brokerage plan. The plan includes 30 reports per month pooled across the team, multi-agent admin dashboard, per-agent branding, and per-agent DRE numbers on the PDF cover. Contact us via the homepage form to set up team seats; we onboard each brokerage by hand to make sure the white-label is right.",
      },
      {
        q: "Can I white-label the report?",
        a: "Yes, on the Brokerage plan. The Veroax wordmark is removed from the PDF and the report becomes a fully branded brokerage deliverable. You keep the analysis quality, the buyer sees your brand.",
      },
    ],
  },
  {
    id: "support",
    label: "Support and troubleshooting",
    intro: "When something does not work, here is what to do.",
    items: [
      {
        q: "What if a report fails or stalls?",
        a: `Every report status is visible on the dashboard. If a run fails (rare), you will see a clear error and a Retry button. Retries do not consume an additional credit. If you see the same error twice, email ${SUPPORT.email} with the report URL and we will investigate. Common causes: scanned-only PDFs with no extractable text, or HOA bundles assembled in unusual ways.`,
      },
      {
        q: "How do I contact support?",
        a: `Phone ${SUPPORT.phone} or email ${SUPPORT.email}. Both numbers and the email are linked in the dashboard sidebar on every page and at the bottom of every report. You can also use the Feedback link to log a non-urgent suggestion or bug report.`,
      },
    ],
  },
];

// Flatten for JSON-LD FAQPage schema.
const ALL_QA = GROUPS.flatMap((g) => g.items);

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: ALL_QA.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="Veroax">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/final/veroax-lockup-light.svg"
              alt="Veroax"
              style={{ height: 30 }}
            />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-slate-600">
            <Link href="/blog" className="hover:text-slate-900">
              Blog
            </Link>
            <Link href="/" className="hover:text-slate-900">
              Home
            </Link>
            <Link
              href={`${SITE_URL}/#pricing`}
              className="hover:text-slate-900"
            >
              Pricing
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 sm:py-16">
        <div className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Frequently asked
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2 leading-tight">
            Everything you might want to know about Veroax
          </h1>
          <p className="text-slate-600 mt-4 max-w-2xl leading-relaxed">
            Pick a category, or scroll. Tap any question to expand the
            answer. If something is not here, email{" "}
            <a
              href={`mailto:${SUPPORT.email}`}
              className="text-indigo-700 underline underline-offset-2"
            >
              {SUPPORT.email}
            </a>
            {" "}or call{" "}
            <a
              href={`tel:${SUPPORT.phoneTel}`}
              className="text-indigo-700 underline underline-offset-2"
            >
              {SUPPORT.phone}
            </a>
            .
          </p>
        </div>

        {/* In-page table of contents. Anchor links jump to each
            subgroup. Sticky on desktop so it stays in view while the
            user scrolls. */}
        <div className="grid lg:grid-cols-[200px_1fr] gap-8">
          <aside className="lg:sticky lg:top-6 self-start">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
              Categories
            </p>
            <nav aria-label="FAQ categories">
              <ul className="space-y-1.5 text-sm">
                {GROUPS.map((g) => (
                  <li key={g.id}>
                    <a
                      href={`#${g.id}`}
                      className="text-slate-700 hover:text-indigo-700 transition-colors"
                    >
                      {g.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="space-y-12 min-w-0">
            {GROUPS.map((g) => (
              <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`}>
                <div className="mb-4">
                  <h2
                    id={`${g.id}-h`}
                    className="text-xl sm:text-2xl font-bold text-slate-900"
                  >
                    {g.label}
                  </h2>
                  {g.intro && (
                    <p className="text-sm text-slate-500 mt-1">{g.intro}</p>
                  )}
                </div>
                <div className="space-y-3">
                  {g.items.map((item, i) => (
                    <details
                      key={i}
                      className="group bg-white rounded-2xl border border-slate-200 open:border-indigo-200 open:shadow-md transition-all"
                    >
                      <summary className="cursor-pointer list-none px-5 sm:px-6 py-4 flex items-start justify-between gap-4">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                          {item.q}
                        </h3>
                        <span
                          aria-hidden="true"
                          className="text-slate-400 group-open:text-indigo-700 text-xl leading-none mt-0.5 transition-colors"
                        >
                          <span className="group-open:hidden">+</span>
                          <span className="hidden group-open:inline">
                            &minus;
                          </span>
                        </span>
                      </summary>
                      <div className="px-5 sm:px-6 pb-5 -mt-1">
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {item.a}
                        </p>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="mt-16 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 text-center">
          <p className="text-sm font-semibold text-slate-900">
            Did not find what you needed?
          </p>
          <p className="text-sm text-slate-600 mt-1">
            Real-person support, every weekday.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 text-sm">
            <a
              href={`tel:${SUPPORT.phoneTel}`}
              className="font-semibold text-indigo-700 hover:text-indigo-900"
              aria-label={`Call Veroax support at ${SUPPORT.phone}`}
            >
              {SUPPORT.phone}
            </a>
            <span className="hidden sm:inline text-slate-300">·</span>
            <a
              href={`mailto:${SUPPORT.email}`}
              className="text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
            >
              {SUPPORT.email}
            </a>
            <span className="hidden sm:inline text-slate-300">·</span>
            <Link
              href="/feedback"
              className="text-amber-700 hover:text-amber-900 font-semibold"
            >
              Send feedback
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
