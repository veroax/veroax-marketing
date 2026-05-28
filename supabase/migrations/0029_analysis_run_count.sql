-- 0029_analysis_run_count.sql
--
-- Adds a counter that tracks how many times each report's analysis
-- has been run. Defaults to 1 for the original analysis; gets
-- incremented on every retry, whether the agent kicked it off from
-- the failed-state Retry button or an admin re-ran it from
-- /admin/reports/[id].
--
-- This is DIFFERENT from reports.update_count, which counts /update
-- flow events (when the agent appends new files to an existing
-- package and re-analyzes the combined set). Re-runs analyze the
-- SAME files; updates analyze MORE files. We track both because
-- they tell different stories.
--
-- Backfill rule: existing rows default to 1. Historical retries
-- aren't reconstructed from audit_log because the cost of being
-- wrong (off by N) is low and the cost of the backfill SQL is
-- non-trivial. New retries from this migration forward count
-- correctly.

alter table public.reports
  add column if not exists analysis_run_count int not null default 1;

-- Migration registration.
insert into public._migrations(name) values ('0029_analysis_run_count')
  on conflict (name) do nothing;
