import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { getSiteConfig } from "@/lib/siteConfig";
import { GoogleAnalytics } from "./_components/GoogleAnalytics";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Veroax | AI Disclosure Analysis for California Real Estate",
  description:
    "Turn a California residential disclosure package into a polished, 14-section buyer report in minutes. Severity-rated findings, regional cost estimates, negotiation guidance, and an overall property rating, all grounded in what the disclosures actually say.",
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

  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        {children}
        {gaId ? <GoogleAnalytics measurementId={gaId} /> : null}
      </body>
    </html>
  );
}
