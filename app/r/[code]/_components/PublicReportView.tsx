"use client";

import { useState } from "react";
import type { ReportData, Finding } from "@/lib/anthropic/schema";
import { ReportErrorButton } from "@/components/ReportErrorButton";

// Public-facing report view rendered at /r/{code}. Mobile-first
// layout, collapsible sections (Critical open by default, everything
// else collapsed), full agent + brokerage branding, prominent
// "Download PDF" action.
//
// Same data shape as the dashboard's AgentSummary so the agent and
// buyer are reading the same words. The CSS is intentionally
// conservative, Tailwind utility classes only, no custom components,
// so it renders the same in every modern browser.

type ProfileShape = {
  id: string;
  full_name: string | null;
  brokerage: string | null;
  dre_license: string | null;
  phone: string | null;
  display_email: string | null;
  brokerage_logo_url: string | null;
  headshot_url: string | null;
  brand_accent_hex: string | null;
  tagline: string | null;
  website_url: string | null;
  brokerage_dre: string | null;
  office_address: string | null;
} | null;

type Props = {
  reportId: string;
  shareCode: string;
  propertyAddress: string;
  reportName: string | null;
  clientName: string | null;
  analysisCompletedAt: string | null;
  // Bumped to match the dashboard's "Run #N" badge so the agent
  // viewing the public share link can confirm they're handing the
  // buyer the right analysis revision.
  analysisRunCount: number;
  reportData: ReportData;
  narrative: string[];
  strengths: string[];
  concerns: string[];
  profile: ProfileShape;
};

