-- Adds a display_email column to public.profiles so the agent can
-- show a different email on their reports than the one they signed
-- up with.
--
--   display_email  text  — what appears on the PDF cover's "Prepared
--                          By" panel and in email reply-to headers
--                          when the agent sends through Veroax. NULL
--                          means "use the auth signup email."
--
-- Typical use case: an agent signs up with a personal Gmail but wants
-- their client-facing brokerage address on the reports.

alter table public.profiles
  add column if not exists display_email text;
