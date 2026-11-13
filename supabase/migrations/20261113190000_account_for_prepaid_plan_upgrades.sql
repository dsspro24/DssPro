create or replace function public.manager_change_workspace_subscription_plan(
  input_organization_id uuid,
  input_plan_code text
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_record public.organizations%rowtype;
  current_subscription public.workspace_subscriptions%rowtype;
  selected_plan public.subscription_plans%rowtype;
  billing_settings public.creator_billing_settings%rowtype;
  result public.workspace_subscriptions%rowtype;
  active_employee_count integer;
  order_months integer;
  issue_time timestamptz := now();
  period_start timestamptz;
  period_end timestamptz;
  remaining_ratio numeric := 1;
  net_amount_cents integer;
  vat_amount_cents integer := 0;
  total_amount_cents integer;
  price_delta_cents integer;
  credit_cents integer := 0;
  new_order_code text;
  initial_order boolean := false;
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Manager membership required';
  end if;

  select * into organization_record
  from public.organizations
  where id = input_organization_id
  for update;
  if not found then raise exception 'Organization not found'; end if;

  select count(*) into active_employee_count
  from public.organization_employees
  where organization_id = input_organization_id
    and archived_at is null
    and status = 'Aktyvus';

  select * into current_subscription
  from public.workspace_subscriptions
  where organization_id = input_organization_id
    and status = 'active'
    and (ends_at is null or ends_at > issue_time)
    and not (
      preinvoice_data ->> 'planChange' = 'true'
      and payment_status = 'pending'
      and (preinvoice_data ->> 'dueDate')::timestamptz < issue_time
    )
  order by created_at desc
  limit 1
  for update;

  if not found then
    perform public.request_workspace_subscription(input_organization_id, input_plan_code, 1);
    select * into result from public.workspace_subscriptions
    where organization_id = input_organization_id
    order by created_at desc limit 1;
    return result;
  end if;

  if current_subscription.plan_code = input_plan_code then
    raise exception 'The selected plan is already active';
  end if;
  if current_subscription.is_addon and input_plan_code not like 'additional_workspace_%' then
    raise exception 'Additional workspace plan type cannot be changed';
  elsif not current_subscription.is_addon and input_plan_code like 'additional_workspace_%' then
    raise exception 'Select a primary workspace plan';
  end if;

  select * into selected_plan
  from public.subscription_plans
  where code = input_plan_code and active;
  if not found then raise exception 'Selected subscription plan is unavailable'; end if;
  if coalesce(selected_plan.employee_limit, 200) < active_employee_count then
    raise exception 'Selected plan limit is too low for the active employee count';
  end if;

  select * into billing_settings from public.creator_billing_settings where id = true;
  if not found then
    billing_settings.issuer_details := '{}'::jsonb;
    billing_settings.vat_registered := false;
    billing_settings.vat_rate := 21;
    billing_settings.vat_included := false;
    billing_settings.invoice_note := '';
  end if;

  order_months := greatest(1, coalesce(current_subscription.order_months, 1));
  period_start := coalesce(current_subscription.starts_at, current_subscription.ordered_at, issue_time);
  period_end := current_subscription.ends_at;
  initial_order := current_subscription.order_code is not null
    and current_subscription.payment_status = 'pending';

  if initial_order then
    if current_subscription.preinvoice_data ->> 'planChange' = 'true' then
      raise exception 'An unpaid plan change already exists for this workspace';
    end if;
    update public.workspace_subscriptions
    set status = 'canceled',
        ends_at = least(coalesce(ends_at, issue_time), issue_time),
        cancel_at_period_end = false,
        updated_at = issue_time
    where id = current_subscription.id;
    period_start := issue_time;
    period_end := issue_time + interval '5 days';
    total_amount_cents := selected_plan.amount_cents * order_months;
  else
    if period_end is null or period_end <= issue_time then
      raise exception 'The current subscription period has ended';
    end if;
    remaining_ratio := greatest(0,
      extract(epoch from (period_end - issue_time))
      / nullif(extract(epoch from (period_end - period_start)), 0)
    );
    if period_start <= issue_time then
      remaining_ratio := least(1, remaining_ratio);
    end if;
    price_delta_cents := round(
      (selected_plan.amount_cents - current_subscription.amount_cents)
      * order_months * remaining_ratio
    )::integer;

    if price_delta_cents < 0 then
      if billing_settings.vat_registered and not billing_settings.vat_included then
        credit_cents := abs(price_delta_cents)
          + round(abs(price_delta_cents) * billing_settings.vat_rate / 100.0)::integer;
      else
        credit_cents := abs(price_delta_cents);
      end if;
      update public.organizations
      set subscription_credit_cents = subscription_credit_cents + credit_cents
      where id = input_organization_id;
    end if;

    if price_delta_cents <= 0 then
      insert into public.workspace_subscriptions (
        organization_id, plan_code, plan_name, status, amount_cents, currency, is_addon,
        starts_at, ends_at, order_months, payment_status, created_by
      ) values (
        input_organization_id, selected_plan.code, selected_plan.name, 'active',
        selected_plan.amount_cents, 'EUR', current_subscription.is_addon,
        issue_time, period_end, order_months, 'paid', auth.uid()
      )
      returning * into result;
      return result;
    end if;

    if billing_settings.vat_registered and billing_settings.vat_included then
      net_amount_cents := round(price_delta_cents / (1 + billing_settings.vat_rate / 100.0))::integer;
      vat_amount_cents := price_delta_cents - net_amount_cents;
      total_amount_cents := price_delta_cents;
    else
      net_amount_cents := price_delta_cents;
      if billing_settings.vat_registered then
        vat_amount_cents := round(net_amount_cents * billing_settings.vat_rate / 100.0)::integer;
      end if;
      total_amount_cents := net_amount_cents + vat_amount_cents;
    end if;
  end if;

  if initial_order then
    if billing_settings.vat_registered and billing_settings.vat_included then
      net_amount_cents := round(total_amount_cents / (1 + billing_settings.vat_rate / 100.0))::integer;
      vat_amount_cents := total_amount_cents - net_amount_cents;
    else
      net_amount_cents := total_amount_cents;
      if billing_settings.vat_registered then
        vat_amount_cents := round(net_amount_cents * billing_settings.vat_rate / 100.0)::integer;
        total_amount_cents := net_amount_cents + vat_amount_cents;
      end if;
    end if;
  end if;

  new_order_code := 'DSS' || to_char(issue_time at time zone 'UTC', 'YYMMDD')
    || nextval('public.workspace_subscription_order_sequence')::text;

  insert into public.workspace_subscriptions (
    organization_id, plan_code, plan_name, status, amount_cents, currency, is_addon,
    starts_at, ends_at, order_code, ordered_at, order_months, payment_status,
    preinvoice_data, created_by
  ) values (
    input_organization_id, selected_plan.code, selected_plan.name, 'active',
    selected_plan.amount_cents, 'EUR', current_subscription.is_addon,
    issue_time, period_end, new_order_code, issue_time, order_months, 'pending',
    jsonb_build_object(
      'documentType', 'Išankstinė sąskaita',
      'invoiceNumber', new_order_code,
      'orderCode', new_order_code,
      'issueDate', issue_time,
      'dueDate', issue_time + interval '5 days',
      'serviceStart', issue_time,
      'serviceEnd', case when initial_order then issue_time + make_interval(months => order_months) else period_end end,
      'months', order_months,
      'planChange', not initial_order,
      'issuer', billing_settings.issuer_details,
      'recipient', jsonb_build_object('name', organization_record.name, 'companyCode', organization_record.company_code),
      'planName', selected_plan.name,
      'unitPriceCents', selected_plan.amount_cents,
      'netAmountCents', net_amount_cents,
      'vatAmountCents', vat_amount_cents,
      'totalAmountCents', total_amount_cents,
      'vatRegistered', billing_settings.vat_registered,
      'vatRate', billing_settings.vat_rate,
      'vatIncluded', billing_settings.vat_included,
      'note', case
        when initial_order then billing_settings.invoice_note
        else concat_ws(E'\n', nullif(billing_settings.invoice_note, ''),
          'Plano kainų skirtumas apskaičiuotas proporcingai visam iki galiojimo pabaigos iš anksto apmokėtam laikotarpiui.')
      end
    ),
    auth.uid()
  )
  returning * into result;
  return result;
end;
$$;

revoke all on function public.manager_change_workspace_subscription_plan(uuid, text) from public, anon;
grant execute on function public.manager_change_workspace_subscription_plan(uuid, text) to authenticated;

create or replace function public.creator_confirm_workspace_subscription_payment(
  input_subscription_id uuid,
  input_end_at timestamptz default null
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_subscription public.workspace_subscriptions%rowtype;
  billing_settings public.creator_billing_settings%rowtype;
  result public.workspace_subscriptions%rowtype;
  final_number text;
  final_start timestamptz;
  final_end timestamptz;
  final_document jsonb;
  final_issuer jsonb;
  is_renewal boolean;
  is_reactivation boolean;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;

  select * into current_subscription
  from public.workspace_subscriptions
  where id = input_subscription_id
  for update;
  if not found then raise exception 'Subscription not found'; end if;
  if current_subscription.order_code is null or current_subscription.preinvoice_data is null then
    raise exception 'Subscription has no issued preliminary invoice';
  end if;
  if current_subscription.status = 'canceled' then
    raise exception 'A canceled order cannot be marked as paid';
  end if;
  if current_subscription.payment_status = 'paid' then
    raise exception 'This order is already marked as paid';
  end if;
  if current_subscription.order_code !~ '^DSS[0-9]{7,}$' then
    raise exception 'Subscription order number has an invalid format';
  end if;

  select * into billing_settings
  from public.creator_billing_settings
  where id = true;
  if not found then
    billing_settings.issuer_details := '{}'::jsonb;
  end if;
  final_issuer := coalesce(
    nullif(billing_settings.issuer_details, '{}'::jsonb),
    current_subscription.preinvoice_data -> 'issuer',
    '{}'::jsonb
  );

  is_renewal := current_subscription.preinvoice_data ->> 'renewal' = 'true';
  is_reactivation := current_subscription.preinvoice_data ->> 'reactivation' = 'true';
  if is_renewal then
    final_start := coalesce(
      (current_subscription.preinvoice_data ->> 'serviceStart')::timestamptz,
      current_subscription.starts_at,
      current_subscription.ordered_at
    );
    final_end := coalesce(
      (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz,
      input_end_at,
      final_start + make_interval(months => current_subscription.order_months)
    );
  elsif is_reactivation then
    final_start := coalesce(
      (current_subscription.preinvoice_data ->> 'serviceStart')::timestamptz,
      current_subscription.starts_at,
      current_subscription.ordered_at
    );
    if final_start <= now() then final_start := now(); end if;
    final_end := coalesce(
      input_end_at,
      final_start + make_interval(months => current_subscription.order_months)
    );
  else
    final_start := case
      when current_subscription.preinvoice_data ->> 'accessAfterPayment' = 'true' then now()
      when current_subscription.preinvoice_data ->> 'planChange' = 'true'
        then coalesce(
          (current_subscription.preinvoice_data ->> 'serviceStart')::timestamptz,
          current_subscription.starts_at,
          current_subscription.ordered_at
        )
      else coalesce(current_subscription.starts_at, current_subscription.ordered_at)
    end;
    final_end := coalesce(
      case when current_subscription.preinvoice_data ->> 'planChange' = 'true'
        then (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz
      end,
      input_end_at,
      case when current_subscription.preinvoice_data ->> 'planChange' = 'true'
        then (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz
        else case
          when current_subscription.preinvoice_data ->> 'accessAfterPayment' = 'true'
            then final_start + make_interval(months => current_subscription.order_months)
          else current_subscription.ordered_at + make_interval(months => current_subscription.order_months)
        end
      end
    );
  end if;
  if final_start is null or final_end <= final_start then
    raise exception 'Subscription end date must be after its start date';
  end if;

  final_number := 'SF' || substring(current_subscription.order_code from 4);
  if exists (
    select 1
    from public.workspace_subscriptions
    where final_invoice_number = final_number
      and id <> current_subscription.id
  ) then
    raise exception 'The matching final invoice number is already assigned to another subscription';
  end if;
  final_document := current_subscription.preinvoice_data || jsonb_build_object(
    'documentType', case
      when coalesce((current_subscription.preinvoice_data ->> 'vatRegistered')::boolean, false)
        then 'PVM sąskaita faktūra'
      else 'Sąskaita faktūra'
    end,
    'invoiceNumber', final_number,
    'issueDate', now(),
    'paidAt', now(),
    'dueDate', null,
    'serviceStart', final_start,
    'serviceEnd', final_end,
    'issuer', final_issuer
  );

  update public.workspace_subscriptions
  set status = 'expired',
      ends_at = case
        when is_renewal or is_reactivation then ends_at
        else least(coalesce(ends_at, current_subscription.ordered_at), current_subscription.ordered_at)
      end,
      cancel_at_period_end = false,
      updated_at = now()
  where organization_id = current_subscription.organization_id
    and id <> current_subscription.id
    and status = 'active'
    and not (
      is_renewal
      and final_start > now()
      and ends_at > now()
    );

  update public.workspace_subscriptions
  set status = 'active',
      starts_at = final_start,
      ends_at = final_end,
      payment_status = 'paid',
      final_invoice_number = final_number,
      final_invoice_data = final_document,
      paid_at = now(),
      cancel_at_period_end = false,
      updated_at = now()
  where id = input_subscription_id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.creator_confirm_workspace_subscription_payment(uuid, timestamptz) from public, anon;
grant execute on function public.creator_confirm_workspace_subscription_payment(uuid, timestamptz) to authenticated;

with latest_paid_subscription as (
  select distinct on (organization_id)
    id,
    organization_id
  from public.workspace_subscriptions
  where payment_status = 'paid'
    and status <> 'canceled'
  order by organization_id, created_at desc, id desc
),
repairable_renewal as (
  select
    subscription.id,
    (subscription.preinvoice_data ->> 'serviceStart')::timestamptz as service_start,
    (subscription.preinvoice_data ->> 'serviceEnd')::timestamptz as service_end
  from public.workspace_subscriptions as subscription
  join latest_paid_subscription as latest
    on latest.id = subscription.id
  where subscription.payment_status = 'paid'
    and subscription.status in ('active', 'expired')
    and subscription.preinvoice_data ->> 'renewal' = 'true'
    and (subscription.preinvoice_data ->> 'serviceStart')::timestamptz > subscription.ordered_at
    and (subscription.preinvoice_data ->> 'serviceEnd')::timestamptz > now()
    and (
      subscription.ends_at is null
      or subscription.ends_at < (subscription.preinvoice_data ->> 'serviceEnd')::timestamptz
    )
)
update public.workspace_subscriptions as subscription
set status = 'active',
    starts_at = repairable_renewal.service_start,
    ends_at = repairable_renewal.service_end,
    final_invoice_data = jsonb_set(
      jsonb_set(
        coalesce(subscription.final_invoice_data, '{}'::jsonb),
        '{serviceStart}',
        to_jsonb(repairable_renewal.service_start),
        true
      ),
      '{serviceEnd}',
      to_jsonb(repairable_renewal.service_end),
      true
    ),
    updated_at = now()
from repairable_renewal
where subscription.id = repairable_renewal.id;
