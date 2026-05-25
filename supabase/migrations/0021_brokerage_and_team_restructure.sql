-- 0021_brokerage_and_team_restructure.sql
--
-- Restructure: rename `organizations` to `teams` (a 10-member entity
-- with its own subscription, OR a child of a brokerage), and add
-- `brokerages` as a new top-level concept (custom-priced,
-- site-admin-managed, unlimited teams + agents).
--
-- Hierarchy:
--   Solo (no team, no brokerage)
--   Team (up to 10 members; standalone subscription)
--   Brokerage (unlimited; site-admin-allocated)
--     ├── Teams (each up to ~unlimited, brokerage-allocated)
--     │   └── Agents
--     └── Agents (direct, no team)
--
-- Per founder direction: existing organizations data is WIPED.
-- We're early enough in beta that no real data is in flight; the
-- only org rows were from yesterday's testing.

-- 1. Wipe existing organizations data (cascades to members + invites)
delete from public.organizations cascade;

-- 2. Drop the old reports column FIRST so we can drop the old
-- tables without FK conflicts
alter table public.reports drop column if exists organization_id;

-- 3. Drop old tables. cascade ensures any lingering FKs go too.
drop table if exists public.organization_invites cascade;
drop table if exists public.organization_members cascade;
drop table if exists public.organizations cascade;

