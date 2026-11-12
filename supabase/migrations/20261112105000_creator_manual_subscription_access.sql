alter table public.workspace_subscriptions
  add column if not exists manual_access_override boolean not null default false;

create or replace function public.creator_update_workspace_subscription(
  input_subscription_id uuid,
  input_status text,
  input_plan_code text,
  input_amount_cents integer,
  input_starts_at timestamptz,
  input_ends_at timestamptz,
  input_cancel_at_period_end boolean
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_subscription public.workspace_subscriptions%rowtype;
  selected_plan public.subscription_plans%rowtype;
  result public.workspace_subscriptions%rowtype;
  input_plan_is_addon boolean := input_plan_code in (
    'additional_workspace_20', 'additional_workspace_50',
    'additional_workspace_75', 'additional_workspace_200', 'additional_workspace'
  );
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if input_status not in ('pending', 'active', 'canceled', 'expired') then
    raise exception 'Invalid subscription status';
  end if;
  if input_amount_cents < 0 then raise exception 'Price cannot be negative'; end if;
  if input_ends_at is not null and input_starts_at is not null and input_ends_at <= input_starts_at then
    raise exception 'End date must be after start date';
  end if;

  select * into current_subscription from public.workspace_subscriptions
  where id = input_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if current_subscription.is_addon <> input_plan_is_addon then
    raise exception 'Subscription plan type cannot be changed';
  end if;
  select * into selected_plan from public.subscription_plans where code = input_plan_code;
  if not found then raise exception 'Subscription plan not found'; end if;

  if input_status = 'active' then
    if input_starts_at is null or input_ends_at is null then
      raise exception 'Active subscriptions require start and end dates';
    end if;
    update public.workspace_subscriptions
    set status = 'expired',
        ends_at = greatest(
          least(coalesce(ends_at, input_starts_at), input_starts_at),
          coalesce(starts_at, input_starts_at) + interval '1 microsecond'
        ),
        cancel_at_period_end = false,
        manual_access_override = false,
        updated_at = now()
    where organization_id = current_subscription.organization_id
      and id <> input_subscription_id
      and status = 'active';
  end if;

  update public.workspace_subscriptions
  set status = input_status,
      plan_code = input_plan_code,
      plan_name = selected_plan.name,
      amount_cents = input_amount_cents,
      starts_at = input_starts_at,
      ends_at = input_ends_at,
      cancel_at_period_end = coalesce(input_cancel_at_period_end, false),
      manual_access_override = input_status = 'active',
      updated_at = now()
  where id = input_subscription_id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.creator_update_workspace_subscription(uuid, text, text, integer, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.creator_update_workspace_subscription(uuid, text, text, integer, timestamptz, timestamptz, boolean) to authenticated;

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
    and (
      manual_access_override
      or not (preinvoice_data ->> 'renewal' = 'true' and payment_status = 'pending')
    )
    and (
      manual_access_override
      or not (
        preinvoice_data ->> 'planChange' = 'true'
        and payment_status = 'pending'
        and (preinvoice_data ->> 'dueDate')::timestamptz < now()
      )
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
        select subscription.status, subscription.ends_at, subscription.payment_status,
          subscription.preinvoice_data, subscription.manual_access_override
        from public.workspace_subscriptions as subscription
        where subscription.organization_id = target_organization_id
          and (
            subscription.manual_access_override
            or not (
              subscription.order_code is not null
              and coalesce(subscription.payment_status, '') <> 'paid'
              and subscription.preinvoice_data ->> 'initialTrialAccess' is distinct from 'true'
              and subscription.preinvoice_data ->> 'planChange' is distinct from 'true'
            )
          )
          and (
            subscription.manual_access_override
            or not (
              subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
              and subscription.payment_status <> 'paid'
              and not (
                subscription.status = 'active'
                and subscription.ends_at > now()
              )
            )
          )
          and (
            subscription.manual_access_override
            or not (
              subscription.preinvoice_data ->> 'renewal' = 'true'
              and subscription.payment_status = 'pending'
            )
          )
          and (
            subscription.manual_access_override
            or not (
              subscription.preinvoice_data ->> 'planChange' = 'true'
              and subscription.payment_status = 'pending'
              and (subscription.preinvoice_data ->> 'dueDate')::timestamptz < now()
            )
          )
        order by subscription.created_at desc
        limit 1
      ) as latest_subscription
      where (
          latest_subscription.status = 'active'
          and latest_subscription.ends_at is null
        )
        or (
          latest_subscription.status = 'active'
          and latest_subscription.ends_at > now()
          and latest_subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
          and latest_subscription.payment_status = 'pending'
        )
        or (
          latest_subscription.status in ('active', 'canceled', 'expired')
          and latest_subscription.ends_at + interval '2 months' > now()
          and (
            latest_subscription.manual_access_override
            or not (
              latest_subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
              and latest_subscription.payment_status <> 'paid'
            )
          )
        )
    );
$$;

revoke all on function public.has_workspace_read_access(uuid) from public, anon;
grant execute on function public.has_workspace_read_access(uuid) to authenticated;
