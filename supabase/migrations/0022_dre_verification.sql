-- 0022_dre_verification.sql
--
-- DRE (California Department of Real Estate) license verification for
-- Veroax signups. Adds five columns to profiles:
--
--   dre_verification_status        text   one of 'verified', 'mismatch',
--                                         'inactive', 'expired', 'suspended',
--                                         'revoked', 'not_found', 'error',
--                                         'pending'. Null = never checked.
--   dre_verified_at                timestamptz  Stamped when status became
--                                         'verified'. Cleared when status
--                                         degrades.
--   dre_verification_checked_at    timestamptz  Stamped on EVERY check
--                                         attempt (success or failure).
--                                         Drives the 24h "stale, recheck"
--                                         cache.
--   dre_verification_method        text   How we verified: 'public_lookup'
--                                         (CA DRE public site, the only
--                                         method today) or 'subscription_db'
--                                         (future: paid licensee data).
--   dre_verification_response      jsonb  Raw structured fields parsed from
--                                         the DRE response. Useful for
--                                         debugging mismatch / error cases.
--                                         Capped to ~2KB by the scraper.
--
-- Verification is non-blocking by design: a new signup can use the
-- product immediately. Unverified accounts are surfaced on /admin/users
-- via a yellow badge so the founder can review + reach out, but they
-- are NOT gated from generating reports until we see real-world
-- false-rejection rates in this Stage 1.

alter table public.profiles
  add column if not exists dre_verification_status     text,
  add column if not exists dre_verified_at             timestamptz,
  add column if not exists dre_verification_checked_at timestamptz,
  add column if not exists dre_verification_method     text,
  add column if not exists dre_verification_response   jsonb;

-- Check constraint on the status enum, only when set.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_dre_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_dre_verification_status_check
      check (
        dre_verification_status is null or
        dre_verification_status in (
          'verified', 'mismatch', 'inactive', 'expired',
          'suspended', 'revoked', 'not_found', 'error', 'pending'
        )
      );
  end if;
end $$;

-- Index for the admin "show unverified" filter and for bulk recheck
-- sweeps. Partial: only rows that have an outcome status are indexed,
-- which keeps the index small (most healthy verified accounts won't
-- get touched by the filter).
create index if not exists profiles_dre_verification_status_idx
  on public.profiles(dre_verification_status)
  where dre_verification_status is not null;

-- Migration registration.
insert into public._migrations(name) values ('0022_dre_verification')
  on conflict (name) do nothing;
