alter table public.subscription_plans
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

create index if not exists subscription_plans_company_idx
  on public.subscription_plans (organization_id)
  where organization_id is not null;

drop policy if exists "Authenticated users can read active subscription plans"
  on public.subscription_plans;
create policy "Users can read applicable active subscription plans"
  on public.subscription_plans for select to authenticated
  using (
    (active and organization_id is null)
    or public.is_creator()
    or (
      organization_id is not null
      and public.is_organization_member(organization_id, array['manager'])
      and active
      and exists (
        select 1
        from public.workspace_subscriptions as current_subscription
        where current_subscription.id = (
          select subscription.id
          from public.workspace_subscriptions as subscription
          where subscription.organization_id = subscription_plans.organization_id
            and not (
              subscription.preinvoice_data ->> 'planChange' = 'true'
              and subscription.payment_status = 'pending'
              and (subscription.preinvoice_data ->> 'dueDate')::timestamptz < now()
            )
          order by subscription.created_at desc, subscription.id desc
          limit 1
        )
          and current_subscription.plan_code = subscription_plans.code
      )
    )
  );

drop policy if exists "Anyone can read active subscription plans"
  on public.subscription_plans;
create policy "Anyone can read public active subscription plans"
  on public.subscription_plans for select to anon
  using (active and organization_id is null);

create or replace function public.guard_subscription_plan_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_organization_id uuid;
begin
  select plan.organization_id into plan_organization_id
  from public.subscription_plans as plan
  where plan.code = new.plan_code;
  if not found then raise exception 'Subscription plan not found'; end if;
  if plan_organization_id is not null
    and plan_organization_id <> new.organization_id then
    raise exception 'This subscription plan belongs to another organization';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_subscription_plan_organization() from public, anon, authenticated;

drop trigger if exists guard_subscription_plan_organization on public.workspace_subscriptions;
create trigger guard_subscription_plan_organization
  before insert or update of organization_id, plan_code on public.workspace_subscriptions
  for each row execute function public.guard_subscription_plan_organization();

create or replace function public.creator_upsert_company_custom_plan(
  input_organization_id uuid,
  input_subscription_id uuid,
  input_amount_cents integer,
  input_employee_limit integer
)
returns public.subscription_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_record public.organizations%rowtype;
  current_subscription public.workspace_subscriptions%rowtype;
  result public.subscription_plans%rowtype;
  active_employee_count integer;
  custom_plan_code text;
  custom_plan_name text;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if input_amount_cents is null or input_amount_cents < 0 then
    raise exception 'Price cannot be negative';
  end if;
  if input_employee_limit is null or input_employee_limit < 1 then
    raise exception 'Employee limit must be at least one';
  end if;

  select * into organization_record
  from public.organizations
  where id = input_organization_id
  for update;
  if not found then raise exception 'Organization not found'; end if;

  if input_subscription_id is null then
    if exists (
      select 1 from public.workspace_subscriptions
      where organization_id = input_organization_id
    ) then
      raise exception 'Select the company subscription to update';
    end if;
  else
    select * into current_subscription
    from public.workspace_subscriptions
    where id = input_subscription_id
    for update;
    if not found then
      raise exception 'Subscription not found';
    end if;
    if current_subscription.organization_id <> input_organization_id then
      raise exception 'Subscription does not belong to this organization';
    end if;
    if current_subscription.is_addon then
      raise exception 'Individual plans cannot be assigned to additional workspaces';
    end if;
  end if;

  select count(*) into active_employee_count
  from public.organization_employees
  where organization_id = input_organization_id
    and archived_at is null
    and status = 'Aktyvus';
  if active_employee_count > input_employee_limit then
    raise exception 'Employee limit cannot be lower than the active employee count';
  end if;

  custom_plan_code := 'individual_' || replace(input_organization_id::text, '-', '')
    || '_' || replace(gen_random_uuid()::text, '-', '');
  custom_plan_name := format('Individualus planas (iki %s darbuotojų)', input_employee_limit);

  insert into public.subscription_plans (
    code, name, amount_cents, currency, billing_interval, employee_limit,
    features, active, organization_id
  ) values (
    custom_plan_code, custom_plan_name, input_amount_cents, 'EUR', 'month',
    input_employee_limit, '{"documents": true, "reports": true}'::jsonb,
    true, input_organization_id
  )
  returning * into result;

  if input_subscription_id is null then
    insert into public.workspace_subscriptions (
      organization_id, plan_code, plan_name, status, amount_cents, currency,
      is_addon, created_by
    ) values (
      input_organization_id, result.code, result.name, 'pending',
      result.amount_cents, result.currency, false, auth.uid()
    );
  end if;

  return result;
end;
$$;

revoke all on function public.creator_upsert_company_custom_plan(uuid, uuid, integer, integer)
  from public, anon;
grant execute on function public.creator_upsert_company_custom_plan(uuid, uuid, integer, integer)
  to authenticated;

