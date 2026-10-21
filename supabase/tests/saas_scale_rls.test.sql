create extension if not exists pgtap with schema extensions;

begin;

create temporary table load_test_context on commit drop as
select gen_random_uuid() as run_id;

create temporary table load_test_organizations (
  org_number integer primary key,
  organization_id uuid not null unique
) on commit drop;

insert into load_test_organizations (org_number, organization_id)
select series.org_number,
       md5(context.run_id::text || ':org:' || series.org_number::text)::uuid
from load_test_context as context
cross join generate_series(1, 100) as series(org_number);

create temporary table load_test_users (
  role_name text primary key,
  user_id uuid not null unique
) on commit drop;

insert into load_test_users (role_name, user_id)
values
  ('manager_one', gen_random_uuid()),
  ('manager_two', gen_random_uuid()),
  ('specialist_one', gen_random_uuid()),
  ('employee_one', gen_random_uuid()),
  ('employee_two', gen_random_uuid());

insert into auth.users (id, aud, role, email, raw_user_meta_data)
select user_id, 'authenticated', 'authenticated',
       'load-' || role_name || '-' || user_id::text || '@example.test',
       jsonb_build_object(
         'full_name', 'Load test ' || role_name,
         'account_type', case
           when role_name like 'manager%' then 'manager'
           when role_name like 'specialist%' then 'dss_specialist'
           else 'employee'
         end
       )
from load_test_users;

insert into public.organizations (id, name, created_by)
select organization.organization_id,
       'Load test organization ' || organization.org_number,
       (select user_id from load_test_users where role_name = 'manager_one')
from load_test_organizations as organization;

insert into public.organization_employees (
  employee_id, organization_id, full_name, email
)
select context.run_id::text || ':employee:' || organization.org_number || ':' || employee.employee_number,
       organization.organization_id,
       'Load test employee',
       context.run_id::text || '-' || organization.org_number || '-' || employee.employee_number || '@example.test'
from load_test_context as context
cross join load_test_organizations as organization
cross join generate_series(1, 50) as employee(employee_number);

insert into public.organization_documents (document_id, organization_id, title)
select context.run_id::text || ':document:' || organization.org_number,
       organization.organization_id,
       'Load test document'
from load_test_context as context
cross join load_test_organizations as organization;

insert into public.organization_memberships (organization_id, user_id, role, employee_id)
select organization.organization_id, test_user.user_id, test_user.role, test_user.employee_id
from (
  select 1 as org_number, user_id, 'manager'::text as role, null::text as employee_id
  from load_test_users where role_name = 'manager_one'
  union all
  select 2, user_id, 'manager', null::text
  from load_test_users where role_name = 'manager_two'
  union all
  select 1, user_id, 'dss_specialist', null::text
  from load_test_users where role_name = 'specialist_one'
  union all
  select 1, user_id, 'employee',
         (select context.run_id::text || ':employee:1:1' from load_test_context as context)
  from load_test_users where role_name = 'employee_one'
  union all
  select 1, user_id, 'employee',
         (select context.run_id::text || ':employee:1:2' from load_test_context as context)
  from load_test_users where role_name = 'employee_two'
) as test_user
join load_test_organizations as organization using (org_number);

insert into public.document_signatures (
  signature_id, organization_id, employee_id, document_id,
  signer_name, signer_role, signed_at
)
select context.run_id::text || ':signature:' || organization.org_number || ':' ||
       employee.employee_number || ':' || signature.signature_number,
       organization.organization_id,
       context.run_id::text || ':employee:' || organization.org_number || ':' || employee.employee_number,
       context.run_id::text || ':document:' || organization.org_number,
       'Load test signer',
       'Darbuotojas',
       now() - make_interval(mins => signature.signature_number)
from load_test_context as context
cross join load_test_organizations as organization
cross join generate_series(1, 50) as employee(employee_number)
cross join generate_series(1, 20) as signature(signature_number);

insert into public.organization_data (organization_id, data, updated_by)
select organization.organization_id,
       jsonb_build_object(
         'organizations', jsonb_build_array(jsonb_build_object('id', organization.organization_id::text)),
         'resources', jsonb_build_array(jsonb_build_object('payload', repeat('x', 1000)))
       ),
       (select user_id from load_test_users where role_name = 'manager_one')
from load_test_organizations as organization
where organization.org_number in (1, 2);

