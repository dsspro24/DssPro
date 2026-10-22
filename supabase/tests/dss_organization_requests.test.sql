create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email)
values
  ('92000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'request-manager@example.test'),
  ('92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'request-specialist@example.test');

insert into public.profiles (id, full_name, account_type)
values
  ('92000000-0000-4000-8000-000000000001', 'Request Manager', 'manager'),
  ('92000000-0000-4000-8000-000000000002', 'Request Specialist', 'dss_specialist')
on conflict (id) do update
  set full_name = excluded.full_name, account_type = excluded.account_type;

insert into public.organizations (id, name, company_code, created_by)
values ('92000000-0000-4000-8000-000000000010', 'Request Test Company', '92000001', '92000000-0000-4000-8000-000000000001');

insert into public.organization_memberships (organization_id, user_id, role)
values ('92000000-0000-4000-8000-000000000010', '92000000-0000-4000-8000-000000000001', 'manager');

insert into public.organization_data (organization_id, data, updated_by)
values (
  '92000000-0000-4000-8000-000000000010',
  '{"organizations":[{"id":"92000000-0000-4000-8000-000000000010","name":"Request Test Company","dss":[]}],"specialists":[]}'::jsonb,
  '92000000-0000-4000-8000-000000000001'
);

select plan(8);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.search_organizations_for_dss('Request Test')),
  1,
  'DSS specialist can search for an organization by name'
);
select lives_ok(
  $$select public.request_dss_organization('92000000-0000-4000-8000-000000000010')$$,
  'DSS specialist can request access to an organization'
);
select is(
  (select status from public.dss_organization_requests where organization_id = '92000000-0000-4000-8000-000000000010'),
  'pending',
  'organization request remains pending until manager approval'
);
select is(
  (select count(*)::integer from public.organization_memberships where organization_id = '92000000-0000-4000-8000-000000000010' and user_id = '92000000-0000-4000-8000-000000000002'),
  0,
  'pending request does not grant organization access'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.respond_dss_organization_request((select id from public.dss_organization_requests where organization_id = '92000000-0000-4000-8000-000000000010'), true)$$,
  'organization manager can accept the DSS request'
);
select is(
  (select role from public.organization_memberships where organization_id = '92000000-0000-4000-8000-000000000010' and user_id = '92000000-0000-4000-8000-000000000002'),
  'dss_specialist',
  'acceptance grants DSS specialist membership'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.leave_dss_organization('92000000-0000-4000-8000-000000000010')$$,
  'DSS specialist can leave the organization'
);
select is(
  (select count(*)::integer from public.organization_memberships where organization_id = '92000000-0000-4000-8000-000000000010' and user_id = '92000000-0000-4000-8000-000000000002'),
  0,
  'leaving removes the DSS specialist membership'
);

select * from finish();
rollback;