create or replace function public.creator_issue_company_custom_plan_invoice(
  input_subscription_id uuid,
  input_organization_id uuid,
  input_amount_cents integer,
  input_employee_limit integer,
  input_starts_at timestamptz,
  input_ends_at timestamptz
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_record public.organizations%rowtype;
  selected_plan public.subscription_plans%rowtype;
  billing_settings public.creator_billing_settings%rowtype;
  result public.workspace_subscriptions%rowtype;
  issue_time timestamptz := now();
  period_days integer;
  total_amount_cents integer;
  net_amount_cents integer;
  vat_amount_cents integer := 0;
  new_order_code text;
  invoice_data jsonb;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if input_starts_at is null or input_ends_at is null or input_ends_at <= input_starts_at then
    raise exception 'A valid custom-plan period is required';
  end if;
  if input_starts_at > issue_time or input_ends_at <= issue_time then
    raise exception 'Immediate custom-plan changes require a current start date and a future end date';
  end if;

  select * into organization_record
  from public.organizations
  where id = input_organization_id
  for update;
  if not found then raise exception 'Organization not found'; end if;

  if exists (
    select 1
    from public.workspace_subscriptions
    where organization_id = input_organization_id
      and status in ('active', 'pending')
      and order_code is not null
      and payment_status = 'pending'
      and not (
        preinvoice_data ->> 'planChange' = 'true'
        and (preinvoice_data ->> 'dueDate')::timestamptz < issue_time
      )
  ) then
    raise exception 'An unpaid subscription order already exists for this organization';
  end if;

  select * into selected_plan
  from public.creator_upsert_company_custom_plan(
    input_organization_id,
    input_subscription_id,
    input_amount_cents,
    input_employee_limit
  );

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

  period_days := greatest(1, ceil(extract(epoch from (input_ends_at - input_starts_at)) / 86400)::integer);
  total_amount_cents := round(input_amount_cents * period_days / 30.0)::integer;
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

  new_order_code := 'DSS' || to_char(issue_time at time zone 'UTC', 'YYMMDD')
    || nextval('public.workspace_subscription_order_sequence')::text;
  invoice_data := jsonb_build_object(
    'documentType', 'Išankstinė sąskaita',
    'invoiceNumber', new_order_code,
    'orderCode', new_order_code,
    'issueDate', issue_time,
    'dueDate', issue_time + interval '5 days',
    'serviceStart', input_starts_at,
    'serviceEnd', input_ends_at,
    'months', round((period_days / 30.0)::numeric, 2),
    'periodDays', period_days,
    'planChange', true,
    'individualPlan', true,
    'issuer', billing_settings.issuer_details,
    'recipient', jsonb_build_object('name', organization_record.name, 'companyCode', organization_record.company_code),
    'planName', selected_plan.name,
    'unitPriceCents', input_amount_cents,
    'netAmountCents', net_amount_cents,
    'vatAmountCents', vat_amount_cents,
    'totalAmountCents', total_amount_cents,
    'vatRegistered', billing_settings.vat_registered,
    'vatRate', billing_settings.vat_rate,
    'vatIncluded', billing_settings.vat_included,
    'note', concat_ws(E'\n', nullif(billing_settings.invoice_note, ''),
      format('Individualaus plano suma apskaičiuota proporcingai %s galiojimo dienų, taikant 30 dienų mėnesį.', period_days))
  );

  insert into public.workspace_subscriptions (
    organization_id, plan_code, plan_name, status, amount_cents, currency, is_addon,
    starts_at, ends_at, order_code, ordered_at, order_months, payment_status,
    preinvoice_data, created_by
  ) values (
    input_organization_id, selected_plan.code, selected_plan.name, 'active',
    input_amount_cents, 'EUR', false, input_starts_at, input_ends_at,
    new_order_code, issue_time, greatest(1, ceil(period_days / 30.0)::integer),
    'pending', invoice_data, auth.uid()
  )
  returning * into result;
  return result;
end;
$$;

revoke all on function public.creator_issue_company_custom_plan_invoice(uuid, uuid, integer, integer, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.creator_issue_company_custom_plan_invoice(uuid, uuid, integer, integer, timestamptz, timestamptz)
  to authenticated;

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

  select * into requested_plan
  from public.subscription_plans
  where code = input_plan_code
    and (
      active
      or exists (
        select 1
        from public.workspace_subscriptions as current_subscription
        where current_subscription.organization_id = input_organization_id
          and current_subscription.plan_code = subscription_plans.code
          and current_subscription.status = 'active'
          and (current_subscription.ends_at is null or current_subscription.ends_at > issue_time)
          and not (
            current_subscription.preinvoice_data ->> 'planChange' = 'true'
            and current_subscription.payment_status = 'pending'
            and (current_subscription.preinvoice_data ->> 'dueDate')::timestamptz < issue_time
          )
      )
    );
  if not found then raise exception 'Selected subscription plan is unavailable'; end if;
  if requested_plan.organization_id is not null
    and requested_plan.organization_id <> input_organization_id then
    raise exception 'Selected subscription plan belongs to another organization';
  end if;
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
      and not (
        preinvoice_data ->> 'planChange' = 'true'
        and (preinvoice_data ->> 'dueDate')::timestamptz < issue_time
      )
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
