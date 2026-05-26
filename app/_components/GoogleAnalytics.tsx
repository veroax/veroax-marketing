// gtag.js loader for GA4. Renders into the page <head> when the
// admin has saved a GA4 Measurement ID via /admin/integrations.
//
// Uses next/script with strategy="afterInteractive" so the script
// loads after hydration. We never block first paint on analytics.
// The DOM-level <Script> tag dedupes if rendered more than once.

import Script from "next/script";

type Props = {
  measurementId: string;
};

export function GoogleAnalytics({ measurementId }: Props) {
  // Defensive: bail if the ID looks malformed. The DB-level
  // normalizeGaId already validates, but client-side rendering of
  // an unexpected value should never inject arbitrary script content.
  if (!/^(G|GA|UA)-[A-Z0-9-]{6,}$/i.test(measurementId)) {
    return null;
  }

  return (
    <>
      <Script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: true });
        `}
      </Script>
    </>
  );
}
