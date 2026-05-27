-- 0027_profile_archive.sql
--
-- Soft-delete (archive) infrastructure for user accounts.
--
-- An archived agent:
--   - Cannot log in (middleware redirects them to /account-archived)
--   - Their reports stay in the database; team / brokerage admins
--     who could see those reports before still can
--   - Their public report share-codes are revoked at archive time
--     (a separate column on reports gets nulled by archiveUser.ts)
--   - Their team_members + brokerage_agents + brokerage_admins rows
--     are PRESERVED so a restore puts them right back in the slot
--   - Does NOT count toward the brokerage's agent_seat_limit
--
-- archived_scope distinguishes:
--   'brokerage': a brokerage admin archived this agent from their
--                roster. Restorable by the same brokerage's admin OR
--                by any site admin.
--   'site':      a site admin archived this agent. Restorable only
--                by site admins. The brokerage admin sees them as
--                "Site admin archived" with no restore button.

alter table public.profiles
  add column if not exists archived_at      timestamptz,
  add column if not exists archived_by      uuid references public.profiles(id) on delete set null,
  add column if not exists archived_reason  text,
  add column if not exists archived_scope   text;

-- Check constraint on scope, only enforced when set.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_archived_scope_check'
  ) then
    alter table public.profiles
      add constraint profiles_archived_scope_check
      check (
        archived_scope is null or
        archived_scope in ('brokerage', 'site')
      );
  end if;
end $$;

-- Partial index for "list archived users" admin views. Small because
-- only archived rows are indexed; active users (99%+ of the table)
-- never appear in this index.
create index if not exists profiles_archived_idx
  on public.profiles(archived_at)
  where archived_at is not null;

-- Migration registration.
insert into public._migrations(name) values ('0027_profile_archive')
  on conflict (name) do nothing;
