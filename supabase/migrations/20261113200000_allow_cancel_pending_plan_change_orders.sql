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
  is_reactivation boolean;
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
  if current_subscription.status = 'canceled' then
    raise exception 'This order is already canceled';
  end if;

  is_renewal := current_subscription.preinvoice_data ->> 'renewal' = 'true';
  is_reactivation := current_subscription.preinvoice_data ->> 'reactivation' = 'true';
  perform set_config('dss.allow_renewal_order_cancel', 'true', true);
  update public.workspace_subscriptions
  set status = 'canceled',
      ends_at = case when is_renewal or is_reactivation then ends_at else now() end,
      cancel_at_period_end = false,
      updated_at = now()
  where id = input_subscription_id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.manager_cancel_workspace_subscription_order(uuid) from public, anon;
grant execute on function public.manager_cancel_workspace_subscription_order(uuid) to authenticated;