-- ============================================================
-- 4. brokerages: top-level, custom-priced, site-admin-managed
-- ============================================================
create table public.brokerages (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text unique,
  dre_license              text,                  -- shown on PDF cover with logo
  logo_url                 text,
  brand_accent_hex         text,

  -- Site-admin-controlled allocation (per-brokerage contract).
  -- A team within the brokerage counts as ONE agent for the purpose
  -- of the seat limit (the brokerage decides how to slice up its
  -- allocation among teams + direct agents).
  agent_seat_limit         int not null default 100,
  reports_per_month        int not null default 100,
  per_report_overage_cents int not null default 2500,  -- $25/report default
  contract_notes           text,
  contact_email            text,

  status                   text not null default 'active'
                           check (status in ('active', 'paused', 'archived')),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index brokerages_status_idx on public.brokerages(status);

drop trigger if exists set_brokerages_updated_at on public.brokerages;
create trigger set_brokerages_updated_at
  before update on public.brokerages
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5. teams: mid-level. Either standalone (Team tier subscription)
--    or child of a brokerage.
-- ============================================================
create table public.teams (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text,

  -- Nullable: a team can stand alone (Team-tier subscription,
  -- capped at 10 members) or belong to a brokerage (unlimited
  -- members within the brokerage's allocation).
  brokerage_id     uuid references public.brokerages(id) on delete restrict,

  -- Branding. Team logo + accent override the brokerage logo +
  -- accent at PDF render time. Falls back to brokerage when null.
  logo_url         text,
  brand_accent_hex text,

  owner_user_id    uuid references public.profiles(id) on delete restrict not null,

  -- Only enforced for standalone teams (brokerage_id is null);
  -- brokerage teams inherit the brokerage's overall allocation.
  seat_limit       int not null default 10,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index teams_brokerage_idx on public.teams(brokerage_id);
create index teams_owner_idx on public.teams(owner_user_id);

drop trigger if exists set_teams_updated_at on public.teams;
create trigger set_teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

-- ============================================================
-- 6. team_members: one user per team max
-- ============================================================
create table public.team_members (
  team_id    uuid references public.teams(id) on delete cascade not null,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  role       text not null check (role in ('owner', 'admin', 'agent')),
  joined_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- One team per user (the founder rule). Loosen later if needed.
create unique index team_members_user_unique on public.team_members(user_id);
create index team_members_team_idx on public.team_members(team_id);

-- ============================================================
-- 7. team_invites: pending email invitations
-- ============================================================
create table public.team_invites (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid references public.teams(id) on delete cascade not null,
  email             text not null,
  role              text not null default 'agent' check (role in ('admin', 'agent')),
  invited_by        uuid references public.profiles(id) on delete set null,
  token             text not null unique,
  status            text not null default 'pending'
                    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at        timestamptz not null default (now() + interval '14 days'),
  created_at        timestamptz not null default now(),
  accepted_at       timestamptz
);

create index team_invites_team_idx on public.team_invites(team_id);
create index team_invites_token_idx on public.team_invites(token);
create unique index team_invites_pending_unique
  on public.team_invites(team_id, lower(email)) where status = 'pending';

-- ============================================================
-- 8. brokerage_admins: people who manage the brokerage
-- ============================================================
create table public.brokerage_admins (
  brokerage_id  uuid references public.brokerages(id) on delete cascade not null,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  role          text not null check (role in ('owner', 'admin')),
  joined_at     timestamptz not null default now(),
  primary key (brokerage_id, user_id)
);

create index brokerage_admins_user_idx on public.brokerage_admins(user_id);

-- ============================================================
-- 9. brokerage_agents: agents directly under a brokerage (no team)
-- ============================================================
create table public.brokerage_agents (
  brokerage_id  uuid references public.brokerages(id) on delete cascade not null,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  joined_at     timestamptz not null default now(),
  primary key (brokerage_id, user_id)
);

-- One direct-brokerage spot per user (still consistent with
-- one-team-per-user from team_members; a user is EITHER on a team
-- under a brokerage OR a direct agent of the brokerage, not both).
create unique index brokerage_agents_user_unique
  on public.brokerage_agents(user_id);

-- ============================================================
-- 10. brokerage_invites: pending email invitations
-- ============================================================
create table public.brokerage_invites (
  id                uuid primary key default gen_random_uuid(),
  brokerage_id      uuid references public.brokerages(id) on delete cascade not null,
  email             text not null,
  role              text not null default 'agent'
                    check (role in ('owner', 'admin', 'agent')),
  -- For 'agent' role, this can target placement on a specific team
  -- or as a direct brokerage agent. Null team_id = direct agent.
  team_id           uuid references public.teams(id) on delete set null,
  invited_by        uuid references public.profiles(id) on delete set null,
  token             text not null unique,
  status            text not null default 'pending'
                    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at        timestamptz not null default (now() + interval '14 days'),
  created_at        timestamptz not null default now(),
  accepted_at       timestamptz
);

create index brokerage_invites_brokerage_idx on public.brokerage_invites(brokerage_id);
create index brokerage_invites_token_idx on public.brokerage_invites(token);
create unique index brokerage_invites_pending_unique
  on public.brokerage_invites(brokerage_id, lower(email)) where status = 'pending';

-- ============================================================
-- 11. reports: stamp both brokerage_id and team_id at creation
-- ============================================================
alter table public.reports
  add column if not exists brokerage_id uuid
    references public.brokerages(id) on delete set null,
  add column if not exists team_id uuid
    references public.teams(id) on delete set null;

create index if not exists reports_brokerage_idx on public.reports(brokerage_id);
create index if not exists reports_team_idx on public.reports(team_id);

-- ============================================================
-- 12. RLS. Own-row policies only. Cross-row reads happen via
--     service-role inside the app routes, after the route verifies
--     the caller's authorization.
-- ============================================================
alter table public.brokerages enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.brokerage_admins enable row level security;
alter table public.brokerage_agents enable row level security;
alter table public.brokerage_invites enable row level security;

drop policy if exists "team_members_select_own" on public.team_members;
create policy "team_members_select_own"
  on public.team_members for select
  using (user_id = auth.uid());

drop policy if exists "brokerage_admins_select_own" on public.brokerage_admins;
create policy "brokerage_admins_select_own"
  on public.brokerage_admins for select
  using (user_id = auth.uid());

drop policy if exists "brokerage_agents_select_own" on public.brokerage_agents;
create policy "brokerage_agents_select_own"
  on public.brokerage_agents for select
  using (user_id = auth.uid());

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
  on public.teams for select
  using (
    id in (
      select team_id from public.team_members where user_id = auth.uid()
    )
  );

drop policy if exists "brokerages_select_member" on public.brokerages;
create policy "brokerages_select_member"
  on public.brokerages for select
  using (
    id in (
      select brokerage_id from public.brokerage_admins where user_id = auth.uid()
      union
      select brokerage_id from public.brokerage_agents where user_id = auth.uid()
    )
  );

-- Migration registration.
insert into public._migrations(name) values ('0021_brokerage_and_team_restructure')
  on conflict (name) do nothing;