select set_config('test.load_org_one', (select organization_id::text from load_test_organizations where org_number = 1), true);
select set_config('test.load_org_two', (select organization_id::text from load_test_organizations where org_number = 2), true);
select set_config('test.load_employee_one', (select context.run_id::text || ':employee:1:1' from load_test_context as context), true);
select set_config('test.load_employee_two', (select context.run_id::text || ':employee:1:2' from load_test_context as context), true);
select set_config('test.load_manager_one_uid', (select user_id::text from load_test_users where role_name = 'manager_one'), true);
select set_config('test.load_manager_two_uid', (select user_id::text from load_test_users where role_name = 'manager_two'), true);
select set_config('test.load_specialist_one_uid', (select user_id::text from load_test_users where role_name = 'specialist_one'), true);
select set_config('test.load_employee_one_uid', (select user_id::text from load_test_users where role_name = 'employee_one'), true);
select set_config('test.load_employee_two_uid', (select user_id::text from load_test_users where role_name = 'employee_two'), true);

select plan(16);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.load_manager_one_uid'), true);
select set_config('test.load_manager_started', clock_timestamp()::text, true);
select set_config('test.load_manager_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_one')::uuid
), true);
select set_config('test.load_manager_finished', clock_timestamp()::text, true);
select set_config('test.load_manager_other_tenant_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_two')::uuid
), true);
select set_config('test.load_manager_employees', (
  select count(*)::text from public.organization_employees
  where organization_id = current_setting('test.load_org_one')::uuid
), true);
select set_config('test.load_manager_other_tenant_employees', (
  select count(*)::text from public.organization_employees
  where organization_id = current_setting('test.load_org_two')::uuid
), true);
select set_config('test.load_manager_workspace_has_resources', (
  select (public.get_organization_workspace_metadata(current_setting('test.load_org_one')::uuid) ? 'resources')::text
), true);
select set_config('test.load_manager_other_workspace', coalesce(
  public.get_organization_workspace_metadata(current_setting('test.load_org_two')::uuid)::text,
  'null'
), true);

select set_config('request.jwt.claim.sub', current_setting('test.load_manager_two_uid'), true);
select set_config('test.load_other_manager_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_two')::uuid
), true);
select set_config('test.load_other_manager_foreign_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_one')::uuid
), true);

select set_config('request.jwt.claim.sub', current_setting('test.load_specialist_one_uid'), true);
select set_config('test.load_specialist_started', clock_timestamp()::text, true);
select set_config('test.load_specialist_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_one')::uuid
), true);
select set_config('test.load_specialist_finished', clock_timestamp()::text, true);
select set_config('test.load_specialist_other_tenant_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_two')::uuid
), true);
select set_config('test.load_specialist_workspace_has_resources', (
  select (public.get_organization_workspace_metadata(current_setting('test.load_org_one')::uuid) ? 'resources')::text
), true);

select set_config('request.jwt.claim.sub', current_setting('test.load_employee_one_uid'), true);
select set_config('test.load_employee_started', clock_timestamp()::text, true);
select set_config('test.load_employee_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_one')::uuid
), true);
select set_config('test.load_employee_finished', clock_timestamp()::text, true);
select set_config('test.load_employee_other_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_one')::uuid
    and employee_id = current_setting('test.load_employee_two')
), true);
select set_config('test.load_employee_other_tenant_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_two')::uuid
), true);
select set_config('test.load_employee_rows', (
  select count(*)::text from public.organization_employees
  where organization_id = current_setting('test.load_org_one')::uuid
), true);

select set_config('request.jwt.claim.sub', current_setting('test.load_employee_two_uid'), true);
select set_config('test.load_second_employee_signatures', (
  select count(*)::text from public.document_signatures
  where organization_id = current_setting('test.load_org_one')::uuid
), true);

reset role;

