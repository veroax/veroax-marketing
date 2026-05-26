// /admin/integrations
//
// Site-admin surface for editing site-wide configuration that lives
// in the public.site_config table. Today it's just the GA4
// Measurement ID; future integrations (Plausible, PostHog, error
// trackers, etc.) drop in alongside as additional columns + form
// fields without further page restructure.

import Link from "next/link";
import { getSiteConfig } from "@/lib/siteConfig";
import { IntegrationsForm } from "./_components/IntegrationsForm";

export const metadata = {
  title: "Integrations, Veroax admin",
};

export default async function AdminIntegrationsPage() {
  // Bypass the 60s cache so the form always reflects the most recent
  // save (admin edits should be instantly visible to the admin).
  const config = await getSiteConfig({ skipCache: true });

  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Site-wide third-party integrations. Changes apply within
          about a minute (config cache TTL).
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Google Analytics 4
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              Paste your GA4 Measurement ID (looks like{" "}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">
                G-XXXXXXXXXX
              </code>
              ). Leave empty to disable analytics tracking site-wide.
              When set, the gtag.js snippet is injected on every
              public page automatically.
            </p>
          </div>
          {config.google_analytics_id ? (
            <a
              href={`https://analytics.google.com/analytics/web/#/p${encodeURIComponent(
                config.google_analytics_id,
              )}/reports/dashboard`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2 whitespace-nowrap"
            >
              Open GA dashboard →
            </a>
          ) : null}
        </div>
        <IntegrationsForm initial={config} />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-2">
          Traffic visibility
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-4">
          Veroax does not embed a custom GA dashboard inside the
          admin (that would require a separate OAuth flow against the
          GA Data API; non-trivial to maintain). For now, traffic
          insight lives in two places:
        </p>
        <ul className="space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <span className="text-emerald-600 mt-0.5">✓</span>
            <span>
              <strong>Google Analytics dashboard</strong> (when
              configured above). Full pageviews, sources, conversions,
              audience. Use the link in the GA section once a
              Measurement ID is saved.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-600 mt-0.5">✓</span>
            <span>
              <strong>Vercel Analytics</strong>, built into your
              hosting tier. No setup beyond toggling it on in the
              Vercel project's Analytics tab. Shows real-user
              performance and basic traffic from the edge. Open at{" "}
              <a
                href="https://vercel.com/veroax/veroax-marketing/analytics"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-700 underline underline-offset-2"
              >
                Vercel project analytics →
              </a>
            </span>
          </li>
        </ul>
        <p className="text-xs text-slate-500 italic mt-5">
          If you want an in-app summary widget showing the last 7-30
          days of pageviews on the admin dashboard, that's a separate
          build (requires GA Data API setup). Ask when you want it.
        </p>
      </section>

      <p className="text-xs text-slate-500">
        Need to add an integration that is not listed here? Tell the
        founder; the schema is set up to add more columns to
        public.site_config and additional form fields below.
      </p>

      <Link
        href="/admin"
        className="inline-block text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2"
      >
        ← Back to admin dashboard
      </Link>
    </div>
  );
}
