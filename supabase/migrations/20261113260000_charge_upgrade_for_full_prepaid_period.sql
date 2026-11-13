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
  period_end timestamptz;
  remaining_months numeric := 0;
  net_amount_cents integer;
  vat_amount_cents integer := 0;
  total_amount_cents integer;
  price_delta_cents integer;
  credit_cents integer := 0;
  prepaid_credit_cents integer := 0;
  remaining_credit_cents integer := 0;
  monthly_gross_price_cents integer := 0;
  extension_seconds numeric := 0;
  original_period_end timestamptz;
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
    period_end := issue_time + interval '5 days';
    total_amount_cents := selected_plan.amount_cents * order_months;
  else
    select max(paid_period.ends_at),
      coalesce(sum(paid_period.remaining_months), 0),
      round(coalesce(sum(
        (selected_plan.amount_cents - paid_period.amount_cents) * paid_period.remaining_months
      ), 0))::integer
    into period_end, remaining_months, price_delta_cents
    from (
      select paid_period.*,
        case
          when paid_period.plan_adjustment_data ->> 'type' = 'prepaid_downgrade'
            or paid_period.preinvoice_data ->> 'planChange' = 'true'
          then coalesce(
            nullif(paid_period.plan_adjustment_data ->> 'serviceMonths', '')::numeric,
            nullif(paid_period.preinvoice_data ->> 'serviceMonths', '')::numeric,
            extract(epoch from (paid_period.ends_at - paid_period.period_start)) / (30 * 86400.0)
          ) * paid_period.remaining_period_ratio
          when paid_period.ends_at > paid_period.period_start
            + make_interval(months => greatest(1, coalesce(paid_period.order_months, 1)))
          then greatest(0, extract(epoch from (
            paid_period.ends_at - greatest(paid_period.period_start, issue_time)
          )) / (30 * 86400.0))
          else greatest(1, coalesce(paid_period.order_months, 1))
            * paid_period.remaining_period_ratio
        end as remaining_months
      from (
        select subscription.*,
          coalesce(subscription.starts_at, subscription.ordered_at, issue_time) as period_start,
          greatest(0, least(1,
            extract(epoch from (
              subscription.ends_at
              - greatest(coalesce(subscription.starts_at, subscription.ordered_at, issue_time), issue_time)
            ))
            / nullif(extract(epoch from (
              subscription.ends_at - coalesce(subscription.starts_at, subscription.ordered_at, issue_time)
            )), 0)
          )) as remaining_period_ratio
        from public.workspace_subscriptions as subscription
        where subscription.organization_id = input_organization_id
          and subscription.status = 'active'
          and subscription.payment_status = 'paid'
          and subscription.ends_at > issue_time
      ) as paid_period
    ) as paid_period;
    period_end := coalesce(period_end, current_subscription.ends_at);
    if period_end is null or period_end <= issue_time then
      raise exception 'The current subscription period has ended';
    end if;
    if remaining_months <= 0 then
      raise exception 'The current subscription period has no prepaid time remaining';
    end if;
    if price_delta_cents < 0 then
      if billing_settings.vat_registered and not billing_settings.vat_included then
        credit_cents := abs(price_delta_cents)
          + round(abs(price_delta_cents) * billing_settings.vat_rate / 100.0)::integer;
      else
        credit_cents := abs(price_delta_cents);
      end if;
    end if;

    if price_delta_cents <= 0 then
      original_period_end := period_end;
      prepaid_credit_cents := greatest(
        0,
        coalesce(organization_record.subscription_credit_cents, 0) + credit_cents
      );
      monthly_gross_price_cents := selected_plan.amount_cents;
      if billing_settings.vat_registered and not billing_settings.vat_included then
        monthly_gross_price_cents := monthly_gross_price_cents
          + round(selected_plan.amount_cents * billing_settings.vat_rate / 100.0)::integer;
      end if;
      remaining_credit_cents := prepaid_credit_cents;

      if prepaid_credit_cents > 0 and monthly_gross_price_cents > 0 then
        extension_seconds := prepaid_credit_cents::numeric * 30 * 86400
          / monthly_gross_price_cents;
        period_end := period_end + make_interval(secs => extension_seconds::double precision);
        remaining_credit_cents := 0;
        update public.organizations
        set subscription_credit_cents = 0
        where id = input_organization_id;
      elsif prepaid_credit_cents > 0 then
        update public.organizations
        set subscription_credit_cents = prepaid_credit_cents
        where id = input_organization_id;
      end if;

      update public.workspace_subscriptions
      set status = 'expired',
          ends_at = case
            when starts_at is null or starts_at >= issue_time then ends_at
            else least(coalesce(ends_at, issue_time), issue_time)
          end,
          cancel_at_period_end = false,
          updated_at = issue_time
      where organization_id = input_organization_id
        and status = 'active';

      insert into public.workspace_subscriptions (
        organization_id, plan_code, plan_name, status, amount_cents, currency, is_addon,
        starts_at, ends_at, order_months, payment_status, plan_adjustment_data, created_by
      ) values (
        input_organization_id, selected_plan.code, selected_plan.name, 'active',
        selected_plan.amount_cents, 'EUR', current_subscription.is_addon,
        issue_time, period_end, order_months, 'paid',
        case when prepaid_credit_cents > 0 then jsonb_build_object(
          'type', 'prepaid_downgrade',
          'fromPlanCode', current_subscription.plan_code,
          'fromPlanName', current_subscription.plan_name,
          'toPlanCode', selected_plan.code,
          'toPlanName', selected_plan.name,
          'creditCents', prepaid_credit_cents,
          'extensionDays', round(extension_seconds / 86400, 2),
          'serviceMonths', remaining_months + extension_seconds / (30 * 86400.0),
          'originalEnd', original_period_end,
          'extendedEnd', period_end,
          'remainingCreditCents', remaining_credit_cents,
          'changedAt', issue_time
        ) end,
        auth.uid()
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
      'serviceMonths', case when initial_order then order_months else remaining_months end,
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
