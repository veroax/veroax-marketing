import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { balanceForUser } from "@/lib/billing/credits";
import Stripe from "stripe";

export const metadata = {
  title: "Billing — Veroax",
};

type LedgerRow = {
  id: string;
  amount: number;
  reason: string;
  report_id: string | null;
  metadata: unknown;
  created_at: string;
};

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Snapshot the user's full credit picture for the header cards.
  const balance = await balanceForUser(user.id);

  // Recent ledger entries — drives the activity list at the bottom
  // of the page. Capped at 30; "View all" link could go to a
  // dedicated history page later.
  const { data: ledgerData } = await supabase
    .from("report_credit_ledger")
    .select("id, amount, reason, report_id, metadata, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const ledger = (ledgerData ?? []) as LedgerRow[];

  // Recent Stripe invoices — best-effort. If the user doesn't have
  // a Stripe customer ID yet, we skip this section entirely.
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  const customerId =
    (profile as { stripe_customer_id?: string | null } | null)
      ?.stripe_customer_id ?? null;

  type InvoiceMini = {
    id: string;
    number: string | null;
    status: string | null;
    amount_paid: number;
    currency: string;
    created: number;
    hosted_invoice_url: string | null;
  };
  let invoices: InvoiceMini[] = [];
  if (customerId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const list = await stripe.invoices.list({
        customer: customerId,
        limit: 12,
      });
      invoices = list.data.map((inv) => ({
        id: inv.id ?? "",
        number: inv.number,
        status: inv.status,
        amount_paid: inv.amount_paid ?? 0,
        currency: inv.currency ?? "usd",
        created: inv.created,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
      }));
    } catch (err) {
      // Non-fatal — billing page still renders the other sections.
      console.error("[billing] could not load Stripe invoices:", err);
    }
  }

  const subscriptionLabel = balance.isVip
    ? "VIP · free access"
    : balance.subscriptionPlan && balance.subscriptionActive
      ? balance.subscriptionPlan.charAt(0).toUpperCase() +
        balance.subscriptionPlan.slice(1)
      : "Free trial";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your plan, credit balance, and recent activity.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {customerId ? (
            <a
              href="/api/billing/portal"
              className="inline-flex items-center gap-2 bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-indigo-600 text-sm"
            >
              Manage subscription →
            </a>
          ) : null}
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 bg-amber-400 text-indigo-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 text-sm shadow-sm"
          >
            {customerId ? "Change plan" : "Choose a plan"}
          </Link>
        </div>
      </div>

      {/* VIP banner — shown only to VIP users, replaces the plan
          chrome with a clear "you have free access" indication. */}
      {balance.isVip ? (
        <section
          className="rounded-2xl border-2 border-amber-400 p-5 sm:p-6"
          style={{
            background: "linear-gradient(135deg,#fef3c7 0%,#fde68a 100%)",
          }}
        >
          <p className="text-[10px] font-bold tracking-widest uppercase text-amber-900">
            ★ VIP Access
          </p>
          <p className="text-xl sm:text-2xl font-bold text-amber-950 mt-1">
            You have free access to all features
          </p>
          <p className="text-sm text-amber-900 mt-2 leading-relaxed">
            Generate as many full-quality, unwatermarked reports as you
            need. No credit consumption, no billing. If you have
            questions about your VIP status reach out to{" "}
            <a
              href="mailto:support@veroax.com"
              className="underline underline-offset-2 font-semibold"
            >
              support@veroax.com
            </a>
            .
          </p>
        </section>
      ) : null}

      {/* Plan summary card */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
              Current plan
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {subscriptionLabel}
            </p>
            {balance.isVip ? (
              <p className="text-xs text-amber-700 mt-1">
                VIP status overrides the credit gate
              </p>
            ) : balance.subscriptionActive && balance.subscriptionPeriodEnd ? (
              <p className="text-xs text-slate-500 mt-1">
                Renews {formatDate(balance.subscriptionPeriodEnd)}
              </p>
            ) : !customerId ? (
              <p className="text-xs text-slate-500 mt-1">
                You haven&apos;t subscribed yet — running on the free
                trial.
              </p>
            ) : null}
          </div>

          {/* Credit pools — 3 stacked cards on mobile, row on desktop */}
          <div className="grid grid-cols-3 gap-3 text-center w-full sm:w-auto">
            <Stat
              label="Subscription"
              value={balance.subscriptionReportsRemaining}
              sub={
                balance.subscriptionReportsIncluded > 0
                  ? `of ${balance.subscriptionReportsIncluded}/mo`
                  : "—"
              }
            />
            <Stat
              label="Pay-as-you-go"
              value={balance.oneoffCredits}
              sub="don't expire"
            />
            <Stat
              label="Trial"
              value={balance.trialCredits}
              sub="watermarked"
              tone={balance.trialCredits > 0 ? "amber" : "default"}
            />
          </div>
        </div>

        {/* Quick "buy more" affordance — suppressed for VIPs whose
            access doesn't depend on credit balance. */}
        {!balance.isVip &&
        balance.subscriptionReportsRemaining === 0 &&
        balance.oneoffCredits === 0 &&
        balance.trialCredits === 0 ? (
          <div className="mt-5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-900">
            <p className="font-semibold mb-1">No credits available.</p>
            <p>
              <Link
                href="/pricing"
                className="underline underline-offset-2 font-semibold"
              >
                Choose a plan
              </Link>{" "}
              or{" "}
              <a
                href="/api/checkout?plan=oneoff"
                className="underline underline-offset-2 font-semibold"
              >
                buy a single report
              </a>{" "}
              to keep analyzing.
            </p>
          </div>
        ) : null}
      </section>

      {/* Recent activity — credit ledger */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900 mb-3">
          Credit activity
        </h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            No credit activity yet — your trial grant will appear here
            when you generate your first report.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {ledger.map((row) => (
              <li
                key={row.id}
                className="py-2.5 flex items-start gap-3 flex-wrap"
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${ledgerTone(row.reason)}`}
                >
                  {ledgerLabel(row.reason)}
                </span>
                <span className="flex-1 min-w-0 text-slate-700">
                  {ledgerDescription(row)}
                </span>
                <span
                  className={`text-sm font-mono font-semibold ${row.amount > 0 ? "text-emerald-700" : "text-slate-700"}`}
                >
                  {row.amount > 0 ? "+" : ""}
                  {row.amount}
                </span>
                <span className="text-xs text-slate-400 shrink-0">
                  {formatDate(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Invoice history (Stripe) */}
      {invoices.length > 0 ? (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900 mb-3">
            Invoice history
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="py-2.5 flex items-center gap-3 flex-wrap"
              >
                <span className="font-mono text-xs text-slate-500 shrink-0">
                  {inv.number ?? inv.id.slice(0, 8)}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
                    inv.status === "paid"
                      ? "bg-emerald-100 text-emerald-800"
                      : inv.status === "open"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {inv.status ?? "—"}
                </span>
                <span className="flex-1 text-slate-700">
                  {new Date(inv.created * 1000).toLocaleDateString(
                    undefined,
                    { dateStyle: "long" },
                  )}
                </span>
                <span className="font-mono text-slate-900 font-semibold">
                  {formatStripeAmount(inv.amount_paid, inv.currency)}
                </span>
                {inv.hosted_invoice_url ? (
                  <a
                    href={inv.hosted_invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-700 underline underline-offset-2"
                  >
                    View →
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "default" | "amber";
}) {
  const valueClass =
    tone === "amber" && value > 0
      ? "text-amber-700"
      : value === 0
        ? "text-slate-400"
        : "text-slate-900";
  return (
    <div className="bg-slate-50 rounded-xl px-3 py-2.5 min-w-[100px]">
      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-0.5 ${valueClass}`}>{value}</p>
      {sub ? <p className="text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function ledgerLabel(reason: string): string {
  switch (reason) {
    case "trial_grant":
      return "Trial";
    case "subscription_renewal":
      return "Renewal";
    case "oneoff_purchase":
      return "Purchase";
    case "report_consumed":
      return "Report";
    case "admin_grant":
      return "Grant";
    case "admin_refund":
      return "Refund";
    case "free_update_window":
      return "Free upd.";
    default:
      return reason;
  }
}
function ledgerTone(reason: string): string {
  if (reason === "report_consumed") return "bg-slate-200 text-slate-800";
  if (reason === "subscription_renewal") return "bg-emerald-100 text-emerald-800";
  if (reason === "oneoff_purchase") return "bg-amber-100 text-amber-800";
  if (reason === "trial_grant") return "bg-indigo-100 text-indigo-800";
  if (reason === "admin_grant" || reason === "admin_refund")
    return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}
function ledgerDescription(row: LedgerRow): string {
  switch (row.reason) {
    case "trial_grant":
      return "Free trial credit granted on signup";
    case "subscription_renewal":
      return `Subscription renewed — credits granted`;
    case "oneoff_purchase":
      return "Pay-as-you-go credit purchased";
    case "report_consumed":
      return `Report ${(row.report_id ?? "").slice(0, 8) || "consumed"}${
        (row.metadata as { watermarked?: boolean } | null)?.watermarked
          ? " (watermarked — trial)"
          : ""
      }`;
    case "admin_grant":
      return "Admin-granted credit";
    case "admin_refund":
      return "Refund for failed analysis";
    default:
      return row.reason;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}
function formatStripeAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
