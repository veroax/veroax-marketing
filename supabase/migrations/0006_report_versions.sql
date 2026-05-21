-- Report versioning + email drafts.
--
-- Versioning: when an agent adds documents to an existing report,
-- the report is re-analyzed on the full combined package. The
-- previous report state is snapshotted into reports.versions[]
-- BEFORE the re-analysis runs, so the agent can still download an
-- older copy (with an explicit affirmation that they understand
-- it isn't the latest).
--
-- Pricing rule (enforced in the /update route, not here):
--   * Updates within 30 days of reports.created_at are FREE.
--   * Outside that window, the update consumes a report credit,
--     same as creating a brand-new report.
--
--   versions         jsonb default '[]' — append-only history.
--                    Each entry is a snapshot taken right before
--                    a re-analysis kicks off:
--                      {
--                        version_number: int (starts at 1),
--                        snapshotted_at: timestamptz,
--                        report_data,
--                        original_files,
--                        source_file_path,
--                        status,
--                        pdf_blob_path: text | null  (reserved for
--                          future pre-rendered PDF storage; null for
--                          now — the PDF route re-renders from the
--                          snapshot when needed.)
--                      }
--
--   last_updated_at  timestamptz — most recent update; NULL for
--                    reports that were never updated.
--
--   update_count     int default 0 — running counter of updates
--                    applied. Drives the next version_number.

alter table public.reports
  add column if not exists versions         jsonb not null default '[]'::jsonb,
  add column if not exists last_updated_at  timestamptz,
  add column if not exists update_count     int    not null default 0;

-- ---------------------------------------------------------------------
-- email_drafts
-- ---------------------------------------------------------------------
-- One row per email the agent drafts from the report page. We log
-- both 'mailto' opens (the agent's own email client sends the
-- message; we never see the actual send) and 'resend' sends (we
-- deliver through the Resend API with the PDF attached). The row is
-- inserted at draft time and updated with sent_at/sent_via when the
-- agent confirms send.

create table if not exists public.email_drafts (
  id              uuid        primary key default gen_random_uuid(),
  report_id       uuid        not null references public.reports(id) on delete cascade,
  user_id         uuid        not null references auth.users(id)     on delete cascade,
  recipient_email text        not null,
  subject         text        not null,
  body            text        not null,
  sent_at         timestamptz,
  sent_via        text check (sent_via in ('mailto','resend')),
  created_at      timestamptz not null default now()
);

create index if not exists email_drafts_report_idx on public.email_drafts(report_id);
create index if not exists email_drafts_user_idx   on public.email_drafts(user_id);

alter table public.email_drafts enable row level security;

drop policy if exists "email_drafts_select_own" on public.email_drafts;
create policy "email_drafts_select_own"
  on public.email_drafts for select
  using (auth.uid() = user_id);

drop policy if exists "email_drafts_insert_own" on public.email_drafts;
create policy "email_drafts_insert_own"
  on public.email_drafts for insert
  with check (auth.uid() = user_id);

drop policy if exists "email_drafts_update_own" on public.email_drafts;
create policy "email_drafts_update_own"
  on public.email_drafts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
