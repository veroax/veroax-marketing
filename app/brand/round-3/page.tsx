import Link from "next/link";

// Round 3 lockup options. After the user rejected all of round 2,
// this round abandons the navy + gold + V-in-square pattern entirely.
// Brighter colors, friendlier shapes, lowercase wordmarks where
// appropriate. Each option ships with a paired light and dark SVG so
// the founder can see how it holds up on a white page AND on a dark
// background side by side.

export const metadata = {
  title: "Brand lockup round 3, Veroax",
  robots: { index: false, follow: false },
};

type Option = {
  id: string;
  name: string;
  light: string;
  dark: string;
  why: string;
};

const OPTIONS: Option[] = [
  {
    id: "01",
    name: "Lowercase coral + teal dot",
    light: "/brand/v3-01-coral-lowercase-light.svg",
    dark: "/brand/v3-01-coral-lowercase-dark.svg",
    why: "No graphic mark at all. The typography IS the brand (like Notion, Linear, Stripe). Coral reads warmer and friendlier than navy and the teal dot after the word acts as a tiny distinctive flourish that is hard to confuse with anything else. Strongest at favicon scale (the dot becomes the icon).",
  },
  {
    id: "02",
    name: "Sage leaf",
    light: "/brand/v3-02-sage-leaf-light.svg",
    dark: "/brand/v3-02-sage-leaf-dark.svg",
    why: "An organic leaf shape that hints at a V without being literal. Sage green reads as growth, calm, and trustworthy. Softer than navy, friendlier than corporate. Stands out from the sea of square logos in proptech.",
  },
  {
    id: "03",
    name: "Marigold sunburst",
    light: "/brand/v3-03-sunburst-light.svg",
    dark: "/brand/v3-03-sunburst-dark.svg",
    why: "Eight rays from a center dot suggest insight, illumination, and shining a light on disclosures. Warm and optimistic. The radial symmetry reads cleanly at 16px favicon scale, which most logos do not.",
  },
  {
    id: "04",
    name: "Sky speech bubble",
    light: "/brand/v3-04-speech-bubble-light.svg",
    dark: "/brand/v3-04-speech-bubble-dark.svg",
    why: "A rounded square with a small chat tail at the bottom. Suggests we explain it to you and conversation-style summaries. Sky blue is calm and trustworthy without falling into corporate-navy territory. Three dots inside hint at the severity rating.",
  },
  {
    id: "05",
    name: "Terracotta arch",
    light: "/brand/v3-05-arch-light.svg",
    dark: "/brand/v3-05-arch-dark.svg",
    why: "A simple keystone arch reads as architecture, foundation, and doorway to the deal. Warm terracotta is unusual in SaaS and gives the brand a hand-built, boutique feel. Memorable silhouette that is easy to trademark.",
  },
  {
    id: "06",
    name: "Sun over peak",
    light: "/brand/v3-06-sun-peak-light.svg",
    dark: "/brand/v3-06-sun-peak-dark.svg",
    why: "A teal sun rising behind a coral peak (mountain or roof). Optimistic, California sunrise feel. Two complementary colors give the mark visual energy without crowding it. Distinctively non-corporate.",
  },
  {
    id: "07",
    name: "Overlapping circles",
    light: "/brand/v3-07-overlapping-circles-light.svg",
    dark: "/brand/v3-07-overlapping-circles-dark.svg",
    why: "Two circles in coral and teal with a soft overlap. Suggests two parties (agent and buyer) finding common ground, or signal from noise. Friendly, conversational, and feels modern. Plays well next to other modern SaaS marks without copying them.",
  },
  {
    id: "08",
    name: "Marigold X",
    light: "/brand/v3-08-marigold-x-light.svg",
    dark: "/brand/v3-08-marigold-x-dark.svg",
    why: "Veroax's other distinctive letter is the X. A bold marigold X sits to the left of the full wordmark as the mark. Energetic and friendly. Easy to use the X alone as a favicon or app icon while the wordmark serves longer-form contexts.",
  },
  {
    id: "09",
    name: "Single-stroke curved V",
    light: "/brand/v3-09-curved-v-light.svg",
    dark: "/brand/v3-09-curved-v-dark.svg",
    why: "One elegant flowing line forms a V. Plum violet color feels intelligent and calming. Reads as we make a clear judgment for you. The single stroke is distinctive and lightweight, which works at any size.",
  },
  {
    id: "10",
    name: "Three severity dots",
    light: "/brand/v3-10-traffic-dots-light.svg",
    dark: "/brand/v3-10-traffic-dots-dark.svg",
    why: "Red, amber, green in a row reads as the severity rating system the product actually produces. Honest about what Veroax does: triage. Friendly, immediately recognizable, and reproduces at 16px favicon scale because the three dots stay legible.",
  },
];

