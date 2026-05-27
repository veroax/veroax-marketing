// Stripe billing readiness diagnostic. Answers two questions:
//
//   1. Are we wired to TEST mode or LIVE mode right now?
//   2. Does every required env var point at something that
//      actually exists in the connected Stripe project?
//
// For each configured price ID we call stripe.prices.retrieve(),
// which fails clearly when the ID is a typo or belongs to a
// different Stripe project. That gives the founder a single
// place to confirm "yes, my test-mode prices are wired and
// checkout will work" before sending a paid signup link to a
// real customer.

import Stripe from "stripe";
import Link from "next/link";

// Admin gate is enforced by the parent app/admin/layout.tsx, which
// redirects non-admins to /dashboard before this page renders. No
// per-page auth check needed.

export const metadata = {
  title: "Billing readiness, Admin",
};

type PriceCheck = {
  envName: string;
  label: string;
  value: string | null;
  ok: boolean;
  detail: string;
  amount: string | null;
  interval: string | null;
};

const REQUIRED_PRICE_ENVS: Array<{ envName: string; label: string }> = [
  { envName: "STRIPE_PRICE_SOLO_MONTHLY", label: "Solo / monthly" },
  { envName: "STRIPE_PRICE_SOLO_ANNUAL", label: "Solo / annual" },
  { envName: "STRIPE_PRICE_PRO_MONTHLY", label: "Pro / monthly" },
  { envName: "STRIPE_PRICE_PRO_ANNUAL", label: "Pro / annual" },
  {
    envName: "STRIPE_PRICE_BROKERAGE_MONTHLY",
    label: "Brokerage / monthly",
  },
  { envName: "STRIPE_PRICE_BROKERAGE_ANNUAL", label: "Brokerage / annual" },
  { envName: "STRIPE_PRICE_ONEOFF_REPORT", label: "Pay-as-you-go report" },
];

function fmtAmount(cents: number | null, currency: string): string {
  if (cents === null) return ",";
  const dollars = cents / 100;
  return `${dollars.toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  })}`;
}

async function checkPrice(
  stripe: Stripe,
  envName: string,
  label: string,
): Promise<PriceCheck> {
  const value = process.env[envName] ?? null;
  if (!value) {
    return {
      envName,
      label,
      value: null,
      ok: false,
      detail: "Env var not set on this deployment.",
      amount: null,
      interval: null,
    };
  }
  if (!value.startsWith("price_")) {
    return {
      envName,
      label,
      value,
      ok: false,
      detail: 'Value does not look like a Stripe price ID (should start with "price_").',
      amount: null,
      interval: null,
    };
  }
  try {
    const price = await stripe.prices.retrieve(value);
    if (!price.active) {
      return {
        envName,
        label,
        value,
        ok: false,
        detail: "Price exists but is archived/inactive in Stripe.",
        amount: fmtAmount(price.unit_amount ?? null, price.currency),
        interval: price.recurring?.interval ?? null,
      };
    }
    return {
      envName,
      label,
      value,
      ok: true,
      detail: "Found and active in Stripe.",
      amount: fmtAmount(price.unit_amount ?? null, price.currency),
      interval: price.recurring?.interval ?? "one-time",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      envName,
      label,
      value,
      ok: false,
      detail: `Stripe rejected this ID: ${message}`,
      amount: null,
      interval: null,
    };
  }
}

