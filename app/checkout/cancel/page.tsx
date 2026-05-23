import Link from "next/link";

export const metadata = {
  title: "Checkout canceled, Veroax",
  robots: { index: false, follow: false },
};

export default function CheckoutCancel() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white px-6 py-24">
      <div className="max-w-lg w-full text-center space-y-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          No worries — nothing was charged.
        </h1>
        <p className="text-indigo-200 leading-relaxed">
          You canceled out of checkout before completing your subscription.
          You can pick up where you left off any time, or start with a free
          DRE-verified report first if you&apos;d rather see the output before
          paying.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            href="/#pricing"
            className="inline-block bg-amber-400 text-indigo-950 font-semibold px-6 py-3 rounded-lg hover:bg-amber-300 transition-colors shadow-lg shadow-amber-400/20"
          >
            Back to pricing
          </Link>
          <Link
            href="/#contact"
            className="inline-block border border-indigo-400/40 text-white px-6 py-3 rounded-lg hover:bg-white/10 transition-colors"
          >
            Claim a free report instead
          </Link>
        </div>
        <p className="text-xs text-indigo-300 pt-2">
          Questions?{" "}
          <a
            href="mailto:support@veroax.com"
            className="underline underline-offset-2 hover:text-white"
          >
            support@veroax.com
          </a>
        </p>
      </div>
    </main>
  );
}
