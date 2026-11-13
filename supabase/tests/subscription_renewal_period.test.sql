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

select plan(24);

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

select is(
  (
    select current_subscription.status
    from public.workspace_subscriptions as current_subscription
    where current_subscription.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and current_subscription.payment_status = 'paid'
      and current_subscription.preinvoice_data ->> 'renewal' is distinct from 'true'
      and current_subscription.ends_at > now()
  ),
  'active',
  'confirming an early renewal keeps the current paid period active until its original end'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000003","user_metadata":{"plan_code":"up_to_20"}}',
  true
);
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000003', true);

select lives_ok(
  format(
    'select public.manager_change_workspace_subscription_plan(%L::uuid, %L)',
    current_setting('test.subscription_renewal_organization_id'),
    'up_to_50'
  ),
  'manager can upgrade a plan with prepaid renewal time remaining'
);

select is(
  (
    select (plan_change.preinvoice_data ->> 'totalAmountCents')::integer
    from public.workspace_subscriptions as plan_change
    where plan_change.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and plan_change.payment_status = 'pending'
      and plan_change.preinvoice_data ->> 'planChange' = 'true'
  ),
  (
    with paid_periods as (
      select current_subscription.amount_cents,
        greatest(1, coalesce(current_subscription.order_months, 1))
          * greatest(0, least(1,
            extract(epoch from (
              current_subscription.ends_at
              - greatest(coalesce(current_subscription.starts_at, current_subscription.ordered_at), now())
            ))
            / nullif(extract(epoch from (
              current_subscription.ends_at - coalesce(current_subscription.starts_at, current_subscription.ordered_at)
            )), 0)
          )) as remaining_months
      from public.workspace_subscriptions as current_subscription
      where current_subscription.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
        and current_subscription.status = 'active'
        and current_subscription.payment_status = 'paid'
        and current_subscription.ends_at > now()
    ),
    price_delta as (
      select round(sum((selected_plan.amount_cents - paid_periods.amount_cents) * paid_periods.remaining_months))::integer as amount_cents
      from paid_periods
      cross join public.subscription_plans as selected_plan
      where selected_plan.code = 'up_to_50'
    )
    select case
      when coalesce(billing.vat_registered, false) and coalesce(billing.vat_included, false)
        then price_delta.amount_cents
      when coalesce(billing.vat_registered, false)
        then price_delta.amount_cents
          + round(price_delta.amount_cents * coalesce(billing.vat_rate, 21) / 100.0)::integer
      else price_delta.amount_cents
    end
    from price_delta
    left join public.creator_billing_settings as billing on billing.id = true
  ),
  'upgrade invoice covers the remaining value of current and renewed paid periods'
);

select is(
  (
    select (plan_change.preinvoice_data ->> 'serviceMonths')::numeric
    from public.workspace_subscriptions as plan_change
    where plan_change.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and plan_change.payment_status = 'pending'
      and plan_change.preinvoice_data ->> 'planChange' = 'true'
  ),
  (
    select sum(
      greatest(1, coalesce(current_subscription.order_months, 1))
      * greatest(0, least(1,
        extract(epoch from (
          current_subscription.ends_at
          - greatest(coalesce(current_subscription.starts_at, current_subscription.ordered_at), now())
        ))
        / nullif(extract(epoch from (
          current_subscription.ends_at - coalesce(current_subscription.starts_at, current_subscription.ordered_at)
        )), 0)
      ))
    )
    from public.workspace_subscriptions as current_subscription
    where current_subscription.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and current_subscription.status = 'active'
      and current_subscription.payment_status = 'paid'
      and current_subscription.ends_at > now()
  ),
  'upgrade invoice stores the combined remaining service months'
);

select is(
  (
    select plan_change.starts_at
    from public.workspace_subscriptions as plan_change
    where plan_change.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and plan_change.payment_status = 'pending'
      and plan_change.preinvoice_data ->> 'planChange' = 'true'
  ),
  (
    select (plan_change.preinvoice_data ->> 'serviceStart')::timestamptz
    from public.workspace_subscriptions as plan_change
    where plan_change.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and plan_change.payment_status = 'pending'
      and plan_change.preinvoice_data ->> 'planChange' = 'true'
  ),
  'upgraded plan starts immediately while preserving the original paid-through end date'
);

select lives_ok(
  format(
    'select public.manager_cancel_workspace_subscription_order(%L::uuid)',
    (
      select plan_change.id
      from public.workspace_subscriptions as plan_change
      where plan_change.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
        and plan_change.payment_status = 'pending'
        and plan_change.preinvoice_data ->> 'planChange' = 'true'
    )
  ),
  'manager can cancel an unpaid plan change to clear the pending-order block'
);

select is(
  (
    select plan_change.payment_status
    from public.workspace_subscriptions as plan_change
    where plan_change.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and plan_change.preinvoice_data ->> 'planChange' = 'true'
  ),
  'canceled',
  'canceling a pending plan change releases the workspace for a new renewal order'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000003","user_metadata":{"plan_code":"up_to_20"}}',
  true
);
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000003', true);