export default async function BillingReadinessPage() {
  const stripeSecret = process.env.STRIPE_SECRET_KEY ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  const stripeMode = stripeSecret.startsWith("sk_test_")
    ? ("test" as const)
    : stripeSecret.startsWith("sk_live_")
      ? ("live" as const)
      : ("unset_or_invalid" as const);
  const publishableMode = publishable.startsWith("pk_test_")
    ? "test"
    : publishable.startsWith("pk_live_")
      ? "live"
      : publishable
        ? "unknown"
        : "unset";
  const keysMatch = stripeMode === publishableMode;

  let priceChecks: PriceCheck[] = [];
  let stripeReachable = false;
  let stripeError: string | null = null;
  if (stripeSecret) {
    try {
      const stripe = new Stripe(stripeSecret);
      // Quick reachability check.
      await stripe.balance.retrieve();
      stripeReachable = true;
      priceChecks = await Promise.all(
        REQUIRED_PRICE_ENVS.map((p) =>
          checkPrice(stripe, p.envName, p.label),
        ),
      );
    } catch (err) {
      stripeError = err instanceof Error ? err.message : String(err);
    }
  }

  const allPricesOk = priceChecks.length > 0 && priceChecks.every((p) => p.ok);
  const overallReady =
    Boolean(stripeSecret) &&
    Boolean(webhookSecret) &&
    Boolean(publishable) &&
    keysMatch &&
    stripeReachable &&
    allPricesOk;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Billing readiness
        </h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Confirms that checkout will actually work before you share a paid
          signup link with a real customer. Calls Stripe live to verify
          each configured price ID resolves to a real, active price.
        </p>
      </div>

      <ReadinessHeader
        overallReady={overallReady}
        stripeMode={stripeMode}
        publishableMode={publishableMode}
        keysMatch={keysMatch}
      />

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          Core environment variables
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EnvCheck
            label="STRIPE_SECRET_KEY"
            set={Boolean(stripeSecret)}
            extra={
              stripeMode === "test"
                ? "test mode"
                : stripeMode === "live"
                  ? "LIVE mode"
                  : "unset"
            }
            tone={stripeMode === "live" ? "amber" : stripeMode === "test" ? "green" : "red"}
          />
          <EnvCheck
            label="NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
            set={Boolean(publishable)}
            extra={publishableMode}
            tone={
              publishableMode === "test"
                ? "green"
                : publishableMode === "live"
                  ? "amber"
                  : "red"
            }
          />
          <EnvCheck
            label="STRIPE_WEBHOOK_SECRET"
            set={Boolean(webhookSecret)}
            extra={webhookSecret ? "set" : "unset"}
            tone={webhookSecret ? "green" : "red"}
          />
          <EnvCheck
            label="Stripe reachability"
            set={stripeReachable}
            extra={
              stripeReachable
                ? "balance.retrieve OK"
                : stripeError ?? "no Stripe key"
            }
            tone={stripeReachable ? "green" : "red"}
          />
        </div>
        {!keysMatch && stripeMode !== "unset_or_invalid" ? (
          <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2 mt-4">
            Secret key is{" "}
            <span className="font-mono">{stripeMode}</span> but publishable
            key is <span className="font-mono">{publishableMode}</span>. They
            must match. Update one of them on Vercel and redeploy.
          </p>
        ) : null}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          Price IDs ({stripeMode === "test" ? "test mode" : stripeMode === "live" ? "LIVE mode" : "unconfigured"})
        </h2>
        {!stripeReachable ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Cannot verify price IDs until Stripe is reachable. Fix the
            STRIPE_SECRET_KEY first.
          </p>
        ) : priceChecks.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No checks ran.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Plan</th>
                  <th className="text-left font-semibold px-3 py-2">Env var</th>
                  <th className="text-left font-semibold px-3 py-2">Price</th>
                  <th className="text-left font-semibold px-3 py-2">Interval</th>
                  <th className="text-left font-semibold px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {priceChecks.map((p) => (
                  <tr key={p.envName}>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {p.label}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono text-slate-500">
                      {p.envName}
                    </td>
                    <td className="px-3 py-2 text-slate-900 font-mono">
                      {p.amount ?? ","}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {p.interval ?? ","}
                    </td>
                    <td className="px-3 py-2">
                      <PriceStatusPill ok={p.ok} detail={p.detail} value={p.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-2">
          Test-mode setup walkthrough
        </h2>
        <p className="text-xs text-slate-500 mb-4 max-w-3xl">
          One-time setup. After this is green, run a $0.50 test charge end
          to end to confirm webhooks flow.
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-700 space-y-2 leading-relaxed">
          <li>
            In Stripe, toggle to{" "}
            <span className="font-semibold">Test mode</span> using the
            switch in the top-right.
          </li>
          <li>
            Create one product per plan (Solo, Pro, Brokerage, Pay-as-you-go).
            Each gets a monthly price; subscription plans also get an annual
            price (one-off does not). Match the dollar amounts in{" "}
            <span className="font-mono">lib/billing/plans.ts</span> so the
            profitability math stays accurate.
          </li>
          <li>
            Copy each <span className="font-mono">price_xxx</span> ID from
            Stripe and set the matching env var on Vercel:
            <ul className="list-disc list-inside ml-5 mt-1 text-xs font-mono text-slate-600">
              <li>STRIPE_PRICE_SOLO_MONTHLY</li>
              <li>STRIPE_PRICE_SOLO_ANNUAL</li>
              <li>STRIPE_PRICE_PRO_MONTHLY</li>
              <li>STRIPE_PRICE_PRO_ANNUAL</li>
              <li>STRIPE_PRICE_BROKERAGE_MONTHLY</li>
              <li>STRIPE_PRICE_BROKERAGE_ANNUAL</li>
              <li>STRIPE_PRICE_ONEOFF_REPORT</li>
            </ul>
          </li>
          <li>
            Copy the test-mode secret key (<span className="font-mono">sk_test_...</span>)
            and publishable key (<span className="font-mono">pk_test_...</span>) into
            <span className="font-mono"> STRIPE_SECRET_KEY</span> and{" "}
            <span className="font-mono">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</span>.
          </li>
          <li>
            In Stripe → Developers → Webhooks → Add endpoint, point at{" "}
            <span className="font-mono">{`{your-domain}`}/api/webhook</span>{" "}
            and subscribe to <span className="font-mono">checkout.session.completed</span>,{" "}
            <span className="font-mono">customer.subscription.*</span>, and{" "}
            <span className="font-mono">invoice.paid</span>. Copy the signing
            secret into <span className="font-mono">STRIPE_WEBHOOK_SECRET</span>.
          </li>
          <li>
            Redeploy Vercel so the new env vars are loaded. Refresh this
            page. The whole section above should turn green.
          </li>
          <li>
            Run a test charge: open{" "}
            <Link href="/#pricing" className="text-indigo-700 underline underline-offset-2">
              the pricing page
            </Link>
            , pick Solo monthly, use Stripe&apos;s test card{" "}
            <span className="font-mono">4242 4242 4242 4242</span> with any
            future expiration and any CVC. Confirm the checkout completes
            and your profile picks up the subscription on{" "}
            <Link href="/dashboard/billing" className="text-indigo-700 underline underline-offset-2">
              /dashboard/billing
            </Link>
            .
          </li>
          <li>
            When you are ready for real payments, repeat the same steps in
            Stripe&apos;s LIVE mode and update the env vars on Vercel.
          </li>
        </ol>
      </section>

      <p className="text-xs text-slate-500 italic">
        Need the secret reference for the webhook signature? See{" "}
        <Link
          href="/admin/docs/billing-setup"
          className="text-indigo-700 underline underline-offset-2"
        >
          /admin/docs/billing-setup
        </Link>
        .
      </p>
    </div>
  );
}

