alter table public.workspace_subscriptions
  drop constraint if exists workspace_subscriptions_payment_status_check;

alter table public.workspace_subscriptions
  add constraint workspace_subscriptions_payment_status_check
  check (payment_status in ('pending', 'paid', 'canceled'));

update public.workspace_subscriptions
set payment_status = 'canceled',
    updated_at = now()
where status = 'canceled'
  and payment_status = 'pending'
  and order_code is not null;

create or replace function public.close_canceled_workspace_subscription_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'canceled'
    and new.payment_status = 'pending'
    and new.order_code is not null then
    new.payment_status := 'canceled';
  end if;
  return new;
end;
$$;

revoke all on function public.close_canceled_workspace_subscription_order() from public, anon, authenticated;

drop trigger if exists close_canceled_workspace_subscription_order on public.workspace_subscriptions;
create trigger close_canceled_workspace_subscription_order
  before insert or update on public.workspace_subscriptions
  for each row execute function public.close_canceled_workspace_subscription_order();
