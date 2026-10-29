create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email)
values
  ('94000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'aap-signature-manager@example.test'),
  ('94000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'aap-signature-employee@example.test');

insert into public.organizations (id, name, created_by)
values (
  '94000000-0000-4000-8000-000000000010',
  'AAP signature access test',
  '94000000-0000-4000-8000-000000000001'
);

insert into public.organization_memberships (organization_id, user_id, role)
values ('94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000001', 'manager');

insert into public.organization_memberships (organization_id, user_id, role, employee_id)
values ('94000000-0000-4000-8000-000000000010', '94000000-0000-4000-8000-000000000002', 'employee', 'aap-signature-test-employee');

insert into public.organization_data (organization_id, data, updated_by)
values (
  '94000000-0000-4000-8000-000000000010',
  '{
    "employees": [{
      "id": "aap-signature-test-employee",
      "resourceIds": ["res-aap"]
    }],
    "aapIssuances": [{
      "id": "aap-signature-test-issuance",
      "orgId": "94000000-0000-4000-8000-000000000010",
      "employeeId": "aap-signature-test-employee",
      "status": "pending",
      "items": [{"id": "helmet", "name": "Šalmas", "quantity": 1, "unit": "Vnt."}]
    }]
  }'::jsonb,
  '94000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000002', true);

update public.organization_data
set data = jsonb_set(
  data,
  '{aapIssuances,0}',
  (data -> 'aapIssuances' -> 0) || jsonb_build_object(
    'status', 'signed',
    'signer', 'AAP Signature Employee',
    'signatureMethod', 'PIN',
    'signedAt', now(),
    'signaturePath', '94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000099.png'
  )
)
where organization_id = '94000000-0000-4000-8000-000000000010';

select plan(3);

select is(
  public.can_read_signature_asset('94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000099.png'),
  true,
  'an employee can read their own signed AAP signature'
);

select is(
  public.can_read_signature_asset('94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000098.png'),
  false,
  'an employee cannot read an unrelated signature asset'
);

select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);

select is(
  public.can_read_signature_asset('94000000-0000-4000-8000-000000000010/94000000-0000-4000-8000-000000000099.png'),
  true,
  'a manager can read an employee AAP signature'
);

select * from finish();

rollback;
