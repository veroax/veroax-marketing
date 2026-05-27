import Link from "next/link";

// Admin-only styled rendering of docs/BILLING_SETUP.md so the founder
// can read the setup steps from any device without opening the repo.
// The admin layout (app/admin/layout.tsx) already redirects non-
// admins to /dashboard, so this page inherits that gate without any
// per-page auth check.
//
// Content is hand-rendered as JSX (rather than a runtime markdown
// parser) so we can apply our Tailwind type-scale cleanly and link
// to the live URLs (/pricing, /api/webhook, etc.) directly.

export const metadata = {
  title: "Billing setup, Veroax Admin",
};

export default function BillingSetupDoc() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
            Admin · Docs
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Billing setup
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            One-time setup the founder runs in Stripe + Supabase + Vercel
            to flip billing live. Code is already shipped; this page is
            just the dashboard work.
          </p>
        </div>
        <a
          href="https://github.com/veroax/veroax-marketing/blob/main/docs/BILLING_SETUP.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
        >
          View on GitHub →
        </a>
      </div>

      <Section number={1} title="Run the migration in Supabase">
        <P>
          Open the Supabase SQL editor and run the contents of{" "}
          <Code>supabase/migrations/0011_billing.sql</Code>. Idempotent ,
          safe to re-run.
        </P>
        <P>The migration adds:</P>
        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1 ml-2">
          <li>
            <Code>profiles.trial_credits_remaining</Code> (default 1)
          </li>
          <li>
            <Code>profiles.report_credits_balance</Code>
          </li>
          <li>
            <Code>profiles.stripe_customer_id</Code> (unique)
          </li>
          <li>
            <Code>reports.billable</Code> (default false)
          </li>
          <li>
            <Code>reports.watermarked</Code> (default false)
          </li>
          <li>
            <Code>subscriptions.stripe_price_id</Code>
          </li>
          <li>
            New table <Code>report_credit_ledger</Code>
          </li>
        </ul>
        <P>After running, verify with:</P>
        <Pre>{`select count(*) from report_credit_ledger; -- should return 0
select column_name from information_schema.columns
  where table_name = 'reports'
    and column_name in ('billable', 'watermarked');
-- should return 2 rows`}</Pre>
      </Section>

      <Section number={2} title="Create products + prices in Stripe">
        <P>
          In your Stripe dashboard (Test mode while you&apos;re testing,
          Production when you go live):
        </P>
        <P>
          For each of <strong>Solo / Pro / Brokerage</strong>, create
          one Product and TWO recurring Prices on it (monthly + annual).
          The default labels and amounts match what{" "}
          <Code>lib/billing/plans.ts</Code> advertises on the pricing page.
        </P>

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg my-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Plan</th>
                <th className="text-right font-semibold px-4 py-2">Monthly</th>
                <th className="text-right font-semibold px-4 py-2">Annual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-2">Solo Agent</td>
                <td className="px-4 py-2 text-right font-mono">$49</td>
                <td className="px-4 py-2 text-right font-mono">$490</td>
              </tr>
              <tr>
                <td className="px-4 py-2">Pro</td>
                <td className="px-4 py-2 text-right font-mono">$149</td>
                <td className="px-4 py-2 text-right font-mono">$1,490</td>
              </tr>
              <tr>
                <td className="px-4 py-2">Brokerage</td>
                <td className="px-4 py-2 text-right font-mono">$449</td>
                <td className="px-4 py-2 text-right font-mono">$4,490</td>
              </tr>
            </tbody>
          </table>
        </div>

        <P>
          Plus a one-time price for <strong>Pay-as-you-go</strong>:
        </P>
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg my-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Plan</th>
                <th className="text-right font-semibold px-4 py-2">
                  One-time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-2">Single report</td>
                <td className="px-4 py-2 text-right font-mono">$25</td>
              </tr>
            </tbody>
          </table>
        </div>

        <P>
          After creating each price, copy its <Code>price_xxx</Code> ID
          into Vercel&apos;s environment variables (Project → Settings →
          Environment Variables), all marked <strong>Sensitive</strong>:
        </P>
        <Pre>{`STRIPE_PRICE_SOLO_MONTHLY=price_xxx
STRIPE_PRICE_SOLO_ANNUAL=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_ANNUAL=price_xxx
STRIPE_PRICE_BROKERAGE_MONTHLY=price_xxx
STRIPE_PRICE_BROKERAGE_ANNUAL=price_xxx
STRIPE_PRICE_ONEOFF_REPORT=price_xxx`}</Pre>
        <P>
          <Code>STRIPE_SECRET_KEY</Code> and{" "}
          <Code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</Code> are already set
          from earlier work, leave them.
        </P>
      </Section>

      <Section number={3} title="Configure the Stripe webhook">
        <P>
          In Stripe → Developers → Webhooks, add an endpoint at:
        </P>
        <Pre>https://www.veroax.com/api/webhook</Pre>
        <P>Subscribe to these events only:</P>
        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1 ml-2 font-mono">
          <li>checkout.session.completed</li>
          <li>customer.subscription.created</li>
          <li>customer.subscription.updated</li>
          <li>customer.subscription.deleted</li>
          <li>invoice.paid</li>
          <li>invoice.payment_failed</li>
        </ul>
        <P>
          After creating the endpoint, copy the signing secret
          (starts with <Code>whsec_…</Code>) into Vercel as{" "}
          <Code>STRIPE_WEBHOOK_SECRET</Code>, marked Sensitive.
        </P>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900 my-3">
          <strong>Paste-safety:</strong> Don&apos;t paste the{" "}
          <Code>whsec_…</Code> value into chat, same rule as the Stripe
          secret key.
        </div>
      </Section>

      <Section number={4} title="Configure the Stripe Customer Portal">
        <P>In Stripe → Settings → Billing → Customer Portal:</P>
        <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1.5 ml-2">
          <li>Activate the portal.</li>
          <li>
            Allow customers to: update payment method, view invoice
            history, cancel subscriptions, upgrade / downgrade between
            Solo / Pro / Brokerage.
          </li>
          <li>
            Set the support email to{" "}
            <Code>support@veroax.com</Code>.
          </li>
          <li>
            Branding: upload the Veroax logo and set the brand color to{" "}
            <Code>#1e1b4b</Code>.
          </li>
        </ol>
        <P>
          Without this step, the &quot;Manage subscription&quot; button on{" "}
          <Link href="/dashboard/billing" className="text-indigo-700 underline">
            /dashboard/billing
          </Link>{" "}
          surfaces a Stripe error.
        </P>
      </Section>

      <Section number={5} title="Redeploy Vercel after env var changes">
        <P>
          Vercel doesn&apos;t auto-pick up env var changes on existing
          deployments. Trigger a new deploy from the Vercel dashboard or
          push any commit after adding the Stripe price IDs + webhook
          secret.
        </P>
      </Section>

      <Section number={6} title="Smoke test">
        <P>In Stripe test mode:</P>
        <ol className="list-decimal list-inside text-sm text-slate-700 space-y-2 ml-2">
          <li>
            Open{" "}
            <Link href="/pricing" className="text-indigo-700 underline">
              /pricing
            </Link>{" "}
            while signed in to a Veroax test account.
          </li>
          <li>
            Click &quot;Start Solo, $49/mo&quot;. You should land on
            Stripe Checkout with your account email pre-filled.
          </li>
          <li>
            Use Stripe&apos;s test card{" "}
            <Code>4242 4242 4242 4242</Code> with any future expiry and any
            CVC.
          </li>
          <li>
            After successful checkout you land on{" "}
            <Code>/checkout/success</Code>.
          </li>
          <li>
            Refresh{" "}
            <Link
              href="/dashboard/billing"
              className="text-indigo-700 underline"
            >
              /dashboard/billing
            </Link>
            . You should see:
            <ul className="list-disc list-inside ml-6 mt-1 space-y-0.5">
              <li>Current plan: Solo</li>
              <li>Subscription credits: 3 of 3/mo</li>
              <li>Credit activity: one &quot;Renewal +3&quot; entry</li>
              <li>Invoice history: one &quot;paid&quot; invoice for $49</li>
            </ul>
          </li>
          <li>
            Verify in Supabase:
            <Pre className="mt-1">{`select * from subscriptions
  where user_id = '<your test account>';
-- one row, status='active', plan='solo', reports_included=3`}</Pre>
          </li>
        </ol>
        <P>
          If step 5 doesn&apos;t show the subscription, check Stripe
          Dashboard → Developers → Webhook attempts. Failed attempts
          usually mean <Code>STRIPE_WEBHOOK_SECRET</Code> is wrong in
          Vercel.
        </P>
      </Section>

      <Section number={7} title="Free-trial mechanics (no setup needed)">
        <P>
          Every new account gets <Code>trial_credits_remaining=1</Code>{" "}
          via the migration default. The first analysis burns the trial;
          the resulting PDF carries the amber{" "}
          <strong>SAMPLE, VEROAX TRIAL · NOT FOR CLIENT DELIVERY</strong>{" "}
          band on every page. To deliver unwatermarked, the agent must
          subscribe or buy a one-off.
        </P>
        <P>To grant extra trial credits manually:</P>
        <Pre>{`update public.profiles
set trial_credits_remaining = trial_credits_remaining + 1
where email = '<recipient>';`}</Pre>
      </Section>

      <Section number={8} title="30-day free-update window (no setup needed)">
        <P>
          When the analyzer is re-run on an existing report within 30 days
          of its creation (add documents, remove a file, force-rerun,
          etc.), no new credit is consumed. A{" "}
          <Code>free_update_window</Code> ledger entry appears on the
          billing dashboard so the agent can see the free use.
        </P>
        <P>Outside 30 days, the rerun consumes a credit.</P>
      </Section>
    </div>
  );
}

// =====================================================================
// Tiny rendering helpers, keep this file self-contained.
// =====================================================================

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <h2 className="text-base font-bold text-slate-900 mb-3">
        {number}. {title}
      </h2>
      <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-700 leading-relaxed">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-xs bg-slate-100 text-slate-900 px-1.5 py-0.5 rounded font-mono">
      {children}
    </code>
  );
}

function Pre({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <pre
      className={`bg-slate-900 text-slate-100 text-xs font-mono p-3 rounded-lg overflow-x-auto ${className ?? ""}`}
    >
      {children}
    </pre>
  );
}
