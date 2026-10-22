create extension if not exists pgtap with schema extensions;

begin;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000099', true);

select plan(1);

select throws_ok(
  $$select public.record_employee_aap_card_signature_with_image('0000', 'invalid-path', false)$$,
  'P0001',
  'Both AAP document pages must be confirmed',
  'AAP signature requires confirmation of both pages'
);

select * from finish();

rollback;