-- 0011_billing.sql
--
-- Billing infrastructure: trial flag on profiles, period-anchored
-- usage tracking via reports.created_at, and an explicit credit
-- ledger for non-subscription credits (pay-as-you-go purchases,
-- admin grants, refunds).
--
-- The subscriptions table from 0001_initial_schema.sql already carries
-- plan, billing, status, reports_included, current_period_start,
-- current_period_end, no changes needed there. The webhook handler
-- in app/api/webhook/route.ts is updated separately to actually
-- write to that table on checkout.session.completed and
-- customer.subscription.{updated,deleted}.

-- ============================================================================
-- 1. profiles: trial tracking + one-off credit balance
-- ============================================================================

alter table public.profiles
  add column if not exists trial_credits_remaining int not null default 1,
  add column if not exists report_credits_balance int not null default 0,
  add column if not exists stripe_customer_id text;

-- Trial: every new signup gets 1 free trial credit. Reports created
-- with a trial credit produce a watermarked PDF, the agent can see
-- the quality but can't ship the report to their client until they
-- subscribe.
--
-- report_credits_balance: one-off pay-as-you-go purchases. Consumed
-- AFTER subscription credits are exhausted in the current period.
-- Doesn't expire, these are credits the agent paid for cash.
--
-- stripe_customer_id: stable Stripe customer reference so we can
-- create portal sessions, look up subscriptions, etc. Synced by the
-- webhook on first checkout.

create unique index if not exists profiles_stripe_customer_id_unique
  on public.profiles(stripe_customer_id)
  where stripe_customer_id is not null;

-- ============================================================================
-- 2. report_credit_ledger: full audit trail of credits
-- ============================================================================
-- Optional but recommended, every grant and consumption gets a row.
-- The balance helpers in /lib/billing/credits.ts compute current
-- state from this ledger + subscription period + profile balance.

create table if not exists public.report_credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount          int not null,            -- positive = grant, negative = consume
  reason          text not null,           -- 'trial_grant' | 'subscription_renewal' | 'oneoff_purchase' | 'report_consumed' | 'admin_grant' | 'admin_refund' | 'free_update_window'
  report_id       uuid references public.reports(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists ledger_user_created
  on public.report_credit_ledger(user_id, created_at desc);
create index if not exists ledger_user_reason
  on public.report_credit_ledger(user_id, reason);

-- RLS: users read their own ledger entries; only service-role writes.
alter table public.report_credit_ledger enable row level security;

drop policy if exists "ledger_select_own" on public.report_credit_ledger;
create policy "ledger_select_own"
  on public.report_credit_ledger for select
  using (auth.uid() = user_id);

-- ============================================================================
-- 3. reports table: billable + watermarked flags
-- ============================================================================
-- billable: set true the moment a credit is consumed by this report.
-- The subscription-period usage count selects reports where
-- billable=true (so an interrupted upload that never finalized
-- doesn't count against the agent's monthly quota).
--
-- watermarked: set true when the consumed credit was a trial credit.
-- The PDF renderer reads this and overlays a "SAMPLE, VEROAX TRIAL"
-- watermark on every page. Agents see what they're buying without
-- being able to ship a real client deliverable on the free trial.

alter table public.reports
  add column if not exists billable boolean not null default false,
  add column if not exists watermarked boolean not null default false;

create index if not exists reports_user_billable_period_idx
  on public.reports(user_id, billable, created_at desc);

-- ============================================================================
-- 4. Subscription extras for plan + Stripe price IDs
-- ============================================================================
-- The 0001 schema's subscriptions.plan was 'solo'|'pro'|'brokerage';
-- we add the price_id we synced from so the webhook can correlate
-- price → plan when Stripe sends an event with only the price ref.

alter table public.subscriptions
  add column if not exists stripe_price_id text;

create index if not exists subscriptions_price_id_idx
  on public.subscriptions(stripe_price_id);

-- ============================================================================
-- 4. Trial-credit grant on new profile (handled by the existing
--    on-signup trigger from 0001_initial_schema.sql, it inserts a
--    new profile row which gets trial_credits_remaining=1 by default).
-- ============================================================================
