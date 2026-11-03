create sequence if not exists public.workspace_subscription_order_sequence;
create sequence if not exists public.workspace_final_invoice_sequence;

create table if not exists public.creator_billing_settings (
  id boolean primary key default true check (id),
  issuer_details jsonb not null default '{}'::jsonb,
  vat_registered boolean not null default false,
  vat_rate numeric(5, 2) not null default 21 check (vat_rate >= 0 and vat_rate <= 100),
  vat_included boolean not null default false,
  invoice_note text not null default '',
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(issuer_details) = 'object')
);

alter table public.creator_billing_settings enable row level security;
revoke all on public.creator_billing_settings from anon, authenticated;
grant select on public.creator_billing_settings to authenticated;

create policy "Creators can read billing settings"
  on public.creator_billing_settings for select to authenticated
  using (public.is_creator());

alter table public.workspace_subscriptions
  add column if not exists order_code text unique,
  add column if not exists ordered_at timestamptz,
  add column if not exists order_months integer not null default 1 check (order_months between 1 and 36),
  add column if not exists payment_status text not null default 'pending' check (payment_status in ('pending', 'paid')),
  add column if not exists preinvoice_data jsonb,
  add column if not exists final_invoice_number text unique,
  add column if not exists final_invoice_data jsonb,
  add column if not exists paid_at timestamptz;

update public.workspace_subscriptions
set payment_status = 'paid'
where status in ('active', 'canceled', 'expired')
  and order_code is null;

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

create or replace function public.creator_save_billing_settings(
  input_issuer_details jsonb,
  input_vat_registered boolean,
  input_vat_rate numeric,
  input_vat_included boolean,
  input_invoice_note text
)
returns public.creator_billing_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_issuer_details jsonb;
  result public.creator_billing_settings%rowtype;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if jsonb_typeof(input_issuer_details) <> 'object' then
    raise exception 'Issuer details must be an object';
  end if;
  if input_vat_rate < 0 or input_vat_rate > 100 then
    raise exception 'VAT rate must be between 0 and 100';
  end if;

  select coalesce(jsonb_object_agg(entry.key, to_jsonb(btrim(entry.value)) order by entry.key), '{}'::jsonb)
  into cleaned_issuer_details
  from jsonb_each_text(input_issuer_details) as entry(key, value)
  where nullif(btrim(entry.value), '') is not null;

  insert into public.creator_billing_settings (
    id, issuer_details, vat_registered, vat_rate, vat_included, invoice_note, updated_at
  ) values (
    true, cleaned_issuer_details, coalesce(input_vat_registered, false),
    coalesce(input_vat_rate, 21), coalesce(input_vat_included, false),
    btrim(coalesce(input_invoice_note, '')), now()
  )
  on conflict (id) do update
  set issuer_details = excluded.issuer_details,
      vat_registered = excluded.vat_registered,
      vat_rate = excluded.vat_rate,
      vat_included = excluded.vat_included,
      invoice_note = excluded.invoice_note,
      updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.creator_save_billing_settings(jsonb, boolean, numeric, boolean, text) from public, anon;
grant execute on function public.creator_save_billing_settings(jsonb, boolean, numeric, boolean, text) to authenticated;

drop function if exists public.request_workspace_subscription(uuid, text);

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
  new_order_code text;
  issue_time timestamptz := now();
  invoice_net_cents integer;
  invoice_vat_cents integer := 0;
  invoice_total_cents integer;
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

  select * into requested_plan from public.subscription_plans
  where code = input_plan_code and active;
  if not found then raise exception 'Selected subscription plan is unavailable'; end if;
  if coalesce(requested_plan.employee_limit, 200) < active_employee_count then
    raise exception 'The selected plan does not cover the active employee count';
  end if;

  select * into active_order
  from public.workspace_subscriptions
  where organization_id = input_organization_id
    and status = 'active'
    and (ends_at is null or ends_at > issue_time)
  order by created_at desc
  limit 1
  for update;
  if found then
    if active_order.order_code is not null and active_order.payment_status = 'pending' then
      raise exception 'An unpaid order already exists for this workspace';
    end if;
    raise exception 'The current subscription is still active';
  end if;

  select * into billing_settings from public.creator_billing_settings where id = true;
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

  select * into existing_pending
  from public.workspace_subscriptions
  where organization_id = input_organization_id and status = 'pending'
  order by created_at desc limit 1 for update;

  if found then
    update public.workspace_subscriptions
    set plan_code = requested_plan.code,
        plan_name = requested_plan.name,
        amount_cents = requested_plan.amount_cents,
        status = 'active',
        starts_at = issue_time,
        ends_at = issue_time + interval '5 days',
        cancel_at_period_end = false,
        order_code = new_order_code,
        ordered_at = issue_time,
        order_months = input_months,
        payment_status = 'pending',
        preinvoice_data = jsonb_build_object(
          'documentType', 'Išankstinė sąskaita',
          'invoiceNumber', new_order_code,
          'orderCode', new_order_code,
          'issueDate', issue_time,
          'dueDate', issue_time + interval '5 days',
          'serviceStart', issue_time,
          'serviceEnd', issue_time + make_interval(months => input_months),
          'months', input_months,
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
        ),
        updated_at = now()
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
      new_order_code, issue_time, input_months, 'pending',
      jsonb_build_object(
        'documentType', 'Išankstinė sąskaita',
        'invoiceNumber', new_order_code,
        'orderCode', new_order_code,
        'issueDate', issue_time,
        'dueDate', issue_time + interval '5 days',
        'serviceStart', issue_time,
        'serviceEnd', issue_time + make_interval(months => input_months),
        'months', input_months,
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
      ),
      auth.uid()
    ) returning * into result;
  end if;

  return result;
end;
$$;

revoke all on function public.request_workspace_subscription(uuid, text, integer) from public, anon;
grant execute on function public.request_workspace_subscription(uuid, text, integer) to authenticated;

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
    current_subscription.ordered_at
      + make_interval(months => current_subscription.order_months)
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
      starts_at = ordered_at,
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
