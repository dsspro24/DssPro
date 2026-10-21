create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email)
values
  ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dss-manager-test@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dss-specialist-test@example.test');

insert into public.profiles (id, full_name, account_type)
values
  ('91000000-0000-4000-8000-000000000001', 'Test Manager', 'manager'),
  ('91000000-0000-4000-8000-000000000002', 'Test Specialist', 'dss_specialist')
on conflict (id) do update
  set full_name = excluded.full_name, account_type = excluded.account_type;

insert into public.organizations (id, name, created_by)
values
  ('91000000-0000-4000-8000-000000000010', 'Accepted invitation company', '91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000020', 'Declined invitation company', '91000000-0000-4000-8000-000000000001');

insert into public.organization_memberships (organization_id, user_id, role)
values
  ('91000000-0000-4000-8000-000000000010', '91000000-0000-4000-8000-000000000001', 'manager'),
  ('91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000001', 'manager');

insert into public.organization_data (organization_id, data, updated_by)
values
  (
    '91000000-0000-4000-8000-000000000010',
    '{"organizations":[{"id":"91000000-0000-4000-8000-000000000010","name":"Accepted invitation company","dss":[]}],"specialists":[],"signatures":[{"id":"dss-history-test-signature","role":"DSS specialistas","signer":"Test Specialist"}]}'::jsonb,
    '91000000-0000-4000-8000-000000000001'
  ),
  (
    '91000000-0000-4000-8000-000000000020',
    '{"organizations":[{"id":"91000000-0000-4000-8000-000000000020","name":"Declined invitation company","dss":[]}],"signatures":[]}'::jsonb,
    '91000000-0000-4000-8000-000000000001'
  );

insert into public.organization_employees (employee_id, organization_id, full_name, email)
values ('dss-history-test-employee', '91000000-0000-4000-8000-000000000010', 'Test Employee', 'employee@example.test');

insert into public.organization_documents (document_id, organization_id, title)
values ('dss-history-test-document', '91000000-0000-4000-8000-000000000010', 'Test document');

insert into public.document_signatures (
  signature_id, organization_id, employee_id, document_id, signer_user_id, signer_name, signer_role, signed_at
)
values (
  'dss-history-test-signature',
  '91000000-0000-4000-8000-000000000010',
  'dss-history-test-employee',
  'dss-history-test-document',
  '91000000-0000-4000-8000-000000000002',
  'Test Specialist',
  'DSS specialistas',
  now()
);

insert into public.dss_specialist_invitations (
  id, organization_id, organization_name, specialist_user_id, invited_email, invited_name, invited_by
)
values
  ('91000000-0000-4000-8000-000000000101', '91000000-0000-4000-8000-000000000010', 'Accepted invitation company', '91000000-0000-4000-8000-000000000002', 'dss-specialist-test@example.test', 'Test Specialist', '91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000102', '91000000-0000-4000-8000-000000000020', 'Declined invitation company', '91000000-0000-4000-8000-000000000002', 'dss-specialist-test@example.test', 'Test Specialist', '91000000-0000-4000-8000-000000000001');

select plan(16);

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.organization_memberships where organization_id = '91000000-0000-4000-8000-000000000010' and user_id = '91000000-0000-4000-8000-000000000002'),
  0,
  'a pending invitation does not grant organization membership'
);
select lives_ok(
  $$select public.respond_dss_specialist_invitation('91000000-0000-4000-8000-000000000101', true)$$,
  'the invited specialist can accept the invitation'
);
select is(
  (select status from public.dss_specialist_invitations where id = '91000000-0000-4000-8000-000000000101'),
  'accepted',
  'acceptance is recorded'
);
select is(
  (select count(*)::integer from public.organization_memberships where organization_id = '91000000-0000-4000-8000-000000000010' and user_id = '91000000-0000-4000-8000-000000000002' and role = 'dss_specialist'),
  1,
  'acceptance grants organization membership'
);
select ok(
  (select (organization.value -> 'dss') ? '91000000-0000-4000-8000-000000000002' from public.organization_data as workspace cross join lateral jsonb_array_elements(workspace.data -> 'organizations') as organization(value) where workspace.organization_id = '91000000-0000-4000-8000-000000000010'),
  'acceptance adds the specialist to the organization workspace'
);

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.revoke_dss_specialist('91000000-0000-4000-8000-000000000010', '91000000-0000-4000-8000-000000000002')$$,
  'the manager can revoke a DSS assignment'
);
select is(
  (select count(*)::integer from public.organization_memberships where organization_id = '91000000-0000-4000-8000-000000000010' and user_id = '91000000-0000-4000-8000-000000000002'),
  0,
  'revocation removes only the organization membership'
);
select is(
  (select status from public.dss_specialist_invitations where id = '91000000-0000-4000-8000-000000000101'),
  'revoked',
  'revocation is recorded'
);
select is(
  (select organization.value -> 'dss' from public.organization_data as workspace cross join lateral jsonb_array_elements(workspace.data -> 'organizations') as organization(value) where workspace.organization_id = '91000000-0000-4000-8000-000000000010'),
  '[]'::jsonb,
  'revocation removes the specialist from the organization access list'
);
select is(
  (select workspace.data -> 'signatures' from public.organization_data as workspace where workspace.organization_id = '91000000-0000-4000-8000-000000000010'),
  '[{"id":"dss-history-test-signature","role":"DSS specialistas","signer":"Test Specialist"}]'::jsonb,
  'revocation preserves signature history in the workspace'
);
select is(
  (select count(*)::integer from public.document_signatures where signature_id = 'dss-history-test-signature' and signer_user_id = '91000000-0000-4000-8000-000000000002'),
  1,
  'revocation preserves the normalized signature and signer identity'
);
select is(
  (select count(*)::integer from auth.users where id = '91000000-0000-4000-8000-000000000002'),
  1,
  'revocation does not delete the specialist account'
);

select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.respond_dss_specialist_invitation('91000000-0000-4000-8000-000000000102', false)$$,
  'the invited specialist can decline the invitation'
);
select is(
  (select status from public.dss_specialist_invitations where id = '91000000-0000-4000-8000-000000000102'),
  'declined',
  'decline is recorded'
);
select is(
  (select count(*)::integer from public.organization_memberships where organization_id = '91000000-0000-4000-8000-000000000020' and user_id = '91000000-0000-4000-8000-000000000002'),
  0,
  'declining does not grant organization membership'
);
select is(
  (select organization.value -> 'dss' from public.organization_data as workspace cross join lateral jsonb_array_elements(workspace.data -> 'organizations') as organization(value) where workspace.organization_id = '91000000-0000-4000-8000-000000000020'),
  '[]'::jsonb,
  'declining leaves the organization assignment list unchanged'
);
select * from finish();
rollback;
