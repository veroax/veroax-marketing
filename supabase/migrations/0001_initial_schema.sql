-- Veroax — Phase 1 initial schema
-- Run this in Supabase Dashboard → SQL Editor → New query → paste → Run
-- After running, verify all tables exist in Table Editor.
--
-- Idempotency: this migration uses `create ... if not exists` and
-- drops + recreates policies, so it can be re-run safely on a fresh
-- project. Do NOT re-run on a project with existing data without
-- review.

-- ============================================================================
-- 1. profiles
-- ============================================================================
-- Each authenticated user gets one row, keyed to auth.users(id).
-- The profile row is created automatically by a trigger when a new
-- auth user signs up (see trigger below).

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  dre_license text,
  brokerage text,
  phone text,
  logo_url text,            -- agent's logo for branded PDFs
  photo_url text,           -- agent's headshot for branded PDFs
  free_trial_used boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profiles_dre_license on public.profiles(dre_license);

-- ============================================================================
-- 2. subscriptions
-- ============================================================================
-- Synced from Stripe webhooks. One row per Stripe subscription.
-- A user may have only one active subscription at a time (enforced in
-- the webhook handler rather than as a unique constraint, since canceled
-- rows still need to persist for history).

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null,           -- 'solo' | 'pro' | 'brokerage'
  billing text,                 -- 'monthly' | 'annual'
  status text not null,         -- stripe statuses: trialing|active|past_due|canceled|...
  reports_included int not null default 0,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_stripe_subscription_id on public.subscriptions(stripe_subscription_id);

-- ============================================================================
-- 3. reports
-- ============================================================================
-- One row per disclosure analysis. Tracks the full lifecycle from
-- upload through QA through delivery.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- lifecycle
  status text not null default 'uploaded',
  -- statuses: uploaded | analyzing | qa_pending | qa_approved | delivered | failed

  -- property identification (extracted during analysis)
  property_address text,
  property_city text,
  property_zip text,

  -- source materials
  source_file_path text,        -- path in storage bucket "disclosures"

  -- analysis output
  report_data jsonb,            -- structured 14-section findings, ratings, costs
  pdf_path text,                -- final branded PDF in storage bucket "reports"

  -- delivery
  client_name text,
  client_email text,
  delivered_at timestamptz,
  delivery_message text,        -- email body sent to client

  -- diagnostics
  analysis_started_at timestamptz,
  analysis_completed_at timestamptz,
  failure_reason text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_reports_user_id on public.reports(user_id);
create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_reports_created_at on public.reports(created_at desc);

-- ============================================================================
-- 4. audit_log
-- ============================================================================
-- Long-retention log for compliance and dispute resolution. Per the
-- Privacy Policy, retained for up to 7 years. Stores non-PII metadata
-- about reports — never the disclosure content itself.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  event_type text not null,     -- e.g. 'report.created', 'report.delivered', 'pii.purged'
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_user_id on public.audit_log(user_id);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists set_reports_updated_at on public.reports;
create trigger set_reports_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- ============================================================================
-- auto-create profile on signup
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- Every table is locked by default. Policies grant minimum-required
-- access. Server-side code using the service_role key bypasses RLS
-- intentionally — that's where webhook handlers and analysis workers run.

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;

-- profiles: users can read and update their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- subscriptions: users can read their own. Writes are server-only
-- (Stripe webhook handler uses service_role and bypasses RLS).
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- reports: full CRUD on own rows.
drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
  on public.reports for select
  using (auth.uid() = user_id);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  with check (auth.uid() = user_id);

drop policy if exists "reports_update_own" on public.reports;
create policy "reports_update_own"
  on public.reports for update
  using (auth.uid() = user_id);

drop policy if exists "reports_delete_own" on public.reports;
create policy "reports_delete_own"
  on public.reports for delete
  using (auth.uid() = user_id);

-- audit_log: users can read their own log entries. No client-side writes
-- (server-only via service_role).
drop policy if exists "audit_log_select_own" on public.audit_log;
create policy "audit_log_select_own"
  on public.audit_log for select
  using (auth.uid() = user_id);

-- ============================================================================
-- Storage buckets
-- ============================================================================
-- "disclosures" — raw uploaded PDF packages (private)
-- "reports"     — final branded PDFs (private; signed-URL access)
--
-- We create the buckets here; the storage RLS policies are set in
-- 0002_storage_policies.sql.

insert into storage.buckets (id, name, public)
values ('disclosures', 'disclosures', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;