export function PublicReportView({
  reportId,
  shareCode,
  propertyAddress,
  reportName,
  clientName,
  analysisCompletedAt,
  analysisRunCount,
  reportData,
  narrative,
  strengths,
  concerns,
  profile,
}: Props) {
  const accent = profile?.brand_accent_hex || "#FBBF24"; // gold default
  // PRIVACY: do NOT fall back to profile.email (the agent's signup
  // mailbox). Only show display_email, which the agent intentionally
  // set as the address they want buyers to contact. If unset, no
  // email is rendered. (Buyers can still reach out via phone if set.)
  const agentDisplayEmail = profile?.display_email?.trim() || null;
  const ratingLabel = reportData.overall_rating?.label ?? "Unrated";
  const ratingTone = ratingPillTone(ratingLabel);

  const criticalFindings = reportData.critical_findings ?? [];
  const moderateFindings = reportData.moderate_findings ?? [];
  const cosmeticFindings = reportData.cosmetic_findings ?? [];
  const hoa = reportData.hoa;
  const environmental = reportData.environmental;
  const titleVesting = reportData.title_vesting;
  const marketContext = reportData.market_context;
  const inspectionFollowUps = reportData.inspection_follow_ups ?? [];
  const negotiation = reportData.negotiation;
  const grandTotal = reportData.cost_summary?.grand_total;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top brand banner. Reframed as the BUYER'S identity strip
          (not the agent's internal label), this URL is what the
          agent hands the buyer, so the eyebrow reads as a personalized
          delivery rather than an internal "Disclosure Package
          Analysis" label. */}
      <header
        className="text-white"
        style={{ background: "linear-gradient(135deg,#1e1b4b 0%,#0f0e2e 100%)" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <p className="text-[10px] font-bold tracking-widest uppercase text-amber-300">
            Your Disclosure Review
          </p>
          <p className="text-sm text-indigo-100 mt-1 break-words">
            {clientName
              ? `Prepared for ${clientName}`
              : `Prepared for the buyer of ${propertyAddress}`}
            {profile?.full_name ? ` by ${profile.full_name}` : ""}
            {profile?.brokerage ? `, ${profile.brokerage}` : ""}
          </p>
        </div>
        <div className="h-1" style={{ backgroundColor: accent }} />
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Hero card, title + rating pill + meta. Address is sized
            down from text-2xl/3xl to text-lg/xl so the "Report ID
            + Run #" counter underneath sits cleanly without the
            hero block dominating the scroll height. The counter
            mirrors the dashboard's "Run #N" badge so a buyer (or
            an agent viewing the share link) can spot which
            analysis revision they're looking at. */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
            {propertyAddress}
          </h1>
          <p className="text-[11px] font-mono text-slate-500 mt-1">
            Report ID {reportId.slice(0, 8)} &middot; Run #{analysisRunCount}
          </p>
          {clientName ? (
            <p className="text-sm text-slate-500 mt-2">
              Prepared for{" "}
              <span className="font-semibold text-slate-700">{clientName}</span>
            </p>
          ) : null}
          {reportName ? (
            <p className="text-xs text-slate-400 italic mt-0.5">
              Internal reference: {reportName}
            </p>
          ) : null}

          {/* Rating pill */}
          <div className="mt-4 inline-block">
            <span
              className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-md"
              style={{ backgroundColor: ratingTone.bg, color: ratingTone.fg }}
            >
              {ratingLabel}
            </span>
          </div>
          {reportData.overall_rating?.summary ? (
            <p className="text-sm sm:text-base text-slate-700 mt-3 leading-relaxed">
              {reportData.overall_rating.summary}
            </p>
          ) : null}

          {/* Quick metadata strip */}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 border-t border-slate-100 pt-3">
            {analysisCompletedAt ? (
              <span>
                <span className="font-semibold text-slate-700">Analyzed</span>{" "}
                {formatDate(analysisCompletedAt)}
              </span>
            ) : null}
            {grandTotal && grandTotal.high > 0 ? (
              <span>
                <span className="font-semibold text-slate-700">
                  Buyer cost exposure
                </span>{" "}
                {formatUSD(grandTotal.low)}–{formatUSD(grandTotal.high)}
              </span>
            ) : null}
          </div>

          {/* Download PDF + share-link copy buttons. PDF is rendered
              on-demand from the same data; the share URL is what the
              buyer is already viewing, copy convenience. */}
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={`/api/r/${shareCode}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-amber-400 text-indigo-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 text-sm shadow-sm"
            >
              <span>↓</span>
              Download as PDF
            </a>
          </div>
        </section>

        {/* "How to read this report", short framing for the buyer
            who clicked the link cold. Establishes what this is +
            who made it + what to do with it. The PDF call-out is
            intentionally NOT here, the PDF has been demoted from
            the primary deliverable across the product, the public
            web view is what we want buyers reading. */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900 mb-2">
            How to read this report
          </h2>
          <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
            {`${profile?.full_name?.trim() || "Your agent"} put this together from the seller's disclosure package, third-party inspection reports, the HOA documents, and the preliminary title report. Below is the punchline first (overall rating, top strengths, top concerns), then the full detail organized by topic. Tap any heading to expand or collapse.`}
          </p>
          <p className="text-xs text-slate-500 italic mt-3">
            Every finding shows its source document, a confidence
            level, and (where applicable) a &ldquo;Needs review&rdquo;
            flag when the underlying quote could not be verified
            against the uploaded documents. Click any source to
            open the original PDF in a new tab.
          </p>
        </section>

        {/* The plain-language summary that opens the report. Title
            reads "Summary" rather than "Agent summary" since the
            buyer is the audience here, not the agent. */}
        <Section title="Summary" defaultOpen>
          <div className="space-y-3 text-sm sm:text-base text-slate-700 leading-relaxed">
            {narrative.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Section>

        {/* Top strengths / top concerns, dual block on desktop,
            stacked on mobile. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="text-xs font-bold tracking-widest uppercase text-emerald-800 mb-3">
              Top Strengths
            </h3>
            <ol className="space-y-2 text-sm text-emerald-950">
              {strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-bold shrink-0">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <h3 className="text-xs font-bold tracking-widest uppercase text-red-800 mb-3">
              Top Concerns
            </h3>
            <ol className="space-y-2 text-sm text-red-950">
              {concerns.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-bold shrink-0">{i + 1}.</span>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Critical findings, open by default. */}
        <Section
          title={`Critical findings (${criticalFindings.length})`}
          defaultOpen
        >
          {criticalFindings.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              No critical findings identified.
            </p>
          ) : (
            <div className="space-y-4">
              {criticalFindings.map((f, i) => (
                <FindingCard
                  key={i}
                  finding={f}
                  index={i + 1}
                  shareCode={shareCode}
                />
              ))}
            </div>
          )}
        </Section>

        {/* High & Moderate, collapsed by default. */}
        <Section
          title={`High & moderate findings (${moderateFindings.length})`}
          defaultOpen={false}
        >
          {moderateFindings.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              No high or moderate findings.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {moderateFindings.map((f, i) => (
                <li key={i} className="py-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm flex-1 min-w-0">
                      {f.title}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {f.quote_match_failed ? (
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded"
                          title="The source quote for this finding could not be verified."
                        >
                          Needs review
                        </span>
                      ) : null}
                      <ConfidencePill confidence={f.confidence} />
                    </div>
                  </div>
                  <p className="mt-1">
                    <SourceLink shareCode={shareCode} source={f.source} />
                  </p>
                  <p className="text-sm text-slate-700 mt-1">
                    {f.description || f.what_it_is || f.recommended_action}
                  </p>
                  {f.cost_estimate && f.cost_estimate.high > 0 && f.cost_responsibility !== "hoa" ? (
                    <p className="text-xs text-slate-500 mt-1">
                      Est. cost: {formatUSD(f.cost_estimate.low)} to{" "}
                      {formatUSD(f.cost_estimate.high)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Cosmetic notes, collapsed. */}
        <Section
          title={`Cosmetic notes (${cosmeticFindings.length})`}
          defaultOpen={false}
        >
          {cosmeticFindings.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              No cosmetic findings noted.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm text-slate-700">
              {cosmeticFindings.map((f, i) => (
                <li key={i} className="py-2.5">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <span className="flex-1 min-w-0">{f.title}</span>
                    <ConfidencePill confidence={f.confidence} />
                  </div>
                  {f.source ? (
                    <p className="mt-1">
                      <SourceLink shareCode={shareCode} source={f.source} />
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* HOA */}
        {hoa?.applicable ? (
          <Section title="HOA review" defaultOpen={false}>
            <p className="text-sm text-slate-700 leading-relaxed">
              {hoa.summary}
            </p>
            {hoa.facts && hoa.facts.length > 0 ? (
              <dl className="mt-3 divide-y divide-slate-200">
                {hoa.facts.map((f, i) => (
                  <div
                    key={i}
                    className="py-2 grid grid-cols-3 sm:grid-cols-4 gap-2 text-sm"
                  >
                    <dt className="font-semibold text-slate-700 col-span-1">
                      {f.label}
                    </dt>
                    <dd className="text-slate-700 col-span-2 sm:col-span-3 break-words">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {hoa.reserve_health_read ? (
              <>
                <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mt-4 mb-1">
                  Reserve health, our read
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {hoa.reserve_health_read}
                </p>
              </>
            ) : null}
            {hoa.watch_items ? (
              <>
                <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mt-4 mb-1">
                  Watch items
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {hoa.watch_items}
                </p>
              </>
            ) : null}
            {hoa.concerns && hoa.concerns.length > 0 ? (
              <>
                <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mt-4 mb-1">
                  Concerns
                </p>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  {hoa.concerns.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-slate-400 shrink-0">·</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Section>
        ) : null}

        {/* Environmental & hazards */}
        {environmental?.hazards && environmental.hazards.length > 0 ? (
          <Section title="Environmental & hazard disclosures" defaultOpen={false}>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">
              {environmental.summary}
            </p>
            <div className="space-y-2">
              {environmental.hazards.map((h, i) => {
                const inZone = h.severity !== "cosmetic";
                return (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 text-sm py-2 border-b border-slate-100"
                  >
                    <p className="col-span-12 sm:col-span-5 font-semibold text-slate-900">
                      {h.name}
                    </p>
                    <p
                      className={`col-span-3 sm:col-span-2 font-bold text-xs ${inZone ? "text-red-700" : "text-emerald-700"}`}
                    >
                      {inZone ? "IN" : "NOT IN"}
                    </p>
                    <p className="col-span-9 sm:col-span-5 text-slate-700 text-xs sm:text-sm">
                      {h.notes}
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>
        ) : null}

        {/* Title & vesting */}
        {titleVesting ? (
          <Section title="Title & vesting" defaultOpen={false}>
            <p className="text-sm text-slate-700 leading-relaxed">
              {titleVesting.vesting_summary}
            </p>
            {titleVesting.liens_summary ? (
              <>
                <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mt-4 mb-1">
                  Liens of note
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {titleVesting.liens_summary}
                </p>
              </>
            ) : null}
            {titleVesting.recorded_matters ? (
              <>
                <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mt-4 mb-1">
                  Recorded matters
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {titleVesting.recorded_matters}
                </p>
              </>
            ) : null}
          </Section>
        ) : null}

        {/* Negotiation leverage */}
        {negotiation?.leverage_points && negotiation.leverage_points.length > 0 ? (
          <Section title="Negotiation leverage" defaultOpen={false}>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">
              {negotiation.summary}
            </p>
            <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
              {negotiation.leverage_points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </Section>
        ) : null}

        {/* Market context */}
        {marketContext?.summary ? (
          <Section title="Market context" defaultOpen={false}>
            <p className="text-sm text-slate-700 leading-relaxed">
              {marketContext.summary}
            </p>
            {marketContext.monthly_carrying_cost ? (
              <p className="text-sm text-slate-700 mt-3">
                <span className="font-semibold">Monthly carrying cost: </span>
                {marketContext.monthly_carrying_cost}
              </p>
            ) : null}
            {marketContext.mortgage_rate_range ? (
              <p className="text-sm text-slate-700">
                <span className="font-semibold">Mortgage rate range: </span>
                {marketContext.mortgage_rate_range}
              </p>
            ) : null}
            {marketContext.comparable_units &&
            marketContext.comparable_units.length > 0 ? (
              <>
                <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mt-4 mb-1">
                  Comparable units
                </p>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  {marketContext.comparable_units.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-slate-400 shrink-0">·</span>
                      <span>
                        <span className="font-semibold">{c.label}: </span>
                        {c.status}
                        {c.note ? ` · ${c.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Section>
        ) : null}

        {/* Suggested inspection follow-ups */}
        {inspectionFollowUps.length > 0 ? (
          <Section title="Suggested inspection follow-ups" defaultOpen={false}>
            <ol className="space-y-3 text-sm text-slate-700 list-decimal list-inside">
              {inspectionFollowUps.map((f, i) => (
                <li key={i}>
                  <span className="font-semibold text-slate-900">
                    {f.specialist}
                  </span>{" "}
                  : {f.reason}{" "}
                  <span className="text-xs text-slate-500">
                    ({f.approx_cost})
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {/* Overall rating detail. The section title was "Why this
            rating" but the actual rating label was nowhere inside
            the section, so a buyer expanding it saw the "why"
            without the "what." We now render the rating pill at
            the top of the section content so the section is
            self-contained: rating + reasoning + conditions, all in
            one place. */}
        {reportData.overall_rating?.why_this_rating ||
        reportData.overall_rating?.conditions_on_which_this_depends ? (
          <Section title="Why this rating" defaultOpen={false}>
            <div className="mb-3">
              <span
                className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-md inline-block"
                style={{
                  backgroundColor: ratingTone.bg,
                  color: ratingTone.fg,
                }}
              >
                {ratingLabel}
              </span>
            </div>
            {reportData.overall_rating?.why_this_rating ? (
              <p className="text-sm text-slate-700 leading-relaxed">
                {reportData.overall_rating.why_this_rating}
              </p>
            ) : null}
            {reportData.overall_rating?.conditions_on_which_this_depends ? (
              <>
                <p className="text-xs font-bold tracking-widest uppercase text-slate-700 mt-4 mb-1">
                  Conditions on which this rating depends
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {reportData.overall_rating.conditions_on_which_this_depends}
                </p>
              </>
            ) : null}
          </Section>
        ) : null}

        {/* Report-an-error affordance for the public viewer too ,
            we'll resolve their email to a Veroax account when
            granting credit (works for the agent who shared the
            link; anonymous buyer submissions go to the admin
            queue for review). */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 text-sm text-slate-700 flex items-center justify-between gap-3 flex-wrap">
          <span>
            Notice something wrong with this report?
          </span>
          <ReportErrorButton reportId={reportId} />
        </div>

        {/* Disclaimer */}
        <div className="text-xs text-slate-500 leading-relaxed bg-slate-100 rounded-xl p-4">
          <p className="font-semibold text-slate-700 mb-1">About this report</p>
          This document was produced with the assistance of artificial
          intelligence reviewing the seller&apos;s disclosure package, third-party
          inspection reports, the HOA document package, and the public
          listing. It is intended to summarize and highlight what the
          documents say, not to substitute for independent inspection or
          legal counsel. Findings labeled with confidence tags reflect how
          directly each item was supported by the source documents.
        </div>
      </main>

      {/* Agent footer, branding sits at the bottom so the buyer sees
          the punchline first, the agent identity last. */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-start gap-4 flex-wrap">
            {profile?.headshot_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.headshot_url}
                alt={profile.full_name ?? "Agent"}
                className="w-14 h-14 rounded-full object-cover shrink-0 border border-slate-200"
              />
            ) : null}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold tracking-widest uppercase text-slate-500">
                Prepared by
              </p>
              <p className="font-bold text-slate-900 text-lg mt-0.5">
                {profile?.full_name ?? "Veroax"}
              </p>
              {profile?.tagline ? (
                <p className="text-sm italic text-slate-500 mt-0.5">
                  {profile.tagline}
                </p>
              ) : null}
              <div className="text-sm text-slate-700 mt-2 space-y-0.5">
                {profile?.brokerage ? <p>{profile.brokerage}</p> : null}
                {profile?.dre_license ? (
                  <p className="text-xs text-slate-500">
                    DRE #{profile.dre_license}
                    {profile.brokerage_dre
                      ? ` · Brokerage DRE #${profile.brokerage_dre}`
                      : ""}
                  </p>
                ) : null}
                {profile?.phone ? (
                  <p>
                    <a
                      href={`tel:${profile.phone}`}
                      className="hover:text-indigo-700"
                    >
                      {profile.phone}
                    </a>
                  </p>
                ) : null}
                {agentDisplayEmail ? (
                  <p>
                    <a
                      href={`mailto:${agentDisplayEmail}`}
                      className="hover:text-indigo-700 underline underline-offset-2"
                    >
                      {agentDisplayEmail}
                    </a>
                  </p>
                ) : null}
                {profile?.website_url ? (
                  <p>
                    <a
                      href={profile.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-indigo-700 underline underline-offset-2"
                    >
                      {profile.website_url}
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
            {profile?.brokerage_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.brokerage_logo_url}
                alt={profile.brokerage ?? "Brokerage"}
                className="max-w-32 max-h-16 object-contain shrink-0"
              />
            ) : null}
          </div>
          <p className="text-[10px] text-slate-400 mt-4">
            Powered by Veroax · veroax.com · Report ID {reportId.slice(0, 8)}
          </p>
        </div>
      </footer>
    </div>
  );
}

// Reusable collapsible section, native <details> for the no-JS path
// (works on every browser), plus client-side state so the open/close
// animation is smooth. Critical findings + agent summary default open;
// everything else is collapsed.
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 sm:px-6 py-4 hover:bg-slate-50 transition-colors"
        aria-expanded={open}
      >
        <h2 className="text-base sm:text-lg font-bold text-slate-900 text-left">
          {title}
        </h2>
        <span
          className={`text-slate-400 text-sm transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>
      {open ? (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 border-t border-slate-100 pt-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

// Shared parser for source citations like "CalPro Home Inspection,
// page 10" or "AVID p. 4". Returns the filename hint (what we send
// to the source-url endpoint) plus the page number when one is
// cited. Page number is appended as #page=N on the resolved URL so
// the buyer lands on the right page rather than page 1 of a
// 200-page PDF.
function parseSourceCitation(source: string): {
  filenameHint: string;
  page: number | null;
} {
  const pageMatch =
    source.match(/page\s+(\d+)/i) ?? source.match(/p\.?\s*(\d+)/i);
  const page = pageMatch ? parseInt(pageMatch[1], 10) : null;
  const stripped = source
    .replace(/,?\s*(section|sec\.?)\s+[\w.]+/gi, "")
    .replace(/,?\s*page\s+\d+/gi, "")
    .replace(/,?\s*p\.?\s*\d+/gi, "")
    .trim();
  return { filenameHint: stripped, page };
}

// Click handler for the "Source: X" button on every finding card.
// Hits the public /api/r/[code]/source-url endpoint, which mints a
// short-lived signed URL to the source PDF in storage. Opens the
// result in a new tab. Failures land in an alert() so the buyer
// knows something went wrong rather than getting silent nothing.
async function openSourceForCode(args: {
  shareCode: string;
  source: string;
}): Promise<void> {
  const parsed = parseSourceCitation(args.source);
  try {
    const params = new URLSearchParams({ file: parsed.filenameHint });
    const res = await fetch(
      `/api/r/${args.shareCode}/source-url?${params.toString()}`,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(
        `Could not open the source document: ${data?.error ?? `HTTP ${res.status}`}`,
      );
      return;
    }
    const finalUrl = parsed.page
      ? `${data.url}#page=${parsed.page}`
      : data.url;
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  } catch (err) {
    alert(
      `Could not open the source document: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
}

// Small confidence pill rendered next to every finding. Same color
// scheme as the dashboard so an agent reviewing the share link
// recognizes it from /dashboard/reports/<id>.
function ConfidencePill({ confidence }: { confidence: string }) {
  const tone =
    confidence === "high"
      ? "bg-emerald-100 text-emerald-800"
      : confidence === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${tone}`}
      title="How directly the source documents support this finding"
    >
      {confidence} confidence
    </span>
  );
}

// Source-document button. Click opens the source PDF in a new tab
// via the public share-code source-url endpoint. When the source
// citation isn't a meaningful string ("the documents" or empty),
// we render plain text instead of a button so the affordance is
// honest about whether there's somewhere to actually go.
function SourceLink({
  shareCode,
  source,
}: {
  shareCode: string;
  source: string;
}) {
  const meaningful =
    typeof source === "string" &&
    source.trim().length > 3 &&
    !/^(the documents|the package|unknown)$/i.test(source.trim());
  if (!meaningful) {
    return (
      <span className="text-xs italic text-slate-500">
        Source: {source || "not cited"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openSourceForCode({ shareCode, source })}
      className="text-xs italic text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
      title="Open the source document in a new tab"
    >
      Source: {source} &nearr;
    </button>
  );
}

// Critical-finding card, matches the PDF's five-zone layout:
// title + severity, quote, what/why/next, cost, confidence.
function FindingCard({
  finding,
  index,
  shareCode,
}: {
  finding: Finding;
  index: number;
  shareCode: string;
}) {
  const hoaPaid = finding.cost_responsibility === "hoa";
  const hasCost =
    finding.cost_estimate &&
    (finding.cost_estimate.low > 0 || finding.cost_estimate.high > 0);
  const whatItIs =
    finding.what_it_is?.trim() || finding.description?.trim() || null;
  const whyItMatters =
    finding.why_it_matters?.trim() || finding.risk_if_ignored?.trim() || null;
  const nextStep =
    finding.next_step?.trim() || finding.recommended_action?.trim() || null;

  return (
    <article className="bg-red-50/40 border border-red-200/60 rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <h3 className="font-bold text-red-900 text-base sm:text-lg flex-1 min-w-0">
          {index}. {finding.title}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {finding.quote_match_failed ? (
            // Surfaced when the post-analyzer quote validator could
            // not match this finding's source_quote against the
            // uploaded documents' extracted text. The finding stays
            // visible but the buyer is explicitly told to verify
            // before relying on it. Same posture as the dashboard.
            <span
              className="text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded"
              title="The source quote for this finding could not be verified against the uploaded documents. Open the source to confirm."
            >
              Needs review
            </span>
          ) : null}
          <span className="text-[10px] font-bold uppercase tracking-wider bg-red-700 text-white px-2 py-0.5 rounded">
            {finding.severity}
          </span>
          <ConfidencePill confidence={finding.confidence} />
        </div>
      </div>

      {finding.source_quote ? (
        <>
          <p className="text-[11px] italic text-slate-500 mb-1">
            From the source document:
          </p>
          <blockquote className="text-sm italic text-slate-700 border-l-2 border-slate-300 pl-3 mb-2">
            &ldquo;{finding.source_quote}&rdquo;
          </blockquote>
        </>
      ) : null}
      <p className="mb-3">
        <SourceLink shareCode={shareCode} source={finding.source} />
      </p>

      {whatItIs ? (
        <p className="text-sm text-slate-700 leading-relaxed mb-2">
          <span className="font-semibold">What it is: </span>
          {whatItIs}
        </p>
      ) : null}
      {whyItMatters ? (
        <p className="text-sm text-slate-700 leading-relaxed mb-2">
          <span className="font-semibold">Why it matters: </span>
          {whyItMatters}
        </p>
      ) : null}
      {nextStep ? (
        <p className="text-sm text-slate-700 leading-relaxed mb-2">
          <span className="font-semibold">Next step: </span>
          {nextStep}
        </p>
      ) : null}

      {hoaPaid ? (
        <p className="text-xs text-slate-600 mt-3 bg-slate-100 rounded px-3 py-2">
          <span className="font-semibold">Cost responsibility:</span> HOA /
          association (paid from reserves or assessments, the buyer does not
          write this check directly).
        </p>
      ) : hasCost ? (
        <p className="text-xs text-slate-700 mt-3">
          <span className="font-semibold">Cost range:</span>{" "}
          {formatUSD(finding.cost_estimate.low)}–
          {formatUSD(finding.cost_estimate.high)}
          {finding.immediate_out_of_pocket &&
          finding.immediate_out_of_pocket.high > 0 ? (
            <>
              {"  ·  "}
              <span className="font-semibold">Immediate out-of-pocket:</span>{" "}
              {formatUSD(finding.immediate_out_of_pocket.low)}–
              {formatUSD(finding.immediate_out_of_pocket.high)}
            </>
          ) : null}
        </p>
      ) : null}

    </article>
  );
}

function ratingPillTone(label: string): { bg: string; fg: string } {
  switch (label) {
    case "Excellent":
      return { bg: "#DFF5E8", fg: "#1F6F3A" };
    case "Good":
      return { bg: "#E8F4D9", fg: "#1F6F3A" };
    case "Acceptable":
      return { bg: "#F7EEDB", fg: "#8A6D1C" };
    case "Significant Concerns":
      return { bg: "#FDECEA", fg: "#A02D1F" };
    case "Walk Away":
      return { bg: "#F8D7DA", fg: "#A02D1F" };
    default:
      return { bg: "#F1F5F9", fg: "#1E2A5E" };
  }
}

function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
  });
}
