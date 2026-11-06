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

select plan(20);

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

select is(
  (public.request_workspace_subscription(
    current_setting('test.initial_subscription_organization_id')::uuid,
    'up_to_20',
    1
  )).status,
  'active',
  'the first order grants five-day access'
);
select is(
  (select preinvoice_data ->> 'initialTrialAccess' from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_organization_id')::uuid),
  'true',
  'the first order is marked as the one-time trial'
);
select ok(
  (select ends_at > now() and ends_at <= now() + interval '5 days'
   from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_organization_id')::uuid),
  'the one-time trial lasts no more than five days'
);
select ok(
  public.has_workspace_read_access(current_setting('test.initial_subscription_organization_id')::uuid),
  'workspace data is readable during the first five-day access'
);
update public.workspace_subscriptions
set starts_at = now() - interval '6 days',
    ends_at = now() - interval '1 minute',
    created_at = now() - interval '1 minute'
where organization_id = current_setting('test.initial_subscription_organization_id')::uuid;
select ok(
  not public.has_workspace_read_access(current_setting('test.initial_subscription_organization_id')::uuid),
  'an unpaid first order does not grant read access after the five-day period'
);
select is(
  (public.manager_cancel_workspace_subscription_order(
    (select id from public.workspace_subscriptions
     where organization_id = current_setting('test.initial_subscription_organization_id')::uuid)
  )).status,
  'canceled',
  'manager can cancel the first unpaid order'
);
select ok(
  not public.has_workspace_read_access(current_setting('test.initial_subscription_organization_id')::uuid),
  'canceling the first unpaid order immediately removes trial access'
);
select is(
  (public.request_workspace_subscription(
    current_setting('test.initial_subscription_organization_id')::uuid,
    'up_to_20',
    1
  )).status,
  'pending',
  'a subsequent order does not grant another five-day access'
);
select is(
  (select ends_at from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_organization_id')::uuid
     and preinvoice_data ->> 'initialTrialAccess' = 'false'),
  null,
  'a subsequent unpaid order has no temporary access period'
);
select is(
  (select preinvoice_data ->> 'initialTrialAccess' from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_organization_id')::uuid
     and preinvoice_data ->> 'initialTrialAccess' = 'false'),
  'false',
  'subsequent orders are not marked as the one-time trial'
);
select ok(
  not public.has_workspace_read_access(current_setting('test.initial_subscription_organization_id')::uuid),
  'workspace data remains inaccessible until an administrator confirms payment'
);

select set_config(
  'test.initial_subscription_additional_organization_id',
  public.create_additional_organization(
    'Additional subscription test',
    null,
    'additional_workspace_20'
  )::text,
  true
);
select is(
  (public.request_workspace_subscription(
    current_setting('test.initial_subscription_additional_organization_id')::uuid,
    'additional_workspace_20',
    1
  )).status,
  'pending',
  'additional companies for the same account do not get a second trial'
);
select is(
  (select preinvoice_data ->> 'initialTrialAccess' from public.workspace_subscriptions
   where organization_id = current_setting('test.initial_subscription_additional_organization_id')::uuid),
  'false',
  'the trial is limited across all companies owned by the account'
);
select ok(
  not public.has_workspace_read_access(current_setting('test.initial_subscription_additional_organization_id')::uuid),
  'additional company remains inaccessible until payment is confirmed'
);

update public.workspace_subscriptions
set status = 'expired',
    starts_at = now() - interval '4 months',
    ends_at = now() - interval '3 months',
    payment_status = 'paid'
where organization_id = current_setting('test.initial_subscription_organization_id')::uuid;

select throws_ok(
  format(
    'select public.request_workspace_subscription(%L::uuid, %L, 1)',
    current_setting('test.initial_subscription_organization_id'),
    'up_to_20'
  ),
  'P0001',
  'Access restoration after the read-only period requires administrator assistance',
  'manager cannot restore access after the two-month read-only period'
);

select * from finish();
rollback;
