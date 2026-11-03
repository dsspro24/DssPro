create or replace function public.creator_delete_subscription_invoice(
  input_subscription_id uuid,
  input_invoice_type text
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_subscription public.workspace_subscriptions%rowtype;
  result public.workspace_subscriptions%rowtype;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if input_invoice_type is null or input_invoice_type not in ('preinvoice', 'final') then
    raise exception 'Invalid invoice type';
  end if;

  select * into current_subscription
  from public.workspace_subscriptions
  where id = input_subscription_id
  for update;
  if not found then raise exception 'Subscription not found'; end if;

  if input_invoice_type = 'preinvoice' then
    if current_subscription.preinvoice_data is null then
      raise exception 'Preliminary invoice not found';
    end if;
    if current_subscription.payment_status = 'pending' then
      raise exception 'Cannot delete a preliminary invoice while its order is awaiting payment';
    end if;
    update public.workspace_subscriptions
    set preinvoice_data = null,
        updated_at = now()
    where id = input_subscription_id
    returning * into result;
  else
    if current_subscription.final_invoice_data is null then
      raise exception 'Final invoice not found';
    end if;
    update public.workspace_subscriptions
    set final_invoice_data = null,
        final_invoice_number = null,
        updated_at = now()
    where id = input_subscription_id
    returning * into result;
  end if;

  return result;
end;
$$;

revoke all on function public.creator_delete_subscription_invoice(uuid, text) from public, anon;
grant execute on function public.creator_delete_subscription_invoice(uuid, text) to authenticated;
