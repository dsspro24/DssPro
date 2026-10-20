create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email)
values
  ('90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'manager-rpc-test@example.test'),
  ('90000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'non-manager-rpc-test@example.test');

insert into public.organizations (id, name, created_by)
values ('90000000-0000-4000-8000-000000000010', 'RPC test organization', '90000000-0000-4000-8000-000000000001');

insert into public.organization_memberships (organization_id, user_id, role)
values ('90000000-0000-4000-8000-000000000010', '90000000-0000-4000-8000-000000000001', 'manager');

insert into public.organization_data (organization_id, data, updated_by)
values (
  '90000000-0000-4000-8000-000000000010',
  '{
    "organizations": [{
      "id": "90000000-0000-4000-8000-000000000010",
      "name": "RPC test organization",
      "resources": ["rpc-test-document"]
    }],
    "resources": [{
      "id": "rpc-test-document",
      "title": "RPC test document",
      "type": "Instrukcija"
    }],
    "employees": [
      {
        "id": "rpc-test-employee",
        "orgId": "90000000-0000-4000-8000-000000000010",
        "name": "Target employee",
        "email": "target@example.test",
        "position": "Old position",
        "status": "Aktyvus",
        "resourceIds": [],
        "requiredSignersByResource": {}
      },
      {
        "id": "rpc-test-other-employee",
        "orgId": "90000000-0000-4000-8000-000000000010",
        "name": "Other employee",
        "email": "other@example.test",
        "position": "Other position",
        "status": "Aktyvus",
        "resourceIds": [],
        "requiredSignersByResource": {}
      }
    ],
    "signatures": [{
      "id": "rpc-test-signature",
      "employeeId": "rpc-test-employee",
      "resourceId": "rpc-test-document",
      "signer": "Target employee",
      "role": "Darbuotojas",
      "signedAt": "2026-10-19T00:00:00Z"
    }],
    "protocolBatches": [{
      "id": "rpc-test-batch",
      "orgId": "90000000-0000-4000-8000-000000000010",
      "resourceId": "rpc-test-document",
      "cadence": "weekly-friday",
      "periodStart": "2026-10-19",
      "periodEnd": "2026-10-25",
      "protocolDate": "2026-10-25",
      "number": 1,
      "employeeIds": ["rpc-test-other-employee"],
      "createdAt": "2026-10-19T00:00:00Z"
    }]
  }'::jsonb,
  '90000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);

select plan(10);

select is(
  public.save_organization_employee(
    '90000000-0000-4000-8000-000000000010',
    'rpc-test-employee',
    'Updated position',
    '["rpc-test-document"]'::jsonb,
    '{"rpc-test-document":["Darbuotojas","Vadovas"]}'::jsonb,
    '[{
      "id":"rpc-test-batch",
      "orgId":"90000000-0000-4000-8000-000000000010",
      "resourceId":"rpc-test-document",
      "cadence":"weekly-friday",
      "periodStart":"2026-10-19",
      "periodEnd":"2026-10-25",
      "protocolDate":"2026-10-25",
      "number":1,
      "createdAt":"2026-10-19T00:00:00Z",
      "employeeIds":["rpc-test-employee"]
    }]'::jsonb
  ),
  true,
  'a manager can save one employee'
);

select is(
  (
    select person.value ->> 'position'
    from public.organization_data as workspace
    cross join lateral jsonb_array_elements(workspace.data -> 'employees') as person(value)
    where workspace.organization_id = '90000000-0000-4000-8000-000000000010'
      and person.value ->> 'id' = 'rpc-test-employee'
  ),
  'Updated position',
  'the target employee fields are updated'
);

select is(
  (
    select person.value ->> 'position'
    from public.organization_data as workspace
    cross join lateral jsonb_array_elements(workspace.data -> 'employees') as person(value)
    where workspace.organization_id = '90000000-0000-4000-8000-000000000010'
      and person.value ->> 'id' = 'rpc-test-other-employee'
  ),
  'Other position',
  'other employee data is unchanged'
);

select is(
  (
    select workspace.data -> 'signatures'
    from public.organization_data as workspace
    where workspace.organization_id = '90000000-0000-4000-8000-000000000010'
  ),
  '[{"id":"rpc-test-signature"}]'::jsonb,
  'signature history is unchanged'
);

select is(
  (
    select count(*)::integer
    from public.document_signatures
    where organization_id = '90000000-0000-4000-8000-000000000010'
      and signature_id = 'rpc-test-signature'
      and employee_id = 'rpc-test-employee'
  ),
  1,
  'normalized signature history is unchanged'
);

select is(
  (
    select count(*)::integer
    from public.employee_document_assignments
    where organization_id = '90000000-0000-4000-8000-000000000010'
      and employee_id = 'rpc-test-employee'
      and document_id = 'rpc-test-document'
  ),
  1,
  'the assigned document is synchronized'
);

select is(
  (
    select required_signers
    from public.employee_document_assignments
    where organization_id = '90000000-0000-4000-8000-000000000010'
      and employee_id = 'rpc-test-employee'
      and document_id = 'rpc-test-document'
  ),
  '["Darbuotojas","Vadovas"]'::jsonb,
  'required signers are synchronized'
);

select is(
  (
    select batch.value -> 'employeeIds'
    from public.organization_data as workspace
    cross join lateral jsonb_array_elements(workspace.data -> 'protocolBatches') as batch(value)
    where workspace.organization_id = '90000000-0000-4000-8000-000000000010'
      and batch.value ->> 'id' = 'rpc-test-batch'
  ),
  '["rpc-test-other-employee","rpc-test-employee"]'::jsonb,
  'protocol membership is added without replacing other employees'
);

select is(
  (
    select count(*)::integer
    from public.protocol_batch_employees
    where organization_id = '90000000-0000-4000-8000-000000000010'
      and batch_id = 'rpc-test-batch'
  ),
  2,
  'normalized protocol membership for both employees remains'
);

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.save_organization_employee(
    '90000000-0000-4000-8000-000000000010',
    'rpc-test-employee',
    'Unauthorized update',
    '["rpc-test-document"]'::jsonb,
    '{"rpc-test-document":["Darbuotojas"]}'::jsonb,
    '[]'::jsonb
  )$$,
  'P0001',
  'Organization manager access required',
  'a non-manager cannot save the employee'
);

select * from finish();
rollback;
