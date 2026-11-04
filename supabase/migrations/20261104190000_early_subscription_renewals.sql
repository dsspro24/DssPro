create or replace function public.request_workspace_subscription(
  input_organization_id uuid,
  input_plan_code text,
  input_months integer default 1
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_employee_count integer;
  requested_plan public.subscription_plans%rowtype;
  existing_pending public.workspace_subscriptions%rowtype;
  active_order public.workspace_subscriptions%rowtype;
  billing_settings public.creator_billing_settings%rowtype;
  organization_record public.organizations%rowtype;
  result public.workspace_subscriptions%rowtype;
  addon boolean;
  is_renewal boolean := false;
  is_reactivation boolean := false;
  has_existing_pending boolean := false;
  service_start timestamptz;
  service_end timestamptz;
  new_order_code text;
  issue_time timestamptz := now();
  invoice_net_cents integer;
  invoice_vat_cents integer := 0;
  invoice_total_cents integer;
  invoice_data jsonb;
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Manager membership required';
  end if;
  if input_months is null or input_months < 1 or input_months > 36 then
    raise exception 'Order duration must be between 1 and 36 months';
  end if;

  select * into organization_record
  from public.organizations
  where id = input_organization_id
  for update;
  if not found then raise exception 'Organization not found'; end if;

  select coalesce(bool_or(is_addon), false) into addon
  from public.workspace_subscriptions
  where organization_id = input_organization_id;
  if addon and input_plan_code not in (
    'additional_workspace_20', 'additional_workspace_50',
    'additional_workspace_75', 'additional_workspace_200'
  ) then
    raise exception 'Additional workspace plan cannot be changed by the manager';
  elsif not addon and input_plan_code like 'additional_workspace_%' then
    raise exception 'Additional workspace orders require a new company workspace';
  end if;

  select count(*) into active_employee_count
  from public.organization_employees
  where organization_id = input_organization_id
    and archived_at is null
    and status = 'Aktyvus';
  if active_employee_count > 200 then
    raise exception 'Plans are available for up to 200 active employees';
  end if;

  select * into requested_plan
  from public.subscription_plans
  where code = input_plan_code and active;
  if not found then raise exception 'Selected subscription plan is unavailable'; end if;
  if coalesce(requested_plan.employee_limit, 200) < active_employee_count then
    raise exception 'The selected plan does not cover the active employee count';
  end if;

  if exists (
    select 1
    from public.workspace_subscriptions
    where organization_id = input_organization_id
      and status in ('active', 'pending')
      and order_code is not null
      and payment_status = 'pending'
  ) then
    raise exception 'An unpaid order already exists for this workspace. Cancel it before placing another order.';
  end if;

  select * into active_order
  from public.workspace_subscriptions
  where organization_id = input_organization_id
    and status = 'active'
    and payment_status = 'paid'
    and (ends_at is null or ends_at > issue_time)
  order by created_at desc
  limit 1
  for update;
  is_renewal := found;

  if is_renewal then
    service_start := coalesce(active_order.ends_at, issue_time);
  else
    select exists (
      select 1
      from public.workspace_subscriptions
      where organization_id = input_organization_id
        and payment_status = 'paid'
        and ends_at is not null
        and ends_at <= issue_time
        and ends_at + interval '2 months' > issue_time
    ) into is_reactivation;
    select * into existing_pending
    from public.workspace_subscriptions
    where organization_id = input_organization_id
      and status = 'pending'
      and order_code is null
    order by created_at desc
    limit 1
    for update;
    has_existing_pending := found;
    service_start := issue_time;
  end if;
  service_end := service_start + make_interval(months => input_months);

  select * into billing_settings
  from public.creator_billing_settings
  where id = true;
  if not found then
    billing_settings.issuer_details := '{}'::jsonb;
    billing_settings.vat_registered := false;
    billing_settings.vat_rate := 21;
    billing_settings.vat_included := false;
    billing_settings.invoice_note := '';
  end if;

  new_order_code := 'DSS' || to_char(issue_time at time zone 'UTC', 'YYMMDD')
    || nextval('public.workspace_subscription_order_sequence')::text;
  invoice_total_cents := requested_plan.amount_cents * input_months;
  if billing_settings.vat_registered then
    if billing_settings.vat_included then
      invoice_net_cents := round(invoice_total_cents / (1 + billing_settings.vat_rate / 100.0))::integer;
      invoice_vat_cents := invoice_total_cents - invoice_net_cents;
    else
      invoice_net_cents := invoice_total_cents;
      invoice_vat_cents := round(invoice_net_cents * billing_settings.vat_rate / 100.0)::integer;
      invoice_total_cents := invoice_net_cents + invoice_vat_cents;
    end if;
  else
    invoice_net_cents := invoice_total_cents;
  end if;

  invoice_data := jsonb_build_object(
    'documentType', 'Išankstinė sąskaita',
    'invoiceNumber', new_order_code,
    'orderCode', new_order_code,
    'issueDate', issue_time,
    'dueDate', issue_time + interval '5 days',
    'serviceStart', service_start,
    'serviceEnd', service_end,
    'months', input_months,
    'renewal', is_renewal,
    'reactivation', is_reactivation,
    'issuer', billing_settings.issuer_details,
    'recipient', jsonb_build_object('name', organization_record.name, 'companyCode', organization_record.company_code),
    'planName', requested_plan.name,
    'unitPriceCents', requested_plan.amount_cents,
    'netAmountCents', invoice_net_cents,
    'vatAmountCents', invoice_vat_cents,
    'totalAmountCents', invoice_total_cents,
    'vatRegistered', billing_settings.vat_registered,
    'vatRate', billing_settings.vat_rate,
    'vatIncluded', billing_settings.vat_included,
    'note', billing_settings.invoice_note
  );

  if is_renewal then
    insert into public.workspace_subscriptions (
      organization_id, plan_code, plan_name, status, amount_cents, currency, is_addon,
      starts_at, ends_at, order_code, ordered_at, order_months, payment_status,
      preinvoice_data, created_by
    ) values (
      input_organization_id, requested_plan.code, requested_plan.name, 'active',
      requested_plan.amount_cents, 'EUR', addon,
      coalesce(active_order.starts_at, issue_time), active_order.ends_at,
      new_order_code, issue_time, input_months,
      'pending', invoice_data, auth.uid()
    )
    returning * into result;
  elsif has_existing_pending then
    update public.workspace_subscriptions
    set plan_code = requested_plan.code,
        plan_name = requested_plan.name,
        amount_cents = requested_plan.amount_cents,
        is_addon = addon,
        status = 'active',
        starts_at = issue_time,
        ends_at = issue_time + interval '5 days',
        cancel_at_period_end = false,
        order_code = new_order_code,
        ordered_at = issue_time,
        order_months = input_months,
        payment_status = 'pending',
        preinvoice_data = invoice_data,
        updated_at = issue_time
    where id = existing_pending.id
    returning * into result;
  else
    insert into public.workspace_subscriptions (
      organization_id, plan_code, plan_name, status, amount_cents, is_addon,
      starts_at, ends_at, order_code, ordered_at, order_months, payment_status,
      preinvoice_data, created_by
    ) values (
      input_organization_id, requested_plan.code, requested_plan.name, 'active',
      requested_plan.amount_cents, addon, issue_time, issue_time + interval '5 days',
      new_order_code, issue_time, input_months, 'pending', invoice_data, auth.uid()
    )
    returning * into result;
  end if;

  return result;
end;
$$;

revoke all on function public.request_workspace_subscription(uuid, text, integer) from public, anon;
grant execute on function public.request_workspace_subscription(uuid, text, integer) to authenticated;

create or replace function public.manager_cancel_workspace_subscription_order(
  input_subscription_id uuid
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_subscription public.workspace_subscriptions%rowtype;
  result public.workspace_subscriptions%rowtype;
  is_renewal boolean;
begin
  select * into current_subscription
  from public.workspace_subscriptions
  where id = input_subscription_id
  for update;
  if not found then raise exception 'Subscription order not found'; end if;
  if not public.is_organization_member(current_subscription.organization_id, array['manager']) then
    raise exception 'Manager membership required';
  end if;
  if current_subscription.order_code is null or current_subscription.preinvoice_data is null then
    raise exception 'Subscription order has no preliminary invoice';
  end if;
  if current_subscription.payment_status <> 'pending' then
    raise exception 'Only an unpaid order can be canceled';
  end if;
  if current_subscription.preinvoice_data ->> 'planChange' = 'true' then
    raise exception 'A plan change order cannot be canceled here';
  end if;
  if current_subscription.status = 'canceled' then
    raise exception 'This order is already canceled';
  end if;

  is_renewal := current_subscription.preinvoice_data ->> 'renewal' = 'true';
  perform set_config('dss.allow_renewal_order_cancel', 'true', true);
  update public.workspace_subscriptions
  set status = 'canceled',
      ends_at = case when is_renewal then ends_at else now() end,
      cancel_at_period_end = false,
      updated_at = now()
  where id = input_subscription_id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.manager_cancel_workspace_subscription_order(uuid) from public, anon;
grant execute on function public.manager_cancel_workspace_subscription_order(uuid) to authenticated;

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
  final_start timestamptz;
  final_end timestamptz;
  final_document jsonb;
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

  is_renewal := current_subscription.preinvoice_data ->> 'renewal' = 'true';
  is_reactivation := current_subscription.preinvoice_data ->> 'reactivation' = 'true';
  if is_renewal or is_reactivation then
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
    final_start := coalesce(current_subscription.starts_at, current_subscription.ordered_at);
    final_end := coalesce(
      input_end_at,
      case when current_subscription.preinvoice_data ->> 'planChange' = 'true'
        then (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz
        else current_subscription.ordered_at + make_interval(months => current_subscription.order_months)
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
    'serviceEnd', final_end
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
    and status = 'active';

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

create or replace function public.guard_pending_renewal_order_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'canceled'
    and new.status = 'canceled'
    and old.payment_status = 'pending'
    and old.preinvoice_data ->> 'renewal' = 'true'
    and coalesce(current_setting('dss.allow_renewal_order_cancel', true), '') <> 'true' then
    raise exception 'Cancel the pending renewal order through the manager cancellation action first';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_pending_renewal_order_cancel() from public, anon, authenticated;

drop trigger if exists guard_pending_renewal_order_cancel on public.workspace_subscriptions;
create trigger guard_pending_renewal_order_cancel
  before update of status on public.workspace_subscriptions
  for each row execute function public.guard_pending_renewal_order_cancel();

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
      preinvoice_data ->> 'renewal' = 'true'
      and payment_status = 'pending'
    )
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
  if active_subscription.status = 'pending' and (
    coalesce(active_subscription.ends_at, (active_subscription.preinvoice_data ->> 'dueDate')::timestamptz) is null
    or coalesce(active_subscription.ends_at, (active_subscription.preinvoice_data ->> 'dueDate')::timestamptz) < now()
  ) then
    raise exception 'Workspace is read-only after subscription expiry';
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
        select subscription.status, subscription.ends_at, subscription.order_code,
          (subscription.preinvoice_data ->> 'dueDate')::timestamptz as preinvoice_due_at
        from public.workspace_subscriptions as subscription
        where subscription.organization_id = target_organization_id
          and not (
            subscription.preinvoice_data ->> 'renewal' = 'true'
            and subscription.payment_status = 'pending'
          )
          and not (
            subscription.preinvoice_data ->> 'planChange' = 'true'
            and subscription.payment_status = 'pending'
            and (subscription.preinvoice_data ->> 'dueDate')::timestamptz < now()
          )
        order by subscription.created_at desc
        limit 1
      ) as latest_subscription
      where (
          latest_subscription.status = 'pending'
          and latest_subscription.order_code is not null
          and coalesce(latest_subscription.ends_at, latest_subscription.preinvoice_due_at) + interval '2 months' > now()
        )
        or (latest_subscription.status = 'active' and latest_subscription.ends_at is null)
        or (
          latest_subscription.status in ('active', 'canceled', 'expired')
          and latest_subscription.ends_at + interval '2 months' > now()
        )
    );
$$;

revoke all on function public.has_workspace_read_access(uuid) from public, anon;
grant execute on function public.has_workspace_read_access(uuid) to authenticated;
