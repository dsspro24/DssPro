create or replace function public.creator_cancel_workspace_subscription_order(
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
  is_individual_plan boolean;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;

  select * into current_subscription
  from public.workspace_subscriptions
  where id = input_subscription_id
  for update;
  if not found then raise exception 'Subscription order not found'; end if;
  if current_subscription.order_code is null or current_subscription.preinvoice_data is null then
    raise exception 'Subscription order has no preliminary invoice';
  end if;
  if current_subscription.payment_status <> 'pending' then
    raise exception 'Only an unpaid order can be canceled';
  end if;
  if current_subscription.preinvoice_data ->> 'planChange' = 'true'
    and current_subscription.preinvoice_data ->> 'individualPlan' is distinct from 'true' then
    raise exception 'A plan change order cannot be canceled here';
  end if;
  if current_subscription.status = 'canceled' then
    raise exception 'This order is already canceled';
  end if;

  is_renewal := current_subscription.preinvoice_data ->> 'renewal' = 'true';
  is_individual_plan := current_subscription.preinvoice_data ->> 'individualPlan' = 'true';
  perform set_config('dss.allow_renewal_order_cancel', 'true', true);
  update public.workspace_subscriptions
  set status = 'canceled',
      ends_at = case when is_renewal then ends_at else now() end,
      cancel_at_period_end = false,
      manual_access_override = case when is_individual_plan then false else manual_access_override end,
      updated_at = now()
  where id = input_subscription_id
  returning * into result;

  if is_individual_plan then
    update public.subscription_plans
    set active = false,
        updated_at = now()
    where code = current_subscription.plan_code
      and organization_id = current_subscription.organization_id;

    update public.workspace_subscriptions
    set manual_access_override = true,
        updated_at = now()
    where id = (
      select subscription.id
      from public.workspace_subscriptions as subscription
      where subscription.organization_id = current_subscription.organization_id
        and subscription.id <> current_subscription.id
        and subscription.status = 'active'
        and (subscription.ends_at is null or subscription.ends_at > now())
        and not (
          subscription.order_code is not null
          and subscription.payment_status = 'pending'
        )
      order by subscription.manual_access_override desc, subscription.created_at desc, subscription.id desc
      limit 1
      for update
    );
  end if;

  return result;
end;
$$;

revoke all on function public.creator_cancel_workspace_subscription_order(uuid) from public, anon;
grant execute on function public.creator_cancel_workspace_subscription_order(uuid) to authenticated;

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
              subscription.preinvoice_data ->> 'individualPlan' = 'true'
              and subscription.status = 'canceled'
            )
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
