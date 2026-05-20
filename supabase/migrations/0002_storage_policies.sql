-- Veroax — storage RLS policies
-- Run this AFTER 0001_initial_schema.sql.
-- Restricts each storage bucket so that users can only access files
-- under a folder matching their own auth.uid().
--
-- Path convention enforced by the app code:
--   disclosures/{user_id}/{report_id}/source.pdf
--   reports/{user_id}/{report_id}/final.pdf

-- ============================================================================
-- disclosures bucket
-- ============================================================================

drop policy if exists "disclosures_select_own" on storage.objects;
create policy "disclosures_select_own"
  on storage.objects for select
  using (
    bucket_id = 'disclosures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "disclosures_insert_own" on storage.objects;
create policy "disclosures_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'disclosures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "disclosures_delete_own" on storage.objects;
create policy "disclosures_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'disclosures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- reports bucket
-- ============================================================================

drop policy if exists "reports_select_own" on storage.objects;
create policy "reports_select_own"
  on storage.objects for select
  using (
    bucket_id = 'reports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Inserts to "reports" bucket happen server-side via the service_role
-- key (analysis worker writes the final PDF), so no client insert
-- policy is needed.
