-- Add listing-data columns to reports. Captured at upload time so the
-- analysis pipeline (and the PDF cover) can use list price, DOM, and
-- the canonical address from MLS/Zillow rather than what was extracted
-- from the disclosure documents.
--
-- listing_url  , MLS / Zillow / Redfin URL the user pasted
-- listing_text , raw MLS-printout text the user pasted (alternative)
-- listing_data , parsed structured fields (address, list_price, dom,
--                 status, …) populated by a future extraction step.
--                 jsonb so we can add fields without further migrations.

alter table public.reports
  add column if not exists listing_url  text,
  add column if not exists listing_text text,
  add column if not exists listing_data jsonb;
