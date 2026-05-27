-- 0028_listing_reconciliation.sql
--
-- Adds the columns the listing-data reconciliation step needs to
-- persist its output, plus the agent's source-of-truth override
-- when they decide to use a different source than the auto-default.
--
-- Background: California disclosure packages typically include a
-- static MLS print-out as one of the source PDFs. That print-out is
-- a snapshot from whenever the package was assembled (often weeks
-- before the agent runs the analysis), and listings get cancelled
-- and re-listed at different prices in the meantime. A recent run
-- shipped with the wrong price because the static MLS sheet showed
-- the old listing and the agent's Zillow URL showed the new one.
--
-- The reconciliation step compares three sources:
--   (a) MLS PDF in the disclosure package (historical reference)
--   (b) the agent-supplied Zillow / Redfin / Realtor.com / Compass URL
--   (c) a fresh live web search keyed on address + APN + prior MLS#s
--
-- Authority order: (c) overrides (b) overrides (a). The listing
-- print-out inside the package is treated as historical, never as
-- the current truth, because by definition it cannot be more
-- current than the package's assembly date.
--
-- Columns:
--   listing_reconciliation     audit trail of all three sources +
--                              the reconstructed relist ladder.
--                              Shaped as ListingReconciliation in
--                              lib/anthropic/listing-reconciliation.ts.
--   listing_source_choice      'live_search' | 'listing_url' | 'package_mls'
--                              The source whose price + MLS# is used
--                              as the report's headline. Defaults to
--                              whichever source the reconciliation
--                              recommended; agent can override via
--                              the report detail page.
--   listing_source_choice_at   When the agent (or the auto-default)
--                              picked the source.
--   listing_source_choice_by   Who picked. NULL when auto-defaulted,
--                              the agent's user_id when they
--                              overrode manually.

alter table public.reports
  add column if not exists listing_reconciliation jsonb,
  add column if not exists listing_source_choice text,
  add column if not exists listing_source_choice_at timestamptz,
  add column if not exists listing_source_choice_by uuid references public.profiles(id) on delete set null;

-- Constraint: source choice must be one of the three known sources
-- (or null). Reject typos at the DB level so a bad client write
-- can't pollute the audit trail.
alter table public.reports
  drop constraint if exists reports_listing_source_choice_check;
alter table public.reports
  add constraint reports_listing_source_choice_check
  check (
    listing_source_choice is null
    or listing_source_choice in ('live_search', 'listing_url', 'package_mls')
  );

-- Index for /admin queries that surface reports with unresolved
-- listing divergence (the agent-override workflow). Partial index
-- so it stays small; most reports won't have divergence at all.
create index if not exists reports_listing_reconciliation_divergence_idx
  on public.reports((listing_reconciliation->>'has_divergence'))
  where listing_reconciliation->>'has_divergence' = 'true';

-- Migration registration.
insert into public._migrations(name) values ('0028_listing_reconciliation')
  on conflict (name) do nothing;
