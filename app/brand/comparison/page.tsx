import Link from "next/link";

// Side-by-side comparison: redesigned baseline (with proper primary +
// reversed-out variants) against Option 1 from round 3 (lowercase
// coral wordmark + teal dot). Also includes a trademark + permanence
// analysis section so the founder can decide on strategy, not just
// aesthetics.

export const metadata = {
  title: "Baseline vs Option 1, Veroax",
  robots: { index: false, follow: false },
};

export default function ComparisonPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-slate-900">
            Veroax
          </Link>
          <div className="flex gap-4 text-xs text-slate-500">
            <Link href="/brand/round-3" className="hover:text-slate-900">
              Round 3
            </Link>
            <Link href="/brand/round-2" className="hover:text-slate-900">
              Round 2
            </Link>
            <Link href="/brand/variations" className="hover:text-slate-900">
              Round 1
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Baseline vs Option 1
          </h1>
          <p className="text-sm text-slate-600 mt-3 max-w-3xl leading-relaxed">
            Two finalists with proper primary and reversed-out variants
            side by side. The baseline is the gold + navy V you liked
            originally, now with a clean dark treatment. Option 1 is the
            lowercase coral wordmark with the teal dot from round 3. My
            opinion and a trademark analysis sit below the visuals.
          </p>
        </div>

        {/* Baseline: primary + reversed */}
        <section className="mb-10 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-amber-700">
                Finalist A
              </p>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Baseline, gold + navy V
              </h2>
            </div>
            <div className="flex gap-3 text-xs">
              <a
                href="/brand/v4-baseline-primary-light.svg"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-700 underline underline-offset-2"
              >
                Primary SVG
              </a>
              <a
                href="/brand/v4-baseline-reversed-dark.svg"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-700 underline underline-offset-2"
              >
                Reversed SVG
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-2">
                Primary, on white
              </p>
              <div className="bg-white border border-slate-200 rounded-lg p-6 flex items-center justify-center min-h-[120px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/v4-baseline-primary-light.svg"
                  alt="Baseline primary"
                  style={{ height: 56 }}
                />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-2">
                Reversed, on dark navy
              </p>
              <div
                className="rounded-lg p-6 flex items-center justify-center min-h-[120px]"
                style={{ background: "#0F0E2E" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/v4-baseline-reversed-dark.svg"
                  alt="Baseline reversed"
                  style={{ height: 56 }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span>At favicon scale:</span>
            <div className="bg-white border border-slate-200 rounded p-2 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/v4-baseline-primary-light.svg" alt="" style={{ height: 24 }} />
            </div>
            <div
              className="rounded p-2 flex items-center justify-center"
              style={{ background: "#0F0E2E" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/v4-baseline-reversed-dark.svg" alt="" style={{ height: 24 }} />
            </div>
          </div>
        </section>

        {/* Option 1: primary + reversed */}
        <section className="mb-10 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-rose-700">
                Finalist B
              </p>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Option 1, coral wordmark + teal dot
              </h2>
            </div>
            <div className="flex gap-3 text-xs">
              <a
                href="/brand/v3-01-coral-lowercase-light.svg"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-700 underline underline-offset-2"
              >
                Primary SVG
              </a>
              <a
                href="/brand/v3-01-coral-lowercase-dark.svg"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-700 underline underline-offset-2"
              >
                Reversed SVG
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-2">
                Primary, on white
              </p>
              <div className="bg-white border border-slate-200 rounded-lg p-6 flex items-center justify-center min-h-[120px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/v3-01-coral-lowercase-light.svg"
                  alt="Option 1 primary"
                  style={{ height: 56 }}
                />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-2">
                Reversed, on dark navy
              </p>
              <div
                className="rounded-lg p-6 flex items-center justify-center min-h-[120px]"
                style={{ background: "#0F0E2E" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/v3-01-coral-lowercase-dark.svg"
                  alt="Option 1 reversed"
                  style={{ height: 56 }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span>At favicon scale:</span>
            <div className="bg-white border border-slate-200 rounded p-2 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/v3-01-coral-lowercase-light.svg" alt="" style={{ height: 24 }} />
            </div>
            <div
              className="rounded p-2 flex items-center justify-center"
              style={{ background: "#0F0E2E" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/v3-01-coral-lowercase-dark.svg" alt="" style={{ height: 24 }} />
            </div>
          </div>
        </section>

        {/* My opinion */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 mb-10">
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            My honest opinion
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed mb-3">
            Your instinct that &quot;neither can be permanent or
            trademarked&quot; is half right, in a way that actually
            matters. Here is the real picture:
          </p>

          <h3 className="text-sm font-bold text-slate-900 mt-5 mb-2">
            Baseline (V in a gold rounded square)
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Genuinely weak as a trademark. A bold V inside a rounded
            square is one of the single most common logo patterns in
            proptech and SaaS. Vrbo, Vox, Vesta Property Services, Verbit,
            and dozens of others sit in the same visual territory. USPTO
            would probably register your composition in your specific
            class (AI software for real-estate disclosure analysis), but
            the protection would be narrow. Anyone with a similar V mark
            in an adjacent real-estate class could coexist with you. On
            this one your instinct is correct: I would not bet on it
            being your forever mark.
          </p>

          <h3 className="text-sm font-bold text-slate-900 mt-5 mb-2">
            Option 1 (lowercase coral wordmark + teal dot)
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Actually the opposite story. The reason is that{" "}
            <span className="font-semibold">Veroax</span> is a coined
            word. Coined or fanciful words (Kodak, Xerox, Spotify, and
            yes, Veroax) are the strongest possible category of
            trademarks because they have no prior meaning to anyone. A
            USPTO &quot;standard character mark&quot; registration on the
            word VEROAX protects you regardless of font, color,
            capitalization, or visual treatment. That is a permanent,
            defensible asset. The lowercase + coral + teal-dot styling
            on top is decorative and refreshable, but the word
            underneath is one of the most defensible trademarks a
            company can have.
          </p>

          <h3 className="text-sm font-bold text-slate-900 mt-5 mb-2">
            The strategic move
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            The question is not really &quot;which design is permanent.&quot;
            It is &quot;which strategy is permanent.&quot; Modern brands
            separate the two. The word is the permanent trademark
            (Stripe, Notion, Linear, Vercel all rely on this). The
            visual treatment evolves freely over time without losing
            protection. Stripe has redesigned 4 times. Notion has
            tweaked its mark. Linear changed colors twice. The constant
            is the wordmark.
          </p>

          <h3 className="text-sm font-bold text-slate-900 mt-5 mb-2">
            What I would do
          </h3>
          <ol className="list-decimal list-inside text-sm text-slate-700 mt-2 space-y-2 leading-relaxed">
            <li>
              <span className="font-semibold">File a standard-character mark on VEROAX with USPTO</span>{" "}
              in classes 9 (software) and 42 (SaaS services). This is
              the durable asset. Filing fee is about $350 per class and
              it does not depend on which lockup you pick. This is the
              single most valuable thing you can do for brand permanence.
            </li>
            <li>
              <span className="font-semibold">Pick a visual treatment that feels right now.</span>{" "}
              Do not try to pick &quot;forever.&quot; Option 1 is closer
              to the strategic direction modern SaaS brands take because
              it foregrounds the word, which is the part that is
              actually defensible. The baseline is fine too, but the
              V-in-square pulls visual weight away from the part of your
              brand that has real protection.
            </li>
            <li>
              <span className="font-semibold">Plan for one refresh in 3 to 5 years.</span>{" "}
              Every serious brand redesigns at that cadence. Do not
              agonize about permanence today.
            </li>
          </ol>

          <h3 className="text-sm font-bold text-slate-900 mt-5 mb-2">
            Between just these two
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            I would go with <span className="font-semibold">Option 1</span>.
            It puts your most defensible asset (the word) front and
            center, it works identically on light and dark backgrounds
            (the baseline always needed a special treatment for dark),
            it has no trademark conflict zone, and it scales down to
            favicon cleanly because the teal dot becomes the icon. The
            baseline is the safer-feeling choice and there is nothing
            wrong with it. But strategically, Option 1 is closer to how
            permanent brands actually get built.
          </p>
          <p className="text-sm text-slate-700 leading-relaxed mt-3">
            One small refinement I would offer on Option 1: try the dot
            in the SAME coral as the wordmark instead of teal. Two
            colors compete a little. One color reads cleaner at small
            sizes and ages better. I can mock that up in a minute if you
            want to see it.
          </p>
        </section>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3">
            Decision time
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            Tell me which way to go and I will wire it everywhere (header,
            footer, favicon set, OG image, PDF cover, email templates).
            Reply with one of:
          </p>
          <ul className="list-disc list-inside text-sm text-slate-700 mt-3 space-y-1">
            <li>&quot;Go with the baseline&quot;</li>
            <li>&quot;Go with Option 1 (teal dot)&quot;</li>
            <li>&quot;Go with Option 1 but use coral for the dot&quot;</li>
            <li>&quot;Show me Option 1 with the coral dot first&quot;</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
