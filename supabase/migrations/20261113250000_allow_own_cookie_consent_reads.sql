grant select on public.privacy_consent_records to authenticated;

drop policy if exists "Users can read their own cookie consent records"
  on public.privacy_consent_records;
create policy "Users can read their own cookie consent records"
  on public.privacy_consent_records for select to authenticated
  using (
    user_id = (select auth.uid())
    and consent_type = 'cookies'
  );
