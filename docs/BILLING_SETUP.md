# Billing setup — what you need to do

The code for Stripe Checkout, the credit ledger, the customer
portal, the pricing page, and the billing dashboard all shipped in
commits `5087643` / `582be1e` / `4254d64`. Three pieces of setup
remain — they require dashboard access I don't have.

## 1. Run the migration in Supabase

Open the Supabase SQL editor and run the contents of
`supabase/migrations/0011_billing.sql`. Idempotent — safe to re-run
if you're unsure whether it applied.

The migration adds:
- `profiles.trial_credits_remaining` (default 1)
- `profiles.report_credits_balance`
- `profiles.stripe_customer_id` (unique)
- `reports.billable` (default false)
- `reports.watermarked` (default false)
- `subscriptions.stripe_price_id`
- New table `report_credit_ledger`

After running, verify with:

```sql
select count(*) from report_credit_ledger; -- should return 0
select column_name from information_schema.columns
  where table_name = 'reports' and column_name in ('billable', 'watermarked');
-- should return 2 rows
```

## 2. Create products + prices in Stripe

In your Stripe dashboard (Test mode while you're testing,
Production when you go live):

For each of **Solo / Pro / Brokerage**, create one Product and TWO
recurring Prices on it (monthly + annual). The default labels and
amounts match what `lib/billing/plans.ts` advertises on the
pricing page — adjust the dollar amounts there too if you change
them in Stripe.

| Plan | Monthly | Annual |
|---|---|---|
| Solo Agent | $49 | $490 |
| Pro | $149 | $1,490 |
| Brokerage | $449 | $4,490 |

Plus a one-time price for **Pay-as-you-go single-report purchase**:

| Plan | One-time |
|---|---|
| Single report | $25 |

After creating each price, copy its `price_xxx` ID into Vercel's
environment variables (Project → Settings → Environment Variables):

```
STRIPE_PRICE_SOLO_MONTHLY=price_xxx
STRIPE_PRICE_SOLO_ANNUAL=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_ANNUAL=price_xxx
STRIPE_PRICE_BROKERAGE_MONTHLY=price_xxx
STRIPE_PRICE_BROKERAGE_ANNUAL=price_xxx
STRIPE_PRICE_ONEOFF_REPORT=price_xxx
```

Mark each as **Sensitive** in Vercel.

`STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are
already set from earlier work — leave them.

## 3. Configure the Stripe webhook

In Stripe → Developers → Webhooks, add an endpoint at:

```
https://www.veroax.com/api/webhook
```

Subscribe to these events (don't subscribe to everything — you'll
just burn quota):

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

After creating the endpoint, copy the **Signing secret** (starts
with `whsec_...`) and add it to Vercel:

```
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

> Don't paste the `whsec_...` value into chat — same paste-safety
> rule as the Stripe secret key.

Mark it **Sensitive**.

## 4. Configure the Stripe Customer Portal

In Stripe → Settings → Billing → Customer Portal:

1. Activate the portal.
2. Allow customers to:
   - Update payment method
   - View invoice history
   - Cancel subscriptions
   - Upgrade / downgrade between Solo / Pro / Brokerage
3. Set the support email to `support@veroax.com`.
4. Branding: upload the Veroax logo and set the brand color to
   `#1e1b4b` (matches the dashboard chrome).

Without this step, the "Manage subscription" button on
`/dashboard/billing` will surface a Stripe error.

## 5. Redeploy Vercel after env var changes

Vercel doesn't auto-pick up env var changes on existing deployments.
Trigger a new deploy from the Vercel dashboard (or push any commit)
after adding the Stripe price IDs + webhook secret.

## Smoke test

Once the above is done, in Stripe test mode:

1. Open `https://www.veroax.com/pricing` while signed in to a
   Veroax test account.
2. Click "Start Solo — $49/mo". You should land on Stripe Checkout
   with your account email pre-filled.
3. Use Stripe's test card `4242 4242 4242 4242` with any future
   expiry and any CVC.
4. After successful checkout you should land on
   `/checkout/success`.
5. Refresh `/dashboard/billing`. You should see:
   - Current plan: Solo
   - Subscription credits: 3 of 3/mo
   - Credit activity: one "Renewal +3" entry
   - Invoice history: one "paid" invoice for $49
6. Run `select * from subscriptions where user_id = '<your test
   account>';` in Supabase — there should be one row with
   `status='active'`, `plan='solo'`, `reports_included=3`.

If step 5 doesn't show the subscription, check the Stripe Dashboard
→ Developers → Webhook attempts for the endpoint. Failed attempts
usually mean `STRIPE_WEBHOOK_SECRET` is wrong in Vercel.

## Free-trial mechanics (no setup needed)

Every new account gets `trial_credits_remaining=1` via the migration
default. They burn it on their first analysis; the resulting PDF
has the amber "SAMPLE — VEROAX TRIAL · NOT FOR CLIENT DELIVERY"
band on every page. To deliver an unwatermarked report they need to
subscribe or buy a one-off.

Admins can grant extra trial credits manually in SQL:

```sql
update public.profiles
set trial_credits_remaining = trial_credits_remaining + 1
where email = '<recipient>';
```

## 30-day free-update window (no setup needed)

When the analyzer is re-run on an existing report within 30 days of
its creation (add documents, remove a file, force-rerun, etc.), no
new credit is consumed. A `free_update_window` ledger entry appears
on the billing dashboard so the agent can see the free use.

Outside 30 days the rerun consumes a credit.
