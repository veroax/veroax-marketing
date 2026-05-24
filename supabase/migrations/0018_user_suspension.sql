-- 0018_user_suspension.sql
--
-- Admin suspension state on profiles. Suspension is reversible
-- (vs. delete, which is hard); a suspended user can NOT log in
-- (Supabase auth.users.banned_until is set) and any active Stripe
-- subscription is cancelled. When unsuspended, ban is cleared and
-- profile is reactivated; the user must self-resubscribe to Stripe
-- separately. Data is preserved across the suspend / unsuspend
-- cycle so a wrongful suspension is fully recoverable.

alter table public.profiles
  add column if not exists is_suspended  boolean not null default false,
  add column if not exists suspended_at  timestamptz,
  add column if not exists suspended_by  uuid references public.profiles(id) on delete set null,
  add column if not exists suspended_reason text;

create index if not exists profiles_is_suspended_idx
  on public.profiles(is_suspended)
  where is_suspended = true;

insert into public._migrations(name) values ('0018_user_suspension')
  on conflict (name) do nothing;