function ReadinessHeader({
  overallReady,
  stripeMode,
  publishableMode,
  keysMatch,
}: {
  overallReady: boolean;
  stripeMode: "test" | "live" | "unset_or_invalid";
  publishableMode: string;
  keysMatch: boolean;
}) {
  let bannerClass = "bg-slate-100 border-slate-300 text-slate-900";
  let label = "Not ready";
  let detail = "Configure the values below to enable Stripe checkout.";
  if (overallReady && stripeMode === "test") {
    bannerClass = "bg-emerald-50 border-emerald-300 text-emerald-900";
    label = "Ready, TEST mode";
    detail = "Checkout will create test-mode payments only. Use test cards (4242 4242 4242 4242).";
  } else if (overallReady && stripeMode === "live") {
    bannerClass = "bg-amber-50 border-amber-300 text-amber-900";
    label = "LIVE mode is active";
    detail = "Real money will move on every checkout. Confirm this is intentional.";
  } else if (stripeMode === "unset_or_invalid") {
    bannerClass = "bg-red-50 border-red-300 text-red-900";
    label = "STRIPE_SECRET_KEY missing";
    detail = "Set STRIPE_SECRET_KEY on Vercel before anything else works.";
  } else if (!keysMatch) {
    bannerClass = "bg-red-50 border-red-300 text-red-900";
    label = "Key mismatch";
    detail = `Secret key (${stripeMode}) does not match publishable key (${publishableMode}). Checkout will fail.`;
  }

  return (
    <div className={`rounded-2xl border-2 px-5 py-4 ${bannerClass}`}>
      <p className="text-[11px] font-bold uppercase tracking-widest mb-1">
        Status
      </p>
      <p className="text-xl font-bold">{label}</p>
      <p className="text-sm mt-1">{detail}</p>
    </div>
  );
}

function EnvCheck({
  label,
  set,
  extra,
  tone,
}: {
  label: string;
  set: boolean;
  extra: string;
  tone: "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-300 bg-emerald-50"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50"
        : "border-red-300 bg-red-50";
  const dotColor =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className={`rounded-xl border ${toneClass} px-3 py-2.5`}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor}`}
          aria-hidden="true"
        />
        <p className="text-xs font-mono font-semibold text-slate-900 truncate">
          {label}
        </p>
      </div>
      <p className="text-[11px] text-slate-700 mt-1">
        {set ? "set" : "unset"}
        {extra ? ` · ${extra}` : ""}
      </p>
    </div>
  );
}

function PriceStatusPill({
  ok,
  detail,
  value,
}: {
  ok: boolean;
  detail: string;
  value: string | null;
}) {
  if (ok) {
    return (
      <span
        className="inline-block text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded"
        title={value ?? ""}
      >
        OK
      </span>
    );
  }
  return (
    <div>
      <span
        className="inline-block text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded"
        title={value ?? ""}
      >
        FAIL
      </span>
      <p className="text-[11px] text-red-700 mt-1 max-w-xs leading-tight">
        {detail}
      </p>
    </div>
  );
}
