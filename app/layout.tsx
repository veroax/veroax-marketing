import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { getSiteConfig } from "@/lib/siteConfig";
import { GoogleAnalytics } from "./_components/GoogleAnalytics";
import { SignedInChip } from "./_components/SignedInChip";
import { headers } from "next/headers";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.veroax.com";

const SITE_DESCRIPTION =
  "Turn a California residential disclosure package into a polished, 14-section analysis in minutes. Severity-rated findings, regional cost estimates, negotiation guidance, and an overall property rating, all grounded in what the disclosures actually say. Built for agents preparing the deal.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "Veroax | AI Disclosure Analysis for California Real Estate",
    template: "%s | Veroax",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Veroax",
  keywords: [
    "California disclosure analysis",
    "real estate disclosure AI",
    "TDS analysis",
    "SPQ analysis",
    "NHD report review",
    "buyer disclosure report",
    "California real estate technology",
    "Bay Area realtor tools",
  ],
  authors: [{ name: "Veroax, Inc." }],
  creator: "Veroax, Inc.",
  publisher: "Veroax, Inc.",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Veroax",
    url: SITE_URL,
    title: "Veroax | AI Disclosure Analysis for California Real Estate",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/brand/final/veroax-lockup-light.svg",
        width: 1200,
        height: 630,
        alt: "Veroax",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Veroax | AI Disclosure Analysis for California Real Estate",
    description: SITE_DESCRIPTION,
    images: ["/brand/final/veroax-lockup-light.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F0E2E",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Pull site-wide config (e.g., GA4 ID) from the database. Cached
  // in-memory for 60s so this isn't a per-render DB hit. Admin saves
  // flush the cache so changes are visible on the next render.
  const config = await getSiteConfig();
  const gaId = config.google_analytics_id;

  // Suppress the "Signed in as" chip on /r/<code> pages so an
  // anonymous buyer who follows a share link can't see the
  // authenticated agent's identity. Everywhere else (marketing,
  // dashboard, admin, even the not-found and auth pages) the chip
  // renders when a session is active and hides itself when not.
  // We read the pathname off the proxy-injected x-pathname header
  // (set in proxy.ts); fall back to "render the chip" when the
  // header is absent so we err on the side of being informative.
  const reqHeaders = await headers();
  const pathname = reqHeaders.get("x-pathname") ?? "";
  const suppressChip = pathname.startsWith("/r/");
  // Suppress Google Analytics on /admin/* so admin browsing doesn't
  // pollute the marketing-funnel metrics. Founder-only navigation
  // through user impersonation, billing audits, integrations
  // dashboards, etc. is not a signal we want competing with real
  // visitor traffic in GA reports. Marketing, dashboard, and the
  // public /r/<code> surfaces continue to be tracked when a GA ID
  // is configured.
  const suppressGA = pathname.startsWith("/admin");

  // Belt-and-suspenders for the GA suppression: if the admin clicks
  // from /dashboard to /admin within the same SPA session, gtag.js
  // is already loaded in memory and GA4 Enhanced Measurement will
  // fire automatic page_view events on history changes. Setting
  // window['ga-disable-MEASUREMENT_ID'] = true is the official GA
  // opt-out toggle; on /admin we set it true, everywhere else we
  // set it false so navigation BACK to /dashboard resumes tracking.
  // Runs after every navigation because Next.js re-evaluates the
  // layout's <Script> tags on each RSC commit.
  const gaToggleScript = gaId
    ? `window['ga-disable-${gaId.replace(/'/g, "")}'] = ${suppressGA ? "true" : "false"};`
    : null;

  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        {gaToggleScript ? (
          <Script
            id="ga-admin-toggle"
            strategy="afterInteractive"
          >
            {gaToggleScript}
          </Script>
        ) : null}
        {children}
        <SignedInChip hidden={suppressChip} />
        {gaId && !suppressGA ? (
          <GoogleAnalytics measurementId={gaId} />
        ) : null}
      </body>
    </html>
  );
}
