drop function public.creator_list_privacy_consent_records();

create index privacy_consent_records_recorded_at_id_idx
  on public.privacy_consent_records (recorded_at desc, id desc);

create function public.creator_list_privacy_consent_records(
  input_page_size integer default 20,
  input_page_offset integer default 0
)
returns table (
  total_count bigint,
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  consent_type text,
  terms_version text,
  privacy_policy_version text,
  accepted boolean,
  analytics boolean,
  source text,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  return query
    select count(*) over (),
      consent_record.id,
      consent_record.user_id,
      account.email::text,
      profile.full_name,
      consent_record.consent_type,
      consent_record.terms_version,
      consent_record.privacy_policy_version,
      consent_record.accepted,
      consent_record.analytics,
      consent_record.source,
      consent_record.recorded_at
    from public.privacy_consent_records as consent_record
    left join auth.users as account on account.id = consent_record.user_id
    left join public.profiles as profile on profile.id = consent_record.user_id
    order by consent_record.recorded_at desc, consent_record.id desc
    limit least(greatest(coalesce(input_page_size, 20), 1), 100)
    offset greatest(coalesce(input_page_offset, 0), 0);
end;
$$;

revoke all on function public.creator_list_privacy_consent_records(integer, integer) from public, anon;
grant execute on function public.creator_list_privacy_consent_records(integer, integer) to authenticated;

notify pgrst, 'reload schema';