select lives_ok(
  format(
    'select public.manager_change_workspace_subscription_plan(%L::uuid, %L)',
    current_setting('test.subscription_renewal_organization_id'),
    'up_to_50'
  ),
  'manager can create a replacement plan change with a prepaid future renewal'
);

select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-000000000004"}', true);
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000004', true);

select lives_ok(
  format(
    'select public.creator_confirm_workspace_subscription_payment(%L::uuid, null)',
    (
      select plan_change.id
      from public.workspace_subscriptions as plan_change
      where plan_change.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
        and plan_change.payment_status = 'pending'
        and plan_change.preinvoice_data ->> 'planChange' = 'true'
    )
  ),
  'creator can confirm a plan change without violating the subscription period constraint'
);

select is(
  (
    select renewal.status
    from public.workspace_subscriptions as renewal
    where renewal.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and renewal.preinvoice_data ->> 'renewal' = 'true'
  ),
  'expired',
  'the replaced future renewal is no longer active after the plan change'
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
  'the replaced renewal keeps its original service dates for invoice history'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000003","user_metadata":{"plan_code":"up_to_20"}}',
  true
);
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000003', true);
select set_config(
  'test.pre_downgrade_end',
  (
    select ends_at::text
    from public.workspace_subscriptions
    where organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and status = 'active'
      and payment_status = 'paid'
    order by created_at desc
    limit 1
  ),
  true
);

select lives_ok(
  format(
    'select public.manager_change_workspace_subscription_plan(%L::uuid, %L)',
    current_setting('test.subscription_renewal_organization_id'),
    'up_to_20'
  ),
  'manager can downgrade a paid plan without issuing a refund'
);

select is(
  (
    select plan_code
    from public.workspace_subscriptions
    where organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and status = 'active'
      and payment_status = 'paid'
    order by created_at desc
    limit 1
  ),
  'up_to_20',
  'the cheaper plan becomes active immediately'
);

select ok(
  (
    select ends_at > current_setting('test.pre_downgrade_end')::timestamptz
    from public.workspace_subscriptions
    where organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and status = 'active'
      and payment_status = 'paid'
    order by created_at desc
    limit 1
  ),
  'the downgrade converts prepaid value into extra service time'
);

select ok(
  (
    select (plan_adjustment_data ->> 'extensionDays')::numeric > 0
    from public.workspace_subscriptions
    where organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and status = 'active'
      and payment_status = 'paid'
    order by created_at desc
    limit 1
  ),
  'the adjustment details are stored for the creator admin'
);

select is(
  (
    select subscription_credit_cents
    from public.organizations
    where id = current_setting('test.subscription_renewal_organization_id')::uuid
  ),
  0,
  'converted credit is not left for an unrelated future invoice'
);

select lives_ok(
  format(
    'select public.manager_change_workspace_subscription_plan(%L::uuid, %L)',
    current_setting('test.subscription_renewal_organization_id'),
    'up_to_50'
  ),
  'manager can upgrade after a downgrade extended the paid period'
);

select is(
  (
    select (plan_change.preinvoice_data ->> 'serviceMonths')::numeric
    from public.workspace_subscriptions as plan_change
    where plan_change.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and plan_change.payment_status = 'pending'
      and plan_change.preinvoice_data ->> 'planChange' = 'true'
  ),
  (
    select (downgrade.plan_adjustment_data ->> 'serviceMonths')::numeric
    from public.workspace_subscriptions as downgrade
    where downgrade.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and downgrade.plan_adjustment_data ->> 'type' = 'prepaid_downgrade'
  ),
  'a later upgrade includes the downgraded plan time and its extension'
);

select is(
  (
    select (plan_change.preinvoice_data ->> 'totalAmountCents')::integer
    from public.workspace_subscriptions as plan_change
    where plan_change.organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and plan_change.payment_status = 'pending'
      and plan_change.preinvoice_data ->> 'planChange' = 'true'
  ),
  (
    with downgrade as (
      select
        (plan_adjustment_data ->> 'serviceMonths')::numeric as service_months,
        amount_cents
      from public.workspace_subscriptions
      where organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
        and plan_adjustment_data ->> 'type' = 'prepaid_downgrade'
    ),
    price_delta as (
      select round((selected_plan.amount_cents - downgrade.amount_cents) * downgrade.service_months)::integer as amount_cents
      from downgrade
      cross join public.subscription_plans as selected_plan
      where selected_plan.code = 'up_to_50'
    )
    select case
      when coalesce(billing.vat_registered, false) and coalesce(billing.vat_included, false)
        then price_delta.amount_cents
      when coalesce(billing.vat_registered, false)
        then price_delta.amount_cents
          + round(price_delta.amount_cents * coalesce(billing.vat_rate, 21) / 100.0)::integer
      else price_delta.amount_cents
    end
    from price_delta
    left join public.creator_billing_settings as billing on billing.id = true
  ),
  'upgrade invoice correctly prices all remaining and extended downgrade time'
);

select is(
  (
    select count(*)::integer
    from public.workspace_subscriptions
    where organization_id = current_setting('test.subscription_renewal_organization_id')::uuid
      and status = 'active'
  ),
  1,
  'only the downgraded plan remains active'
);

select * from finish();
rollback;
