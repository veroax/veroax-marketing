-- 0023_site_config.sql
--
-- Single-row config table for site-wide settings that admins manage
-- from the UI rather than from Vercel env vars. First use case is
-- the Google Analytics 4 Measurement ID; the table is structured to
-- accommodate additional integrations (Plausible, PostHog, Hotjar,
-- etc.) without further migrations.
--
-- Why a table rather than env vars: the founder wants to toggle
-- analytics tracking on and off from /admin/integrations without
-- going to Vercel, re-deploying, and waiting for cold starts to
-- pick up the new value.
--
-- Singleton enforcement: id is a fixed UUID. The seed row below
-- inserts that exact id; subsequent inserts collide on the primary
-- key. All reads pin to id = 'aaaaaaaa-...' so there is exactly
-- one row in practice.

create table if not exists public.site_config (
  id                          uuid primary key,
  -- GA4 Measurement ID, shape "G-XXXXXXXXXX". Null means analytics
  -- is off; the root layout skips injecting gtag.js when null.
  google_analytics_id         text,
  -- Optional: a comment explaining why analytics is configured the
  -- way it is. Free-form, internal-only.
  notes                       text,
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references public.profiles(id) on delete set null
);

-- Seed the single row so subsequent updates always find a target.
insert into public.site_config (id, google_analytics_id)
values ('00000000-0000-0000-0000-000000000001', null)
on conflict (id) do nothing;

-- updated_at auto-bump trigger, same shape as the brokerages /
-- teams triggers in 0021.
drop trigger if exists set_site_config_updated_at on public.site_config;
create trigger set_site_config_updated_at
  before update on public.site_config
  for each row execute function public.set_updated_at();

-- RLS: nobody but service-role touches this. Site admins go through
-- /api/admin/integrations which uses the service-role client. We do
-- NOT enable RLS here on purpose; the table is service-role-only,
-- never queried via the user-scoped client. Defense-in-depth: the
-- service-role bypasses RLS anyway, and a missing policy is safer
-- than an over-permissive one.
alter table public.site_config disable row level security;

-- Migration registration.
insert into public._migrations(name) values ('0023_site_config')
  on conflict (name) do nothing;