export default function Round3Page() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-slate-900">
            Veroax
          </Link>
          <div className="flex gap-4 text-xs text-slate-500">
            <Link
              href="/brand/variations"
              className="hover:text-slate-900"
            >
              Round 1
            </Link>
            <Link
              href="/brand/round-2"
              className="hover:text-slate-900"
            >
              Round 2
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Lockup round 3, ten happier directions
          </h1>
          <p className="text-sm text-slate-600 mt-3 max-w-3xl leading-relaxed">
            Round 2 stayed too close to the navy + gold + V-in-square
            pattern. This round abandons that entirely. Brighter palette
            (coral, teal, marigold, sage, sky, terracotta, plum),
            organic or playful shapes, and a couple of options with no
            graphic mark at all. The baseline still sits at the top of
            this page for reference. Wordmark stays unified throughout
            (no Vero / ax split). Each option ships paired light + dark.
          </p>
        </div>

        {/* Baseline reference */}
        <section className="mb-12 bg-white rounded-2xl border-2 border-amber-300 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-amber-700">
                Baseline for reference
              </p>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                v1 refined, gold #D4B85C
              </h2>
            </div>
            <a
              href="/brand/lockup-v1-refined-a.svg"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-700 underline underline-offset-2"
            >
              View raw SVG
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-6 flex items-center justify-center min-h-[100px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/lockup-v1-refined-a.svg"
                alt="Baseline on light"
                style={{ height: 50 }}
              />
            </div>
            <div
              className="rounded-lg p-6 flex items-center justify-center min-h-[100px]"
              style={{ background: "#0F0E2E" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/lockup-v1-refined-a.svg"
                alt="Baseline on dark"
                style={{ height: 50 }}
              />
            </div>
          </div>
        </section>

        <div className="space-y-6">
          {OPTIONS.map((o) => (
            <article
              key={o.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
                    Option {o.id}
                  </p>
                  <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                    {o.name}
                  </h2>
                </div>
                <div className="flex gap-3 text-xs">
                  <a
                    href={o.light}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-700 underline underline-offset-2"
                  >
                    Light SVG
                  </a>
                  <a
                    href={o.dark}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-700 underline underline-offset-2"
                  >
                    Dark SVG
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Light version on white */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 flex items-center justify-center min-h-[100px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={o.light}
                    alt={`${o.name} on light`}
                    style={{ height: 50 }}
                  />
                </div>
                {/* Dark version on dark navy */}
                <div
                  className="rounded-lg p-6 flex items-center justify-center min-h-[100px]"
                  style={{ background: "#0F0E2E" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={o.dark}
                    alt={`${o.name} on dark`}
                    style={{ height: 50 }}
                  />
                </div>
              </div>

              {/* Small-scale preview row, favicon-sized tiles. */}
              <div className="flex items-center gap-3 mb-4 text-xs text-slate-500 flex-wrap">
                <span>At favicon scale:</span>
                <div className="bg-white border border-slate-200 rounded p-2 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.light} alt="" style={{ height: 24 }} />
                </div>
                <div
                  className="rounded p-2 flex items-center justify-center"
                  style={{ background: "#0F0E2E" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.dark} alt="" style={{ height: 24 }} />
                </div>
                <div className="bg-black rounded p-2 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.dark} alt="" style={{ height: 24 }} />
                </div>
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">
                {o.why}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-12 bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            What to do next
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Pick the option you like best (or say something like &quot;Option 03 but in coral&quot;).
            Once you decide, I will:
          </p>
          <ol className="list-decimal list-inside text-sm text-slate-700 mt-3 space-y-1">
            <li>Wire the lockup into the marketing site header + footer</li>
            <li>Generate the favicon set (16/32/180/512) from the mark alone</li>
            <li>Build the OG image for social shares</li>
            <li>
              Update the PDF cover and email templates so every
              customer-facing surface uses the same identity
            </li>
            <li>
              Save the full brand asset bundle (SVG light, SVG dark, PNG
              versions in multiple sizes) under{" "}
              <span className="font-mono">/public/brand/final/</span> as
              the canonical reference
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}
