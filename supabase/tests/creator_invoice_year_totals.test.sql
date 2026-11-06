create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email)
values ('97000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'invoice-totals-test@example.com');

insert into public.organizations (id, name, created_by)
values ('97000000-0000-4000-8000-000000000010', 'Invoice totals test', '97000000-0000-4000-8000-000000000001');

insert into public.workspace_subscriptions (
  id, organization_id, plan_code, plan_name, status, amount_cents, final_invoice_data
)
values (
  '97000000-0000-4000-8000-000000000020',
  '97000000-0000-4000-8000-000000000010',
  'up_to_20',
  'Test plan',
  'active',
  1000,
  '{"issueDate":"2998-01-01","totalAmountCents":1000}'::jsonb
);

select plan(2);

select is(
  (select invoice_count from public.workspace_subscription_invoice_year_totals where invoice_year = 2998),
  1::bigint,
  'an invoice is added to its yearly total'
);

delete from public.organizations where id = '97000000-0000-4000-8000-000000000010';

select is(
  (select count(*) from public.workspace_subscription_invoice_year_totals where invoice_year = 2998),
  0::bigint,
  'deleting an organization removes the final invoice total without violating its check constraint'
);

select * from finish();
rollback;
