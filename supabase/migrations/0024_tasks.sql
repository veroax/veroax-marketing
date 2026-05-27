-- 0024_tasks.sql
--
-- Web-UI version of TODO.md. Each task gets a row in public.tasks;
-- the founder checks them off from /admin/tasks. completed_at +
-- completed_by preserve "who did what, when", and a parallel
-- audit_log entry records every toggle so we have a tamper-evident
-- trail.
--
-- Schema is intentionally simple. No tagging, no due dates, no
-- recurring tasks. If we need those later, additive migration.
--
-- Categories: 'now', 'beta', 'launch', 'deferred', 'polish'
-- Owners:     'you' (Michael), 'me' (Claude), 'either'
--
-- The actual initial task data ships in 0025_seed_tasks_from_todo.sql
-- so a future "wipe + reseed" is just `truncate public.tasks; \i
-- 0025_seed_tasks_from_todo.sql`.

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  -- Markdown for the expanded detail view. Renders via marked at
  -- request time. Nullable; short tasks don't need a body.
  body         text,
  category     text not null
               check (category in ('now', 'beta', 'launch', 'deferred', 'polish')),
  owner        text not null
               check (owner in ('you', 'me', 'either')),
  -- Sort order WITHIN a category. We display by category, then
  -- sort_order ascending. Gaps left in case admin wants to reorder.
  sort_order   int not null default 0,
  is_done      boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);

create index if not exists tasks_category_sort_idx
  on public.tasks(category, sort_order);
create index if not exists tasks_done_idx
  on public.tasks(is_done);

-- Unique on (title, category) so 0025's seed inserts are idempotent.
-- The same title under a different category is treated as a separate
-- task on purpose (a "polish" item with the same title as a "now"
-- item could legitimately exist).
create unique index if not exists tasks_title_category_unique
  on public.tasks(title, category);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- RLS ENABLED with no policies. Result:
--   - anon key: blocked
--   - authenticated key: blocked
--   - service-role key (used by /admin/tasks routes): bypasses RLS,
--     works as expected
-- All admin reads + writes go through requireAdmin + service-role,
-- so enabling RLS adds zero friction while giving us defense-in-depth
-- against a leaked anon key or a future misconfiguration.
alter table public.tasks enable row level security;

-- Migration registration.
insert into public._migrations(name) values ('0024_tasks')
  on conflict (name) do nothing;
