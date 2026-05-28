-- 0030_report_soft_delete.sql
--
-- Soft-delete pattern for reports. Both admin and user deletes go
-- into a "to be deleted" bucket for 30 days before permanent
-- removal, so mistakes can be corrected. Mirrors the existing
-- archive pattern (archived / archived_at columns from migration
-- 0009) but is a stronger commitment: archived reports stay
-- visible in the agent's archive view; deleted reports are hidden
-- from every surface and have a fixed purge deadline.
--
-- Columns:
--   deleted_at        timestamptz when the soft-delete happened.
--                     NULL means the report is live.
--   deleted_by        uuid of the actor (admin OR owning agent).
--                     NULL when never deleted.
--   deleted_reason    optional free-text "why" (admin can leave a
--                     note for the audit trail).
--   purge_after       timestamptz when the permanent purge runs.
--                     Stamped to deleted_at + 30 days at delete
--                     time. The /api/cron/purge-deleted-reports
--                     cron sweeps rows whose purge_after has
--                     passed.
--
-- Partial indexes on the deleted bucket keep "list deleted reports"
-- and "find rows due to purge" queries fast without bloating the
-- main reports indexes. Almost all rows are NOT deleted, so the
-- partial filter is highly selective.

alter table public.reports
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists deleted_reason text,
  add column if not exists purge_after timestamptz;

create index if not exists reports_deleted_at_idx
  on public.reports(deleted_at desc)
  where deleted_at is not null;

create index if not exists reports_purge_due_idx
  on public.reports(purge_after)
  where deleted_at is not null;

-- Migration registration.
insert into public._migrations(name) values ('0030_report_soft_delete')
  on conflict (name) do nothing;
