drop index if exists public.subscription_plans_one_company_plan_idx;
create index if not exists subscription_plans_company_idx
  on public.subscription_plans (organization_id)
  where organization_id is not null;

drop policy if exists "Users can read applicable active subscription plans"
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
    if not found then raise exception 'Subscription not found'; end if;
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
  if input_subscription_id is null then
    delete from public.workspace_subscriptions
    where organization_id = input_organization_id
      and plan_code = selected_plan.code
      and status = 'pending'
      and order_code is null;
  end if;

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
  total_amount_cents := round(input_amount_cents::numeric * period_days / 30)::integer;
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

revoke all on function public.creator_upsert_company_custom_plan(uuid, uuid, integer, integer)
  from public, anon;
grant execute on function public.creator_upsert_company_custom_plan(uuid, uuid, integer, integer)
  to authenticated;

revoke all on function public.creator_issue_company_custom_plan_invoice(uuid, uuid, integer, integer, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.creator_issue_company_custom_plan_invoice(uuid, uuid, integer, integer, timestamptz, timestamptz)
  to authenticated;
