create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email)
values ('95000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'aap-issuance-manager@example.test');

insert into public.organizations (id, name, created_by)
values (
  '95000000-0000-4000-8000-000000000010',
  'AAP issuance creation test',
  '95000000-0000-4000-8000-000000000001'
);

insert into public.organization_memberships (organization_id, user_id, role)
values ('95000000-0000-4000-8000-000000000010', '95000000-0000-4000-8000-000000000001', 'manager');

insert into public.organization_data (organization_id, data, updated_by)
values (
  '95000000-0000-4000-8000-000000000010',
  '{
    "employees": [{
      "id": "aap-issuance-test-employee",
      "orgId": "95000000-0000-4000-8000-000000000010",
      "name": "AAP Issuance Employee",
      "resourceIds": ["res-aap"]
    }],
    "aapIssuances": []
  }'::jsonb,
  '95000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);

select plan(3);

select lives_ok(
  $$select public.create_manager_aap_issuance(
    '{"id":"aap-issuance-test-one","orgId":"95000000-0000-4000-8000-000000000010","employeeId":"aap-issuance-test-employee","issuedAt":"2026-10-29","issuedBy":"Test Manager","items":[{"id":"helmet","name":"Šalmas","quantity":1,"unit":"Vnt."}],"status":"signed","signedAt":"invalid","signaturePath":"invalid"}'::jsonb
  )$$,
  'manager can create a pending AAP issuance'
);

select lives_ok(
  $$select public.create_manager_aap_issuance(
    '{"id":"aap-issuance-test-two","orgId":"95000000-0000-4000-8000-000000000010","employeeId":"aap-issuance-test-employee","issuedAt":"2026-10-29","issuedBy":"Test Manager","items":[{"id":"gloves","name":"Pirštinės","quantity":1,"unit":"Pora"}]}'::jsonb
  )$$,
  'manager can create a second AAP issuance for the same employee'
);

select is(
  (
    select count(*)::integer
    from public.organization_data as organization_data
    cross join lateral jsonb_array_elements(organization_data.data -> 'aapIssuances') as issuance(value)
    where organization_data.organization_id = '95000000-0000-4000-8000-000000000010'
      and issuance.value ->> 'status' = 'pending'
      and coalesce(issuance.value ->> 'signaturePath', '') = ''
      and coalesce(issuance.value ->> 'signedAt', '') = ''
  ),
  2,
  'each AAP issuance is saved as a new pending unsigned record'
);

select * from finish();

rollback;
