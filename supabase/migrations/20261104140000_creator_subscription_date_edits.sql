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
      updated_at = now()
  where id = input_subscription_id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.creator_update_workspace_subscription(uuid, text, text, integer, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.creator_update_workspace_subscription(uuid, text, text, integer, timestamptz, timestamptz, boolean) to authenticated;
