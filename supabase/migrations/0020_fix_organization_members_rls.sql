-- 0020_fix_organization_members_rls.sql
--
-- The "members_select_same_org" policy from 0019 was recursive: its
-- USING clause subqueried the same organization_members table that
-- the policy was guarding. PostgreSQL returns empty for that style
-- of self-referential RLS subquery as a safety measure, which broke
-- the team-management UI. Symptom: an agent created a team and was
-- inserted as the owner via service-role, but when /dashboard/team
-- tried to read their own membership row through the RLS-aware
-- client, the policy returned nothing, the page treated them as
-- not-in-a-team, and showed the empty "Create your team" form
-- again. Resubmitting hit the unique-index error.
--
-- Fix: replace the recursive policy with a simple "you can see
-- your own row" policy. Cross-member visibility (listing OTHER
-- members of the same org) is handled by the page itself via the
-- service-role client AFTER verifying the caller is in the org
-- through their own row. Same pattern as /dashboard/team/reports.

drop policy if exists "members_select_same_org"
  on public.organization_members;

create policy "members_select_own"
  on public.organization_members for select
  using (user_id = auth.uid());

insert into public._migrations(name) values ('0020_fix_organization_members_rls')
  on conflict (name) do nothing;
