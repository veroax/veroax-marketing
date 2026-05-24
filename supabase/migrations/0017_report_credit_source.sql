-- 0017_report_credit_source.sql
--
-- Record which credit pool paid for each analyzed report so we can
-- differentiate PDF rendering (full-branded vs. stripped-down) per
-- the pricing-ladder strategy.
--
-- Values written by lib/billing/credits.ts consumeReportCredit():
--   'subscription' -> subscriber consumed an included monthly report
--   'oneoff'       -> pay-as-you-go ($69) purchase
--   'trial'        -> free trial credit (also flips reports.watermarked)
--   'vip'          -> admin-granted VIP bypass
--   null           -> legacy rows that pre-date this column
--
-- The PDF renderer reads this in a follow-up commit to gate the
-- branded chrome (subscription -> full agent branding; oneoff ->
-- minimal Veroax-cobranded cover). For now, only the data captures.

alter table public.reports
  add column if not exists credit_source text;

create index if not exists reports_credit_source_idx
  on public.reports(credit_source);

insert into public._migrations(name) values ('0017_report_credit_source')
  on conflict (name) do nothing;
