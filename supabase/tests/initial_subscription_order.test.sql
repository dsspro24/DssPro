create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '98000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'initial-subscription-test@example.test',
  '{"plan_code":"up_to_20"}'::jsonb
);

insert into public.profiles (id, full_name, account_type)
values ('98000000-0000-4000-8000-000000000001', 'Initial Subscription Manager', 'manager')
on conflict (id) do update set account_type = excluded.account_type;

select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000001","user_metadata":{"plan_code":"up_to_20"}}',
  true
);
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
select set_config(
  'test.initial_subscription_organization_id',
  public.create_organization_with_billing_details(
    'Initial subscription test',
    null,
    'Test address',
    ''
  )::text,
  true
);

select plan(5);

select is(
  (select status from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_organization_id')::uuid),
  'pending',
  'new company starts with a pending subscription'
);
select is(
  (select order_code from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_organization_id')::uuid),
  null,
  'company creation does not submit a subscription order'
);
select is(
  (select payment_status from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_organization_id')::uuid),
  null,
  'company creation does not start a payment'
);
select is(
  (select preinvoice_data from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_organization_id')::uuid),
  null,
  'company creation does not issue a preinvoice'
);
select is(
  (select count(*)::integer from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_organization_id')::uuid),
  1,
  'company creation keeps one subscription draft for the selected plan'
);

select * from finish();
rollback;
