-- 0032_public_finding_flags.sql
--
-- Allow flag submissions from the PUBLIC report view at /r/<code>.
-- Until now finding_flags required an authenticated user_id; this
-- meant a buyer (or even the agent reviewing their own share link
-- without logging in to a second tab) had no way to flag errors
-- on the report. The founder asked for per-finding flags in client
-- mode too.
--
-- Schema changes:
--   - user_id becomes nullable. A public anonymous flag has no
--     user_id; an agent-side flag from /dashboard still does. The
--     existing check constraints stay valid because no flag had
--     both empty user_id AND no other identification before this.
--   - is_public boolean stamps which surface the flag came from.
--     Default false so existing rows stay agent-attributed.
--   - submitter_name and submitter_email capture the anonymous
--     reporter's contact info when they choose to provide one.
--     Both nullable; the API route can decide whether to require
--     them per business rules.
--   - source check constraint: every row must EITHER have a
--     user_id (agent-side flag) OR be is_public = true (anonymous
--     flag). Both being true is fine, an authenticated agent
--     submitting via the public surface gets both fields.
--
-- RLS unchanged: agent-side select policies stay the same because
-- they key on user_id = auth.uid() or report ownership. The new
-- inserts come through a server-side API route at
-- /api/r/[code]/findings/flag using the service-role client, which
-- bypasses RLS, so we don't need a new insert policy for the
-- anonymous path.

alter table public.finding_flags
  alter column user_id drop not null;

alter table public.finding_flags
  add column if not exists is_public boolean not null default false;

alter table public.finding_flags
  add column if not exists submitter_name text;

alter table public.finding_flags
  add column if not exists submitter_email text;

-- Either an authenticated user submitted (user_id non-null) OR the
-- flag is_public (came through the public /r/<code> surface). Both
-- can be true; both cannot be false.
alter table public.finding_flags
  drop constraint if exists finding_flags_actor_required;
alter table public.finding_flags
  add constraint finding_flags_actor_required
    check ((user_id is not null) or (is_public = true));

create index if not exists finding_flags_is_public_idx
  on public.finding_flags(is_public, created_at desc)
  where is_public = true;

insert into public._migrations(name) values ('0032_public_finding_flags')
  on conflict (name) do nothing;
