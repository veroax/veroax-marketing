-- Adds report-metadata columns to public.reports:
--
--   report_name    text   — Agent-chosen label for finding the report
--                          later (e.g., "Smith family · 945 Catkin · Final
--                          offer prep"). Never used as the property
--                          address; never appears as primary identity on
--                          the cover. Just a list-view label.
--   client_name    text   — Buyer client's name. Used in the "PREPARED
--                          FOR" panel on the report cover.
--   mls_file_path  text   — Storage path for an uploaded MLS-printout PDF,
--                          when the agent supplied one. Lives under
--                          disclosures/{user}/{report}/mls/<filename>.pdf.
--   original_files jsonb  — Snapshot of the files the user actually
--                          uploaded, captured at finalize time BEFORE
--                          our PDF splitter touched them. Structure:
--                            [{ name: text, pages: int, size_kb: int }, ...]
--                          This becomes the source of truth for the
--                          document inventory in the PDF — independent
--                          of whatever Claude reports during analysis.

alter table public.reports
  add column if not exists report_name    text,
  add column if not exists client_name    text,
  add column if not exists mls_file_path  text,
  add column if not exists original_files jsonb;
