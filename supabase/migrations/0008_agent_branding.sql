-- Agent branding + extended public details on the report.
--
-- All new columns are nullable; reports continue to render correctly
-- when an agent has none of them set (everything falls back to the
-- Veroax defaults). Logos and headshots live in a new public Storage
-- bucket so React-PDF's <Image> can fetch them at render time.
--
-- Columns added to public.profiles:
--
--   brokerage_logo_url  text, public URL for the brokerage's logo.
--                              Rendered prominently on the PDF cover
--                              and again in the page footer.
--
--   headshot_url        text, public URL for the agent's headshot.
--                              36×36pt thumbnail in the cover's
--                              "Prepared By" panel.
--
--   brand_accent_hex    text, six-char hex (e.g. '#0F766E') that
--                              REPLACES the Veroax gold #C9A84C on
--                              the cover accent bar, eyebrow text,
--                              and "Prepared By" label. Null = use
--                              the gold default. We only store the
--                              hex, never a theme name, the picker
--                              is purely a UI helper.
--
--   tagline             text, short subtitle under the agent's name
--                              on the cover (e.g. "Bay Area Buyer's
--                              Agent · 15 years").
--
--   website_url         text, agent's site, rendered in the page
--                              footer and as a link in HTML emails.
--
--   scheduling_url      text, Calendly/Cal.com style URL. Surfaces
--                              as "Schedule a call: …" in the seeded
--                              client email body when set.
--
--   office_address      text, multi-line address, rendered in the
--                              page footer beneath the DRE row.
--
--   email_signature     text, when set, REPLACES the auto-generated
--                              agent signature in the seeded client
--                              email. The PDF cover always uses the
--                              structured Name/Brokerage/DRE fields;
--                              only the EMAIL signature is overridable.

alter table public.profiles
  add column if not exists brokerage_logo_url  text,
  add column if not exists headshot_url        text,
  add column if not exists brand_accent_hex    text,
  add column if not exists tagline             text,
  add column if not exists website_url         text,
  add column if not exists scheduling_url      text,
  add column if not exists office_address      text,
  add column if not exists email_signature     text;

-- ============================================================================
-- branding bucket
-- ============================================================================
-- Public bucket because React-PDF's <Image> fetches via plain HTTPS
-- during server-side render. Logos + headshots are not sensitive;
-- the URL is hard to guess (UUID-based folder) and serves the same
-- role as any agent's website logo.
--
-- Path convention:
--   branding/{user_id}/brokerage_logo.{ext}
--   branding/{user_id}/headshot.{ext}

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update
  set public = excluded.public;

-- Anyone can READ, needed for React-PDF and for the dashboard preview.
drop policy if exists "branding_select_public" on storage.objects;
create policy "branding_select_public"
  on storage.objects for select
  using (bucket_id = 'branding');

-- Only the owning agent can INSERT into their own folder.
drop policy if exists "branding_insert_own" on storage.objects;
create policy "branding_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'branding'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Only the owning agent can UPDATE (re-upload overwrites).
drop policy if exists "branding_update_own" on storage.objects;
create policy "branding_update_own"
  on storage.objects for update
  using (
    bucket_id = 'branding'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'branding'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Only the owning agent can DELETE.
drop policy if exists "branding_delete_own" on storage.objects;
create policy "branding_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'branding'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
