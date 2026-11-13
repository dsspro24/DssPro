create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '98000000-0000-4000-8000-000000000003',
  'authenticated',
  'authenticated',
  'subscription-renewal-period-test@example.test',
  '{"plan_code":"up_to_20"}'::jsonb
);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '98000000-0000-4000-8000-000000000004',
  'authenticated',
  'authenticated',
  'dsspro24@gmail.com',
  '{}'::jsonb
);

insert into public.profiles (id, full_name, account_type)
values ('98000000-0000-4000-8000-000000000003', 'Subscription Renewal Manager', 'manager')
on conflict (id) do update set account_type = excluded.account_type;

select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000003","user_metadata":{"plan_code":"up_to_20"}}',
  true
);
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000003', true);
select set_config(
  'test.subscription_renewal_organization_id',
  public.create_organization_with_billing_details(
    'Subscription renewal period test',
    null,
    'Test address',
    ''
  )::text,
  true
);

update public.workspace_subscriptions
set status = 'active',
    starts_at = now() - interval '1 month',
    ends_at = now() + interval '5 days',
    payment_status = 'paid'
where organization_id = current_setting('test.subscription_renewal_organization_id')::uuid;

select plan(4);

select lives_ok(
  format(
    'select public.request_workspace_subscription(%L::uuid, %L, 1)',
    current_setting('test.subscription_renewal_organization_id'),
    'up_to_20'
  ),
  'manager can order a renewal while the paid period is still active'
);

select is(
  (
    select (renewal.preinvoice_data ->> 'serviceEnd')::timestamptz
    from public.workspace_subscriptions as renewal
    where renewal.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and renewal.preinvoice_data ->> 'renewal' = 'true'
  ),
  (
    select current_subscription.ends_at + interval '1 month'
    from public.workspace_subscriptions as current_subscription
    where current_subscription.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and current_subscription.payment_status = 'paid'
  ),
  'renewal service end adds one month after the remaining five days'
);

select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-000000000004"}', true);
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000004', true);

select lives_ok(
  format(
    'select public.creator_confirm_workspace_subscription_payment(%L::uuid, now() + interval ''30 days'')',
    (
      select renewal.id
      from public.workspace_subscriptions as renewal
      where renewal.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
        and renewal.preinvoice_data ->> 'renewal' = 'true'
    )
  ),
  'creator can confirm a renewal using its preliminary invoice period'
);

select is(
  (
    select renewal.ends_at
    from public.workspace_subscriptions as renewal
    where renewal.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and renewal.preinvoice_data ->> 'renewal' = 'true'
  ),
  (
    select (renewal.preinvoice_data ->> 'serviceEnd')::timestamptz
    from public.workspace_subscriptions as renewal
    where renewal.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and renewal.preinvoice_data ->> 'renewal' = 'true'
  ),
  'confirmed renewal keeps the exact preliminary invoice end even when an override date is passed'
);

select * from finish();
rollback;
