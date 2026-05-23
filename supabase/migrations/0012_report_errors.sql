-- 0012_report_errors.sql
--
-- "Report an error" feedback system on every report. Agents click a
-- link, fill a short form, we log a row. Admins review and grant
-- credits / refunds where warranted.
--
-- Two tables:
--   report_error_submissions — one row per submitted report
--   No additional table for admin review actions; those go through
--   the existing report_credit_ledger when an admin grants a credit.

create table if not exists public.report_error_submissions (
  id                 uuid primary key default gen_random_uuid(),
  -- Which report the error is about. Optional because the form can
  -- be reached from outside a specific report context (e.g., the
  -- public share view), but in practice always set.
  report_id          uuid references public.reports(id) on delete set null,
  -- The submitter — usually the report owner (auth-linked) but the
  -- public share view collects email + phone for anonymous submitters
  -- too. user_id is null for anonymous submissions.
  user_id            uuid references public.profiles(id) on delete set null,
  -- Contact info — always collected so we can follow up. Email is
  -- required; phone is optional.
  email              text not null,
  phone              text,
  -- Error category checkboxes — multi-select, jsonb array of
  -- canonical category keys (see the form for the canonical list).
  -- Examples: "irrelevant_findings", "missed_critical_finding",
  -- "wrong_unit", "incorrect_cost", "broken_links", "other".
  categories         jsonb not null default '[]'::jsonb,
  -- Free-form description from the submitter.
  message            text,
  -- Lifecycle:
  --   "open" — new submission, admin hasn't reviewed
  --   "acknowledged" — admin saw it but no action taken
  --   "credit_granted" — admin granted a refund credit
  --   "dismissed" — admin reviewed and chose no action
  status             text not null default 'open',
  -- When an admin grants a credit, this references the ledger row.
  credit_ledger_id   uuid references public.report_credit_ledger(id) on delete set null,
  -- Admin notes (internal, not shown to submitter).
  admin_notes        text,
  -- Audit trail.
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists report_error_submissions_created
  on public.report_error_submissions(created_at desc);
create index if not exists report_error_submissions_status
  on public.report_error_submissions(status);
create index if not exists report_error_submissions_report
  on public.report_error_submissions(report_id);
create index if not exists report_error_submissions_user
  on public.report_error_submissions(user_id);

-- RLS: report owners can see their own submissions; admins see
-- everything via service-role.
alter table public.report_error_submissions enable row level security;

drop policy if exists "error_submissions_select_own"
  on public.report_error_submissions;
create policy "error_submissions_select_own"
  on public.report_error_submissions for select
  using (auth.uid() = user_id);

-- Inserts go through the API route (service-role) so anonymous
-- public-form submissions work. No insert policy needed.

-- updated_at trigger.
drop trigger if exists set_report_error_submissions_updated_at
  on public.report_error_submissions;
create trigger set_report_error_submissions_updated_at
  before update on public.report_error_submissions
  for each row execute function public.set_updated_at();
