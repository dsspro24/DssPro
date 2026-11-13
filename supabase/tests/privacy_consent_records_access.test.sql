create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('99000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'privacy-owner@example.test', '{}'::jsonb),
  ('99000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'privacy-other@example.test', '{}'::jsonb);

insert into public.privacy_consent_records (
  id, user_id, consent_type, terms_version, privacy_policy_version,
  accepted, analytics, source
)
values
  (
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000001',
    'cookies', null, 'privacy-test', true, true, 'cookie_banner'
  ),
  (
    '99000000-0000-4000-8000-000000000012',
    '99000000-0000-4000-8000-000000000002',
    'cookies', null, 'privacy-test', true, false, 'cookie_banner'
  ),
  (
    '99000000-0000-4000-8000-000000000013',
    '99000000-0000-4000-8000-000000000001',
    'terms', 'terms-test', 'privacy-test', true, null, 'signup'
  );

select plan(4);

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$insert into public.privacy_consent_records (
      id, user_id, consent_type, privacy_policy_version, accepted, analytics, source
    ) values (
      '99000000-0000-4000-8000-000000000011',
      '99000000-0000-4000-8000-000000000001',
      'cookies', 'privacy-test', true, true, 'cookie_banner'
    )
    on conflict (id) do nothing$$,
  'an authenticated user can repeat their cookie-consent upsert'
);

select set_config(
  'test.privacy_own_cookie_count',
  (select count(*)::text from public.privacy_consent_records
   where user_id = '99000000-0000-4000-8000-000000000001'
     and consent_type = 'cookies'),
  true
);
select set_config(
  'test.privacy_other_cookie_count',
  (select count(*)::text from public.privacy_consent_records
   where user_id = '99000000-0000-4000-8000-000000000002'
     and consent_type = 'cookies'),
  true
);
select set_config(
  'test.privacy_own_terms_count',
  (select count(*)::text from public.privacy_consent_records
   where user_id = '99000000-0000-4000-8000-000000000001'
     and consent_type = 'terms'),
  true
);

reset role;

select is(current_setting('test.privacy_own_cookie_count')::integer, 1, 'a user can read their own cookie-consent record');
select is(current_setting('test.privacy_other_cookie_count')::integer, 0, 'a user cannot read another account cookie-consent record');
select is(current_setting('test.privacy_own_terms_count')::integer, 0, 'cookie access does not expose legal-acceptance records');

select * from finish();
rollback;
