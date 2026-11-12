create table public.privacy_consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  consent_type text not null check (consent_type in ('terms', 'cookies')),
  terms_version text,
  privacy_policy_version text not null,
  accepted boolean not null default true,
  analytics boolean,
  source text not null check (source in ('signup', 'cookie_banner')),
  recorded_at timestamptz not null default now(),
  check (
    (consent_type = 'terms' and terms_version is not null and analytics is null and source = 'signup')
    or (consent_type = 'cookies' and terms_version is null and analytics is not null and source = 'cookie_banner')
  )
);

create index privacy_consent_records_user_time_idx
  on public.privacy_consent_records (user_id, recorded_at desc);

alter table public.privacy_consent_records enable row level security;
revoke all on public.privacy_consent_records from public, anon, authenticated;
grant insert on public.privacy_consent_records to authenticated;

create policy "Users can record their own cookie preferences"
  on public.privacy_consent_records for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and consent_type = 'cookies'
    and accepted
    and analytics is not null
    and source = 'cookie_banner'
  );

create or replace function public.record_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_type text := new.raw_user_meta_data ->> 'account_type';
  accepted_terms text := new.raw_user_meta_data ->> 'legal_terms_accepted';
  terms_version text := new.raw_user_meta_data ->> 'terms_version';
  privacy_version text := new.raw_user_meta_data ->> 'privacy_policy_version';
begin
  if account_type in ('manager', 'dss_specialist') then
    if accepted_terms is distinct from 'true'
      or nullif(btrim(terms_version), '') is null
      or nullif(btrim(privacy_version), '') is null then
      raise exception 'Acceptance of the current Terms of Service and Privacy Policy is required';
    end if;

    insert into public.privacy_consent_records (
      user_id, consent_type, terms_version, privacy_policy_version, accepted, source
    ) values (
      new.id, 'terms', terms_version, privacy_version, true, 'signup'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.record_signup_legal_acceptance() from public, anon, authenticated;

drop trigger if exists on_auth_user_record_legal_acceptance on auth.users;
create trigger on_auth_user_record_legal_acceptance
  after insert on auth.users
  for each row execute function public.record_signup_legal_acceptance();

create or replace function public.creator_list_privacy_consent_records()
returns table (
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
    select consent_record.id,
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
    order by consent_record.recorded_at desc
    limit 500;
end;
$$;

revoke all on function public.creator_list_privacy_consent_records() from public, anon;
grant execute on function public.creator_list_privacy_consent_records() to authenticated;
