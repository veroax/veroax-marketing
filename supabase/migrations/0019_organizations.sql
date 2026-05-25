-- 0019_organizations.sql
--
-- Team management for the Brokerage tier. Introduces three tables:
--
--   organizations         The team / brokerage entity. One row per
--                         team. Owner has full control.
--   organization_members  Membership of a user in an org. One row
--                         per (user_id, organization_id) pair. Role
--                         is owner | admin | agent. A unique index
--                         on user_id enforces one-org-per-user for
--                         the MVP; multi-org membership is a future
--                         feature.
--   organization_invites  Pending email invitations. Random token
--                         in the email link. Status tracks pending
--                         / accepted / expired / revoked so admins
--                         can audit who was invited.
--
-- Also adds reports.organization_id so new reports get attributed
-- to the creator's team. Existing reports stay personal (column
-- nullable; defaults to null on legacy rows).
--
-- RLS: enabled on all three new tables. Members can read their own
-- org and other members' rows. Only owners + admins can write to
-- invites and members. Service-role (used by /api/team/*) bypasses
-- RLS as expected.

create table if not exists public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text unique,
  owner_user_id    uuid references public.profiles(id) on delete restrict not null,
  plan_tier        text,
  seat_limit       int not null default 25,
  -- Org-level branding for the white-label PDF (defaults to owner's
  -- branding when unset). Wired in a follow-up commit; the columns
  -- exist now so the schema is forward-compatible.
  brokerage_logo_url text,
  brokerage_dre    text,
  brand_accent_hex text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists organizations_owner_idx
  on public.organizations(owner_user_id);

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table if not exists public.organization_members (
  organization_id  uuid references public.organizations(id) on delete cascade not null,
  user_id          uuid references public.profiles(id) on delete cascade not null,
  role             text not null check (role in ('owner', 'admin', 'agent')),
  joined_at        timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- One-org-per-user enforced at the schema level for MVP. Loosen this
-- later when we add multi-org support.
create unique index if not exists organization_members_user_unique
  on public.organization_members(user_id);

create index if not exists organization_members_org_idx
  on public.organization_members(organization_id);

create table if not exists public.organization_invites (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade not null,
  email            text not null,
  role             text not null default 'agent' check (role in ('admin', 'agent')),
  invited_by       uuid references public.profiles(id) on delete set null,
  token            text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at       timestamptz not null default (now() + interval '14 days'),
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz
);

create index if not exists organization_invites_org_idx
  on public.organization_invites(organization_id);

create index if not exists organization_invites_token_idx
  on public.organization_invites(token);

-- Partial unique index: at most one PENDING invite per (org, email).
-- Re-inviting an accepted / revoked / expired address is fine.
create unique index if not exists organization_invites_pending_unique
  on public.organization_invites(organization_id, lower(email))
  where status = 'pending';

-- reports.organization_id: new reports created by team members get
-- attributed to the org. Nullable so legacy reports stay personal.
alter table public.reports
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists reports_organization_id_idx
  on public.reports(organization_id);

-- RLS ----------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;

-- organizations: a user can read any org they're a member of. They
-- can update / delete only if they're the owner. Inserts happen via
-- the service-role client (/api/team/create) so no insert policy
-- needed at the user level.
drop policy if exists "org_select_membership" on public.organizations;
create policy "org_select_membership"
  on public.organizations for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists "org_update_owner" on public.organizations;
create policy "org_update_owner"
  on public.organizations for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- organization_members: a user can read members of any org they
-- belong to. Inserts / updates / deletes through service-role.
drop policy if exists "members_select_same_org" on public.organization_members;
create policy "members_select_same_org"
  on public.organization_members for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

-- organization_invites: only the inviting org's owner / admins can
-- see them (so an agent can't enumerate the team's pending invites).
-- The token-based accept flow uses service-role and matches on token
-- separately, so this is fine.
drop policy if exists "invites_select_owners" on public.organization_invites;
create policy "invites_select_owners"
  on public.organization_invites for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Migration registration.
insert into public._migrations(name) values ('0019_organizations')
  on conflict (name) do nothing;