select is(current_setting('test.load_manager_signatures')::integer, 1000, 'a manager can read all signatures in their organization');
select is(current_setting('test.load_manager_other_tenant_signatures')::integer, 0, 'a manager cannot read another organization signatures');
select is(current_setting('test.load_manager_employees')::integer, 50, 'a manager can read all organization employees');
select is(current_setting('test.load_manager_other_tenant_employees')::integer, 0, 'a manager cannot read another organization employees');
select is(current_setting('test.load_manager_workspace_has_resources'), 'false', 'workspace metadata excludes the resources JSON field');
select is(current_setting('test.load_manager_other_workspace'), 'null', 'workspace metadata RPC hides another organization workspace');
select is(current_setting('test.load_other_manager_signatures')::integer, 1000, 'a second manager can read their own organization signatures');
select is(current_setting('test.load_other_manager_foreign_signatures')::integer, 0, 'a second manager cannot read the first organization signatures');
select is(current_setting('test.load_specialist_signatures')::integer, 1000, 'an assigned DSS specialist can read their organization signatures');
select is(current_setting('test.load_specialist_other_tenant_signatures')::integer, 0, 'an assigned DSS specialist cannot read another organization signatures');
select is(current_setting('test.load_specialist_workspace_has_resources'), 'false', 'DSS workspace metadata excludes the resources JSON field');
select is(current_setting('test.load_employee_signatures')::integer, 20, 'an employee can read only their own signatures');
select is(current_setting('test.load_employee_other_signatures')::integer, 0, 'an employee cannot read another employee signatures');
select is(current_setting('test.load_employee_other_tenant_signatures')::integer, 0, 'an employee cannot read signatures from another organization');
select is(current_setting('test.load_employee_rows')::integer, 1, 'an employee can read only their own employee row');
select is(current_setting('test.load_second_employee_signatures')::integer, 20, 'a second employee can read their own signatures');

select diag(format(
  '100,000 synthetic signatures; manager RLS count took %s ms',
  round(extract(epoch from (
    current_setting('test.load_manager_finished')::timestamptz
    - current_setting('test.load_manager_started')::timestamptz
  )) * 1000, 2)::text
));
select diag(format(
  '100,000 synthetic signatures; DSS RLS count took %s ms',
  round(extract(epoch from (
    current_setting('test.load_specialist_finished')::timestamptz
    - current_setting('test.load_specialist_started')::timestamptz
  )) * 1000, 2)::text
));
select diag(format(
  '100,000 synthetic signatures; employee RLS count took %s ms',
  round(extract(epoch from (
    current_setting('test.load_employee_finished')::timestamptz
    - current_setting('test.load_employee_started')::timestamptz
  )) * 1000, 2)::text
));

select * from finish();

do $$
begin
  if current_setting('test.load_manager_signatures')::integer <> 1000
    or current_setting('test.load_manager_other_tenant_signatures')::integer <> 0
    or current_setting('test.load_manager_employees')::integer <> 50
    or current_setting('test.load_manager_other_tenant_employees')::integer <> 0
    or current_setting('test.load_manager_workspace_has_resources') <> 'false'
    or current_setting('test.load_manager_other_workspace') <> 'null'
    or current_setting('test.load_other_manager_signatures')::integer <> 1000
    or current_setting('test.load_other_manager_foreign_signatures')::integer <> 0
    or current_setting('test.load_specialist_signatures')::integer <> 1000
    or current_setting('test.load_specialist_other_tenant_signatures')::integer <> 0
    or current_setting('test.load_specialist_workspace_has_resources') <> 'false'
    or current_setting('test.load_employee_signatures')::integer <> 20
    or current_setting('test.load_employee_other_signatures')::integer <> 0
    or current_setting('test.load_employee_other_tenant_signatures')::integer <> 0
    or current_setting('test.load_employee_rows')::integer <> 1
    or current_setting('test.load_second_employee_signatures')::integer <> 20
  then
    raise exception 'SaaS scale/RLS assertion failed';
  end if;
end;
$$;

select jsonb_build_object(
  'synthetic_signatures', (
    select count(*)
    from public.document_signatures as signature
    cross join load_test_context as context
    where signature.signature_id like context.run_id::text || ':signature:%'
  ),
  'organization_count', (select count(*) from load_test_organizations),
  'employee_count', (
    select count(*)
    from public.organization_employees as employee
    cross join load_test_context as context
    where employee.employee_id like context.run_id::text || ':employee:%'
  ),
  'manager_signature_count_ms', round(extract(epoch from (
    current_setting('test.load_manager_finished')::timestamptz
    - current_setting('test.load_manager_started')::timestamptz
  )) * 1000, 2),
  'specialist_signature_count_ms', round(extract(epoch from (
    current_setting('test.load_specialist_finished')::timestamptz
    - current_setting('test.load_specialist_started')::timestamptz
  )) * 1000, 2),
  'employee_signature_count_ms', round(extract(epoch from (
    current_setting('test.load_employee_finished')::timestamptz
    - current_setting('test.load_employee_started')::timestamptz
  )) * 1000, 2),
  'rls_assertions', 16,
  'fixture_rolled_back', true
) as load_test_summary;

rollback;
