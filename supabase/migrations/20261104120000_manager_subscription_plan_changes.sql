alter table public.organizations
  add column if not exists subscription_credit_cents integer not null default 0
    check (subscription_credit_cents >= 0);

create or replace function public.apply_organization_subscription_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  available_credit integer;
  original_total integer;
  credit_used integer;
  discounted_total integer;
  discounted_net integer;
begin
  if new.preinvoice_data is null
    or new.preinvoice_data ? 'creditAppliedCents'
    or (tg_op = 'UPDATE' and new.preinvoice_data is not distinct from old.preinvoice_data) then
    return new;
  end if;

  select subscription_credit_cents into available_credit
  from public.organizations
  where id = new.organization_id
  for update;
  if not found or available_credit <= 0 then return new; end if;

  original_total := greatest(0, coalesce((new.preinvoice_data ->> 'totalAmountCents')::integer, 0));
  if original_total = 0 then return new; end if;
  credit_used := least(available_credit, original_total);
  discounted_total := original_total - credit_used;
  discounted_net := round(
    coalesce((new.preinvoice_data ->> 'netAmountCents')::numeric, original_total)
      * discounted_total / original_total
  )::integer;

  new.preinvoice_data := jsonb_set(
    jsonb_set(
      jsonb_set(new.preinvoice_data, '{totalAmountCents}', to_jsonb(discounted_total), true),
      '{netAmountCents}', to_jsonb(discounted_net), true
    ),
    '{vatAmountCents}', to_jsonb(discounted_total - discounted_net), true
  ) || jsonb_build_object(
    'creditAppliedCents', credit_used,
    'note', concat_ws(E'\n', nullif(new.preinvoice_data ->> 'note', ''),
      'Pritaikytas ankstesnio plano kreditas: ' || to_char(credit_used / 100.0, 'FM999999990.00') || ' EUR.')
  );

  update public.organizations
  set subscription_credit_cents = subscription_credit_cents - credit_used
  where id = new.organization_id;
  return new;
end;
$$;

revoke all on function public.apply_organization_subscription_credit() from public, anon, authenticated;

drop trigger if exists apply_organization_subscription_credit on public.workspace_subscriptions;
create trigger apply_organization_subscription_credit
  before insert or update of preinvoice_data on public.workspace_subscriptions
  for each row execute function public.apply_organization_subscription_credit();

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
    remaining_ratio := greatest(0, least(1,
      extract(epoch from (period_end - issue_time))
      / nullif(extract(epoch from (period_end - period_start)), 0)
    ));
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
        period_start, period_end, order_months, 'paid', auth.uid()
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
    period_start, period_end, new_order_code, issue_time, order_months, 'pending',
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
          'Proporcingai likusiam prenumeratos laikotarpiui apskaičiuotas plano kainų skirtumas.')
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

create or replace function public.guard_workspace_subscription_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_subscription public.workspace_subscriptions%rowtype;
  employee_limit integer;
  active_employee_count integer;
begin
  if public.is_creator() then return new; end if;

  select * into active_subscription
  from public.workspace_subscriptions
  where organization_id = new.organization_id
    and not (
      preinvoice_data ->> 'planChange' = 'true'
      and payment_status = 'pending'
      and (preinvoice_data ->> 'dueDate')::timestamptz < now()
    )
  order by created_at desc
  limit 1;
  if not found then raise exception 'Place a subscription order before changing workspace data'; end if;

  if active_subscription.status = 'pending' and active_subscription.order_code is null then
    raise exception 'Place a subscription order before changing workspace data';
  end if;
  if active_subscription.status in ('active', 'expired', 'canceled')
    and active_subscription.ends_at is not null
    and active_subscription.ends_at < now() then
    raise exception 'Workspace is read-only after subscription expiry';
  end if;
  if active_subscription.status in ('expired', 'canceled') and active_subscription.ends_at is null then
    raise exception 'Workspace has no active subscription';
  end if;

  if active_subscription.status in ('pending', 'active')
    and (active_subscription.ends_at is null or active_subscription.ends_at >= now()) then
    select coalesce(plan.employee_limit, 200) into employee_limit
    from public.subscription_plans as plan
    where plan.code = active_subscription.plan_code;
    employee_limit := coalesce(employee_limit, 200);
    select count(*) into active_employee_count
    from jsonb_array_elements(coalesce(new.data -> 'employees', '[]'::jsonb)) as employee(value)
    where employee.value ->> 'orgId' = new.organization_id::text
      and employee.value ->> 'status' = 'Aktyvus'
      and coalesce(employee.value ->> 'archivedAt', '') = '';
    if active_employee_count > employee_limit then
      raise exception 'The active employee limit for this plan has been exceeded';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_workspace_subscription_access() from public, anon, authenticated;

create or replace function public.has_workspace_read_access(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_organization_id is null
    or public.is_creator()
    or exists (
      select 1
      from (
        select subscription.status, subscription.ends_at
        from public.workspace_subscriptions as subscription
        where subscription.organization_id = target_organization_id
          and not (
            subscription.preinvoice_data ->> 'planChange' = 'true'
            and subscription.payment_status = 'pending'
            and (subscription.preinvoice_data ->> 'dueDate')::timestamptz < now()
          )
        order by subscription.created_at desc
        limit 1
      ) as latest_subscription
      where latest_subscription.status = 'pending'
        or (latest_subscription.status = 'active' and latest_subscription.ends_at is null)
        or (
          latest_subscription.status in ('active', 'canceled', 'expired')
          and latest_subscription.ends_at + interval '2 months' > now()
        )
    );
$$;

revoke all on function public.has_workspace_read_access(uuid) from public, anon;
grant execute on function public.has_workspace_read_access(uuid) to authenticated;

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
  result public.workspace_subscriptions%rowtype;
  final_number text;
  final_end timestamptz;
  final_document jsonb;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;

  select * into current_subscription from public.workspace_subscriptions
  where id = input_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if current_subscription.order_code is null or current_subscription.preinvoice_data is null then
    raise exception 'Subscription has no issued preliminary invoice';
  end if;
  if current_subscription.payment_status = 'paid' then
    raise exception 'This order is already marked as paid';
  end if;

  final_end := coalesce(
    input_end_at,
    case when current_subscription.preinvoice_data ->> 'planChange' = 'true'
      then (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz
      else current_subscription.ordered_at + make_interval(months => current_subscription.order_months)
    end
  );
  if final_end <= current_subscription.ordered_at then
    raise exception 'Subscription end date must be after the order date';
  end if;

  final_number := 'SF' || to_char(now() at time zone 'UTC', 'YYMMDD')
    || nextval('public.workspace_final_invoice_sequence')::text;
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
    'serviceEnd', final_end
  );

  update public.workspace_subscriptions
  set status = 'expired',
      ends_at = least(coalesce(ends_at, current_subscription.ordered_at), current_subscription.ordered_at),
      cancel_at_period_end = false,
      updated_at = now()
  where organization_id = current_subscription.organization_id
    and id <> current_subscription.id
    and status = 'active';

  update public.workspace_subscriptions
  set status = 'active',
      starts_at = case
        when preinvoice_data ->> 'planChange' = 'true' then starts_at
        else ordered_at
      end,
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
