-- 0031_finding_flags.sql
--
-- Per-finding flagging surface for agents. The dashboard report
-- page renders a small flag icon next to each finding card; the
-- agent clicks it, picks a category, optionally adds free-text
-- context, and the flag lands here. Admins triage flags via
-- /admin/finding-flags.
--
-- Why this exists: the Cowork SKILL.md feedback loop (see
-- docs/internal/COWORK_VEROAX_DIFF.md, item 4) is what gives
-- Cowork the high accuracy the founder wants Veroax to match. The
-- skill author can see what's wrong, line by line, and feed it
-- back into the prompt. Veroax had only a coarse "report an error
-- in this report" button. Per-finding granularity turns this into
-- a real feedback signal: which finding, what's wrong with it,
-- what should it have said instead.
--
-- Columns:
--   id                     uuid primary key
--   report_id              the report the finding belongs to
--   user_id                who flagged it (owning agent, admin, or
--                          team member with access)
--   finding_title          the finding's title at the time of the
--                          flag, captured as a free text so we
--                          still know what was flagged even if the
--                          report gets re-analyzed and the finding
--                          disappears
--   finding_severity       severity at flag time ("critical" /
--                          "high" / "moderate" / "cosmetic"). Same
--                          rationale as title: re-analysis can
--                          change the structure.
--   category               one of: 'inaccurate', 'not_applicable',
--                          'wrong_severity', 'missing_context',
--                          'scope_overreach', 'other'
--   note                   optional free-text explanation
--   status                 'open' (default), 'reviewed',
--                          'fixed_in_prompt', 'wont_fix'
--   admin_response         optional free-text admin reply
--   reviewed_at            null until admin marks reviewed
--   reviewed_by            admin user_id who reviewed
--   created_at             stamped on insert
--
-- RLS: agents can insert flags on their own reports and SEE their
-- own flags. Admins can see all flags. No update from agents.
--

create table if not exists public.finding_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  finding_title text not null,
  finding_severity text,
  category text not null check (
    category in (
      'inaccurate',
      'not_applicable',
      'wrong_severity',
      'missing_context',
      'scope_overreach',
      'other'
    )
  ),
  note text,
  status text not null default 'open' check (
    status in (
      'open',
      'reviewed',
      'fixed_in_prompt',
      'wont_fix'
    )
  ),
  admin_response text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists finding_flags_report_id_idx
  on public.finding_flags(report_id);

create index if not exists finding_flags_status_created_idx
  on public.finding_flags(status, created_at desc);

create index if not exists finding_flags_user_id_idx
  on public.finding_flags(user_id);

alter table public.finding_flags enable row level security;

-- Agents can see their own flags (the report owner) and can insert
-- flags on reports they own. They cannot update or delete; admins
-- handle triage.
drop policy if exists "finding_flags_select_own" on public.finding_flags;
create policy "finding_flags_select_own" on public.finding_flags
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.reports r
      where r.id = finding_flags.report_id
        and r.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "finding_flags_insert_own" on public.finding_flags;
create policy "finding_flags_insert_own" on public.finding_flags
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.reports r
      where r.id = finding_flags.report_id
        and r.user_id = auth.uid()
    )
  );

-- Admins only for updates (triage) and deletes (spam removal).
drop policy if exists "finding_flags_admin_update" on public.finding_flags;
create policy "finding_flags_admin_update" on public.finding_flags
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "finding_flags_admin_delete" on public.finding_flags;
create policy "finding_flags_admin_delete" on public.finding_flags
  for delete using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

insert into public._migrations(name) values ('0031_finding_flags')
  on conflict (name) do nothing;
