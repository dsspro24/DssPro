create extension if not exists pgtap with schema extensions;

begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '98000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'workspace-write-access-test@example.test',
  '{"plan_code":"up_to_20"}'::jsonb
);

insert into public.profiles (id, full_name, account_type)
values ('98000000-0000-4000-8000-000000000002', 'Workspace Write Access Manager', 'manager')
on conflict (id) do update set account_type = excluded.account_type;

select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000002","user_metadata":{"plan_code":"up_to_20"}}',
  true
);
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);
select set_config(
  'test.workspace_write_access_organization_id',
  public.create_organization_with_billing_details(
    'Workspace write access test',
    null,
    'Test address',
    ''
  )::text,
  true
);

select plan(2);

update public.workspace_subscriptions
set status = 'expired',
    starts_at = now() - interval '2 months',
    ends_at = now() - interval '1 month',
    payment_status = 'paid',
    manual_access_override = true,
    created_at = now() - interval '2 days'
where organization_id = current_setting('test.workspace_write_access_organization_id')::uuid;

insert into public.workspace_subscriptions (
  organization_id, plan_code, plan_name, status, amount_cents,
  starts_at, ends_at, payment_status, created_at
)
values (
  current_setting('test.workspace_write_access_organization_id')::uuid,
  'up_to_20', 'Iki 20 darbuotojų', 'active', 2999,
  now() - interval '1 day', now() + interval '30 days', 'paid', now() - interval '1 day'
);

insert into public.workspace_subscriptions (
  organization_id, plan_code, plan_name, status, amount_cents,
  starts_at, ends_at, payment_status, preinvoice_data, created_at
)
values (
  current_setting('test.workspace_write_access_organization_id')::uuid,
  'up_to_20', 'Iki 20 darbuotojų', 'active', 2999,
  now(), now() + interval '30 days', 'pending',
  '{"renewal":true}'::jsonb, now()
);

select lives_ok(
  format(
    'insert into public.organization_data (organization_id, data, updated_by) values (%L::uuid, %L::jsonb, auth.uid())',
    current_setting('test.workspace_write_access_organization_id'),
    '{"organizations":[]}'
  ),
  'a pending renewal does not block writes during the current paid period'
);

update public.workspace_subscriptions
set status = 'expired',
    ends_at = now() - interval '1 minute'
where organization_id = current_setting('test.workspace_write_access_organization_id')::uuid
  and status = 'active'
  and payment_status = 'paid';

update public.workspace_subscriptions
set manual_access_override = false
where organization_id = current_setting('test.workspace_write_access_organization_id')::uuid;

update public.workspace_subscriptions
set status = 'pending',
    starts_at = null,
    ends_at = null,
    order_code = 'DSS' || to_char(now() at time zone 'UTC', 'YYMMDD')
      || nextval('public.workspace_subscription_order_sequence')::text,
    ordered_at = now(),
    preinvoice_data = '{"dueDate":"2099-01-01T00:00:00Z"}'::jsonb,
    created_at = now() + interval '1 minute'
where organization_id = current_setting('test.workspace_write_access_organization_id')::uuid
  and preinvoice_data ->> 'renewal' = 'true';

select throws_ok(
  format(
    'update public.organization_data set data = data where organization_id = %L::uuid',
    current_setting('test.workspace_write_access_organization_id')
  ),
  'P0001',
  'Workspace changes require confirmed subscription payment',
  'an unpaid repeat order cannot restore writes even while its invoice due date is in the future'
);

select * from finish();
rollback;
