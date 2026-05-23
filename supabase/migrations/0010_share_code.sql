-- 0010_share_code.sql
--
-- Add a short, URL-safe public share code to reports so agents can hand
-- the buyer a link (e.g., https://www.veroax.com/r/8f3kx9d2) that
-- renders the report without a Veroax login. The code is generated
-- application-side when an analysis completes (or on demand from the
-- agent's dashboard), never derivable from the report id, and unique
-- across the table.
--
-- Privacy posture: the URL itself is the access control. The code is
-- long enough to be unguessable (12 alphanumeric chars = ~62 bits) and
-- the agent can rotate it from the dashboard if they want to revoke an
-- old link. Public pages set noindex/nofollow so search engines don't
-- crawl the codes.

alter table public.reports
  add column if not exists share_code text;

-- Unique index excludes nulls so existing reports without a code don't
-- collide. Lookup by code is O(log n) on the index.
create unique index if not exists reports_share_code_unique
  on public.reports(share_code)
  where share_code is not null;
