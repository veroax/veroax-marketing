-- 0013_vip_and_admin_grants.sql
--
-- Two related additions to profiles:
--
-- 1. is_vip — flag for users who get FREE access to everything.
--    VIPs bypass the credit gate on report creation entirely.
--    Their reports are NEVER watermarked. The billing dashboard
--    shows "VIP — free access" instead of credit pools.
--    Useful for the founder's friends, pilot agents, brokerage
--    decision-makers we're courting, and customer-support comps.
--
-- 2. vip_granted_at / vip_granted_by / vip_notes — audit trail so
--    the founder can see WHO marked WHOM as VIP and why. Same
--    shape we use for admin role grants in audit_log.

alter table public.profiles
  add column if not exists is_vip boolean not null default false,
  add column if not exists vip_granted_at timestamptz,
  add column if not exists vip_granted_by uuid references public.profiles(id) on delete set null,
  add column if not exists vip_notes text;

create index if not exists profiles_is_vip_idx
  on public.profiles(is_vip)
  where is_vip = true;
