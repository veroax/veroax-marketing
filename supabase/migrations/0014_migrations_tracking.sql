-- 0014_migrations_tracking.sql
--
-- Server-side record of which migrations have actually been applied
-- to this database. Until now we tracked migrations by file naming
-- convention and trust; this table makes the record authoritative
-- so we can answer "is migration 0017 applied yet?" without guessing.
--
-- CONVENTION (enforced by AGENTS.md):
-- Every new migration file MUST end with the line:
--
--   insert into public._migrations(name) values ('NNNN_name')
--     on conflict (name) do nothing;
--
-- The on-conflict clause makes re-running a migration safe; the
-- table stays the single source of truth even if a file is run
-- twice by accident.
--
-- To audit at any time:
--   select name from public._migrations order by name;
-- and compare against `ls supabase/migrations/`.

create table if not exists public._migrations (
  name        text primary key,
  applied_at  timestamptz not null default now(),
  applied_by  text not null default current_user
);

-- Lock down: this table is metadata, not user data. Service-role
-- writes happen via migration files; nobody should be reading or
-- writing this through the application code paths. Enable RLS with
-- no policies so all non-service-role access is denied.
alter table public._migrations enable row level security;

-- Backfill the historical record. on conflict do nothing makes the
-- whole block idempotent: safe to re-run on a database that already
-- has some of these rows.
insert into public._migrations(name) values
  ('0001_initial_schema'),
  ('0002_storage_policies'),
  ('0003_brokerage_dre'),
  ('0004_listing_data'),
  ('0005_report_metadata'),
  ('0006_report_versions'),
  ('0007_display_email'),
  ('0008_agent_branding'),
  ('0009_archive_and_admin'),
  ('0010_share_code'),
  ('0011_billing'),
  ('0012_report_errors'),
  ('0013_vip_and_admin_grants'),
  ('0014_migrations_tracking')
  on conflict (name) do nothing;
