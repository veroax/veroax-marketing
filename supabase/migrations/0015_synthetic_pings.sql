-- 0015_synthetic_pings.sql
--
-- Stores proactive heartbeat checks against the four external
-- services we depend on: Anthropic (analyzer), Supabase Storage
-- (PDF inventory), Stripe (billing), Resend (email send).
--
-- A cron at /api/cron/synthetic-heartbeat fires hourly, runs each
-- ping, and writes one row per service per run. The admin health
-- page reads the most recent row per service to render colored
-- status dots PLUS the last 24 hours of pings to compute uptime
-- percentages and latency trends.
--
-- This table is metadata, not user data. RLS is enabled with no
-- policies so the application code (anon and authenticated
-- clients) cannot read or write it; the cron route uses the
-- service-role client.

create table if not exists public.synthetic_pings (
  id              uuid primary key default gen_random_uuid(),
  -- One of: 'anthropic' | 'storage' | 'stripe' | 'resend'.
  -- Free text rather than an enum so we can add more services
  -- without a follow-up migration.
  service         text not null,
  -- When the ping fired.
  ran_at          timestamptz not null default now(),
  -- True if the round-trip succeeded; false otherwise.
  ok              boolean not null,
  -- Round-trip latency in milliseconds. May be null when the
  -- ping failed before any network call (e.g., missing env var).
  latency_ms      integer,
  -- Short error message when ok=false. Truncated to 500 chars
  -- at write time so a verbose error doesn't bloat the row.
  error_message   text,
  -- Free-form per-service detail (model used, file size sent,
  -- Stripe account id echoed back, etc).
  metadata        jsonb not null default '{}'::jsonb
);

create index if not exists synthetic_pings_service_ran_at
  on public.synthetic_pings(service, ran_at desc);

alter table public.synthetic_pings enable row level security;

insert into public._migrations(name) values ('0015_synthetic_pings')
  on conflict (name) do nothing;
