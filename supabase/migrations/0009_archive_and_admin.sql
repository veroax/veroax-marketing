-- Adds archive support on reports and a single-flag admin role on
-- profiles. Both are nullable-with-default and idempotent, so re-runs
-- are harmless.
--
--   reports.archived       boolean  default false — drives the
--                                                   /dashboard vs.
--                                                   /dashboard/archive
--                                                   split
--   reports.archived_at    timestamptz nullable — set on archive,
--                                                  cleared on restore
--   profiles.is_admin      boolean  default false — manually flipped
--                                                   in SQL by the
--                                                   product owner;
--                                                   future: an admin
--                                                   UI page sets it
--
-- Plus a composite index on (user_id, archived, created_at desc) so
-- the dashboard's main listing query (which always filters by
-- user_id and archived, ordering by created_at) is single-scan.

alter table public.reports
  add column if not exists archived       boolean      not null default false,
  add column if not exists archived_at    timestamptz;

alter table public.profiles
  add column if not exists is_admin       boolean      not null default false;

create index if not exists reports_user_archived_idx
  on public.reports(user_id, archived, created_at desc);
