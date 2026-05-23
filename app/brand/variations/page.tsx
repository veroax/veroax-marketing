import Link from "next/link";

// Side-by-side comparison page for the lockup variations. Each card
// shows the SVG rendered at two sizes (large for evaluation, small
// for "how does this look at favicon scale") plus a name + design
// notes. Public page — no auth — so you can share the URL.

export const metadata = {
  title: "Brand lockup variations — Veroax",
  robots: { index: false, follow: false },
};

type Variation = {
  id: string;
  name: string;
  file: string;
  notes: string;
  height: number;
  width: number;
};

const VARIATIONS: Variation[] = [
  {
    id: "01",
    name: "Baseline",
    file: "/brand/lockup-01-baseline.svg",
    notes:
      "The current lockup. Navy rounded square, gold V/check, navy wordmark. Reads as professional and trustworthy.",
    height: 60,
    width: 296,
  },
  {
    id: "02",
    name: "Two-tone wordmark",
    file: "/brand/lockup-02-two-tone.svg",
    notes:
      "Same mark. Wordmark splits 'Vero' (navy) and 'ax' (gold) so the wordmark color-echoes the mark. Stronger continuity.",
    height: 60,
    width: 296,
  },
  {
    id: "03",
    name: "Reverse fill",
    file: "/brand/lockup-03-reverse.svg",
    notes:
      "Gold square with navy V. Warmer, more premium feel. The gold becomes the focal point. Works well against a white background.",
    height: 60,
    width: 296,
  },
  {
    id: "04",
    name: "Circle mark",
    file: "/brand/lockup-04-circle.svg",
    notes:
      "Softer container shape. Friendlier and more approachable than the rounded square. Common in consumer-facing SaaS.",
    height: 60,
    width: 296,
  },
  {
    id: "05",
    name: "Outlined mark",
    file: "/brand/lockup-05-outline.svg",
    notes:
      "Open container with the V inside. Lighter, more refined, more editorial. Less visual weight. The wordmark becomes the focal point.",
    height: 60,
    width: 296,
  },
  {
    id: "06",
    name: "Shield",
    file: "/brand/lockup-06-shield.svg",
    notes:
      "Heraldic shape suggesting trust, protection, verification. Leans traditional / institutional. Real-estate and compliance friendly.",
    height: 60,
    width: 296,
  },
  {
    id: "07",
    name: "Monochrome navy",
    file: "/brand/lockup-07-mono-navy.svg",
    notes:
      "No gold anywhere. White V on navy mark, navy wordmark. Most conservative and professional. Reads like a law firm or institutional services company.",
    height: 60,
    width: 296,
  },
  {
    id: "08",
    name: "Stacked",
    file: "/brand/lockup-08-stacked.svg",
    notes:
      "Mark centered on top, wordmark below. Better for square or near-square contexts: business cards, social posts, PDF cover header.",
    height: 140,
    width: 200,
  },
  {
    id: "09",
    name: "Mark dominant",
    file: "/brand/lockup-09-mark-dominant.svg",
    notes:
      "Larger mark, smaller wordmark. The mark becomes the brand's primary visual asset. Better when the brand is built around icon recognition (Apple, Slack, Twitter early-era).",
    height: 80,
    width: 320,
  },
];

export default function BrandVariationsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-slate-900">
            Veroax
          </Link>
          <p className="text-xs text-slate-500">
            Brand lockup variations
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Lockup variations
          </h1>
          <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
            Nine takes on the wordmark + check-V lockup. Each card shows
            the lockup at full size and at favicon scale so you can
            judge it both ways. Click a variation if you want to view
            the raw SVG.
          </p>
        </div>

        <div className="space-y-5">
          {VARIATIONS.map((v) => (
            <article
              key={v.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
                    Variation {v.id}
                  </p>
                  <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                    {v.name}
                  </h2>
                </div>
                <a
                  href={v.file}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-700 underline underline-offset-2"
                >
                  View raw SVG
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Large preview */}
                <div className="md:col-span-2 bg-white border border-slate-200 rounded-lg p-6 flex items-center justify-center min-h-[140px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.file}
                    alt={`Veroax lockup variation ${v.id}: ${v.name}`}
                    style={{ maxHeight: 80, width: "auto" }}
                  />
                </div>

                {/* Two background tests */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.file}
                      alt=""
                      style={{ maxHeight: 32, width: "auto" }}
                    />
                  </div>
                  <div
                    className="border border-slate-200 rounded-lg p-3 flex items-center justify-center"
                    style={{
                      background:
                        "linear-gradient(135deg,#1e1b4b 0%,#0f0e2e 100%)",
                    }}
                  >
                    {/* On dark background — this only really works
                        for some variations; the others will read
                        poorly here and that's a useful signal. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.file}
                      alt=""
                      style={{ maxHeight: 32, width: "auto" }}
                    />
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">
                {v.notes}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-12 bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            How to read this comparison
          </h2>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>
              <strong>Large preview</strong> on the left shows the
              lockup at the size it would appear in your marketing
              header.
            </li>
            <li>
              <strong>Small light tile</strong> tests how the lockup
              holds up at favicon / app-icon scale on a light
              background.
            </li>
            <li>
              <strong>Small navy tile</strong> tests how it reads on a
              dark background (your dashboard sidebar). Watch which
              variations stay legible.
            </li>
          </ul>
          <p className="text-sm text-slate-600 mt-4">
            When you pick one, tell me which by name or variation
            number and I&apos;ll wire it into the marketing site,
            generate the favicon set, and produce the OG image.
          </p>
        </div>
      </main>
    </div>
  );
}
