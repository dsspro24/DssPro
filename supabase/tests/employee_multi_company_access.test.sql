create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email)
values ('94000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'multi-company-employee@example.test');

insert into public.profiles (id, full_name, account_type)
values ('94000000-0000-4000-8000-000000000001', 'Multi Company Employee', 'employee')
on conflict (id) do update set account_type = excluded.account_type;

insert into public.organizations (id, name, created_by)
values
  ('94000000-0000-4000-8000-000000000010', 'Employee Company One', '94000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000020', 'Employee Company Two', '94000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000030', 'Unlinked Company', '94000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000040', 'Archived Employee Company', '94000000-0000-4000-8000-000000000001');

insert into public.organization_memberships (organization_id, user_id, role, employee_id)
values ('94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000001', 'employee', 'emp-multi-company-one');

insert into public.organization_employees (employee_id, organization_id, auth_user_id, full_name, email, status)
values
  ('emp-multi-company-one', '94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000001', 'Multi Company Employee', 'multi-company-employee@example.test', 'Aktyvus'),
  ('emp-multi-company-two', '94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000001', 'Multi Company Employee', 'multi-company-employee@example.test', 'Aktyvus'),
  ('emp-multi-company-archived', '94000000-0000-4000-8000-000000000040', '94000000-0000-4000-8000-000000000001', 'Multi Company Employee', 'multi-company-employee@example.test', 'Archyvuotas');

insert into public.employee_organization_access (organization_id, user_id, employee_id)
values
  ('94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000001', 'emp-multi-company-one'),
  ('94000000-0000-4000-8000-000000000020', '94000000-0000-4000-8000-000000000001', 'emp-multi-company-two'),
  ('94000000-0000-4000-8000-000000000040', '94000000-0000-4000-8000-000000000001', 'emp-multi-company-archived');

select plan(6);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);

select is(
  jsonb_array_length(public.get_employee_organizations()),
  2,
  'employee can see active organizations linked to the same account but not an archived assignment'
);
select lives_ok(
  $$select public.set_employee_organization('94000000-0000-4000-8000-000000000020')$$,
  'employee can switch to another linked organization'
);
select is(
  (select employee_id from public.organization_memberships where user_id = '94000000-0000-4000-8000-000000000001' and role = 'employee'),
  'emp-multi-company-two',
  'switching selects the employee record belonging to the chosen organization'
);
select is(
  (select count(*)::integer from public.organization_memberships where user_id = '94000000-0000-4000-8000-000000000001' and role = 'employee'),
  1,
  'only one employee organization is active for signing operations at a time'
);
select throws_ok(
  $$select public.set_employee_organization('94000000-0000-4000-8000-000000000030')$$,
  'P0001',
  'Employee does not have access to this organization',
  'employee cannot switch to an organization without an assignment'
);
select throws_ok(
  $$select public.set_employee_organization('94000000-0000-4000-8000-000000000040')$$,
  'P0001',
  'Employee does not have access to this organization',
  'archived employment cannot be selected as an active signing context'
);

select * from finish();
rollback;
