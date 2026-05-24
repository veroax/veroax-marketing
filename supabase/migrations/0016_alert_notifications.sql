-- 0016_alert_notifications.sql
--
-- Persistent record of alert emails sent by the system. Drives:
--   1. Deduplication (don't re-fire the same alert too often)
--   2. State transitions (ok→fail vs. fail→ok)
--   3. The /admin/alerts admin page so the founder can audit
--      what they were notified about and when.
--
-- The table is metadata, not user data. RLS enabled with no
-- policies; the alerting library uses the service-role client.

create table if not exists public.alert_notifications (
  id          uuid primary key default gen_random_uuid(),
  -- Stable identifier for the alert source. Examples:
  --   'synthetic.anthropic.fail'  'synthetic.storage.fail'
  --   'sweep.batch_failures'      'manual.test_alert'
  -- Use this for dedup lookups.
  alert_key   text not null,
  -- 'critical' | 'warning' | 'info'. Determines the email subject
  -- prefix the founder sees, and (potentially) future routing.
  severity    text not null default 'warning',
  -- 'firing' = something broke. 'recovered' = previously-firing
  -- alert is now healthy again. Recovery emails are notable but
  -- not scary.
  status      text not null default 'firing',
  -- The actual subject + body we sent, so the audit row is the
  -- single source of truth for "what did they see in their inbox?"
  subject     text not null,
  body        text not null,
  -- Comma-separated recipient list at send time.
  sent_to     text not null,
  sent_at     timestamptz not null default now(),
  -- Free-form per-alert payload (which service, which report,
  -- error message excerpt, etc).
  metadata    jsonb not null default '{}'::jsonb
);

create index if not exists alert_notifications_key_sent
  on public.alert_notifications(alert_key, sent_at desc);
create index if not exists alert_notifications_sent_at
  on public.alert_notifications(sent_at desc);

alter table public.alert_notifications enable row level security;

insert into public._migrations(name) values ('0016_alert_notifications')
  on conflict (name) do nothing;
