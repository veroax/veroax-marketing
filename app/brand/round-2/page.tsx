import Link from "next/link";

// Round 2 lockup options. The baseline (v1 refined gold #D4B85C)
// sits at the top for reference; ten new departures sit below with
// light + dark previews side by side. Each card explains the design
// reasoning in plain language so the founder can pick on aesthetics
// AND on rationale.

export const metadata = {
  title: "Brand lockup · round 2, Veroax",
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
    name: "Solid V silhouette",
    light: "/brand/v2-01-solid-v-light.svg",
    dark: "/brand/v2-01-solid-v-dark.svg",
    why: "No container box, just a bold filled V shape standing on its own. Clean, brave, easy to reproduce at any size. The silhouette IS the brand. Risk: a plain V is harder to trademark than a composition with multiple elements; the wordmark pairing carries the uniqueness.",
  },
  {
    id: "02",
    name: "Square + corner notch",
    light: "/brand/v2-02-corner-notch-light.svg",
    dark: "/brand/v2-02-corner-notch-dark.svg",
    why: "Distinctive silhouette, FedEx-style cleverness. The notched upper-right corner makes the mark uniquely identifiable. Pairs the baseline V with a more trademark-friendly container shape. My personal favorite of the set for memorability.",
  },
  {
    id: "03",
    name: "Three stacked bars",
    light: "/brand/v2-03-stacked-bars-light.svg",
    dark: "/brand/v2-03-stacked-bars-dark.svg",
    why: "Abstract document-pages mark. Three bars of descending length read as a stylized document being summarized, which is exactly what Veroax does. Bold, simple, no fine lines. Reproduces at 16px favicon scale.",
  },
  {
    id: "04",
    name: "Concentric squares",
    light: "/brand/v2-04-concentric-light.svg",
    dark: "/brand/v2-04-concentric-dark.svg",
    why: "Three nested rounded squares suggesting 'focused analysis' / 'drilling down to what matters.' Outer + middle outlined, inner is a solid gold block, your eye is pulled to the center. Geometric and memorable. Slight risk: the inner-target pattern is used by several other brands.",
  },
  {
    id: "05",
    name: "Crown V",
    light: "/brand/v2-05-crown-v-light.svg",
    dark: "/brand/v2-05-crown-v-dark.svg",
    why: "The baseline V plus a horizontal bar across the top. The crossbar makes the mark harder to confuse with a generic checkmark, and adds a regal / institutional quality. Strong trademarkable composition because the bar-plus-V together is distinctive.",
  },
  {
    id: "06",
    name: "Hexagonal V",
    light: "/brand/v2-06-hex-v-light.svg",
    dark: "/brand/v2-06-hex-v-dark.svg",
    why: "Replaces the rounded square with a flat-top hexagon. Reads as technical / scientific / engineered, feels like a 'verified component' stamp. The hex outline plus the V inside is a strong, trademark-friendly composition.",
  },
  {
    id: "07",
    name: "Folded corner",
    light: "/brand/v2-07-folded-corner-light.svg",
    dark: "/brand/v2-07-folded-corner-dark.svg",
    why: "Bold rounded square with the upper-right corner 'folded' forward, revealing a gold triangle underneath. Deliberate document / page reference that ties the mark directly to disclosure analysis. Memorable silhouette without being literal.",
  },
  {
    id: "08",
    name: "V + signature line",
    light: "/brand/v2-08-v-underline-light.svg",
    dark: "/brand/v2-08-v-underline-dark.svg",
    why: "Solid filled V silhouette with a bold gold underline beneath it, like a signature stamp. Reads as 'verified, signed off, approved.' Strong typographic feel. The underline is the distinctive element that makes the composition trademark-friendly.",
  },
  {
    id: "09",
    name: "Diamond",
    light: "/brand/v2-09-diamond-light.svg",
    dark: "/brand/v2-09-diamond-dark.svg",
    why: "Rotated square (a diamond) holds a solid filled V silhouette. Diamonds are rare in financial / SaaS branding, which gives the mark immediate distinctiveness. Reads as precise, premium, geometric. Stands out from the sea of rounded-square logos.",
  },
  {
    id: "10",
    name: "Double V depth",
    light: "/brand/v2-10-double-v-light.svg",
    dark: "/brand/v2-10-double-v-dark.svg",
    why: "Two solid V silhouettes layered with a slight offset. The back V is gold, the front V is navy, creating a dimensional, slightly Op-Art feel. Suggests 'multi-pass analysis' / 'look again' without being literal. Distinctive composition that's strong on trademarkability.",
  },
];

export default function Round2Page() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-slate-900">
            Veroax
          </Link>
          <Link
            href="/brand/variations"
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            Round 1 →
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Lockup round 2 · ten new options
          </h1>
          <p className="text-sm text-slate-600 mt-3 max-w-3xl leading-relaxed">
            All ten depart from the baseline more aggressively than
            round 1 did. Wordmark stays unified throughout (no Vero /
            ax split). Each uses gold <span className="font-mono">#D4B85C</span>{" "}
            from the baseline. Every option has a paired light and dark
            version so you can see how the design holds up on a white
            page AND on a dark background.
          </p>
        </div>

        {/* Baseline reference */}
        <section className="mb-12 bg-white rounded-2xl border-2 border-amber-300 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-amber-700">
                Baseline · for reference
              </p>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                v1 refined · gold #D4B85C
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
              {/* On dark, the baseline navy wordmark disappears, this
                  is the problem the new round is solving. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/lockup-v1-refined-a.svg"
                alt="Baseline on dark (illegible, that's the point)"
                style={{ height: 50 }}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 italic mt-3">
            On dark, the baseline navy wordmark disappears. That&apos;s
            the gap each option below is designed to fill.
          </p>
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
                {/* Light version, on white */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 flex items-center justify-center min-h-[100px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={o.light}
                    alt={`${o.name} on light`}
                    style={{ height: 50 }}
                  />
                </div>
                {/* Dark version, on dark navy */}
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

              {/* Small-scale preview row, favicon-sized tiles to
                  test legibility. */}
              <div className="flex items-center gap-3 mb-4 text-xs text-slate-500">
                <span>At favicon scale:</span>
                <div className="bg-white border border-slate-200 rounded p-2 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.light} alt={`${o.name} logo, light variant`} style={{ height: 24 }} />
                </div>
                <div
                  className="rounded p-2 flex items-center justify-center"
                  style={{ background: "#0F0E2E" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.dark} alt={`${o.name} logo, dark variant on indigo`} style={{ height: 24 }} />
                </div>
                <div className="bg-black rounded p-2 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.dark} alt={`${o.name} logo, dark variant on black`} style={{ height: 24 }} />
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
            Pick the option you like best (or say &quot;Option 02 but
            try ___&quot;). Once you decide, I&apos;ll:
          </p>
          <ol className="list-decimal list-inside text-sm text-slate-700 mt-3 space-y-1">
            <li>
              Wire the lockup into the marketing site header + footer
            </li>
            <li>
              Generate the favicon set (16/32/180/512) from the mark
              alone
            </li>
            <li>
              Build the OG image for social shares
            </li>
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
