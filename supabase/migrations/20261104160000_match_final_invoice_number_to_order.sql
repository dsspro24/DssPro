do $$
declare
  order_sequence_last bigint;
  order_sequence_called boolean;
  final_sequence_last bigint;
  final_sequence_called boolean;
  greatest_existing_number bigint;
begin
  select last_value, is_called into order_sequence_last, order_sequence_called
  from public.workspace_subscription_order_sequence;
  select last_value, is_called into final_sequence_last, final_sequence_called
  from public.workspace_final_invoice_sequence;

  select greatest(
    coalesce(max(substring(order_code from '^DSS[0-9]{6}([0-9]+)$')::bigint), 0),
    coalesce(max(substring(final_invoice_number from '^SF[0-9]{6}([0-9]+)$')::bigint), 0)
  )
  into greatest_existing_number
  from public.workspace_subscriptions;

  greatest_existing_number := greatest(
    greatest_existing_number,
    case when order_sequence_called then order_sequence_last else 0 end,
    case when final_sequence_called then final_sequence_last else 0 end
  );
  if greatest_existing_number > 0 then
    perform setval('public.workspace_subscription_order_sequence', greatest_existing_number, true);
  end if;
end;
$$;

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
  if current_subscription.order_code !~ '^DSS[0-9]{7,}$' then
    raise exception 'Subscription order number has an invalid format';
  end if;
  if current_subscription.payment_status = 'paid' then
    raise exception 'This order is already marked as paid';
  end if;

  final_end := coalesce(
    input_end_at,
    case when current_subscription.preinvoice_data ->> 'planChange' = 'true'
      then (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz
      else current_subscription.ordered_at + make_interval(months => current_subscription.order_months)
    end
  );
  if final_end <= current_subscription.ordered_at then
    raise exception 'Subscription end date must be after the order date';
  end if;

  final_number := 'SF' || substring(current_subscription.order_code from 4);
  if exists (
    select 1
    from public.workspace_subscriptions
    where final_invoice_number = final_number
      and id <> current_subscription.id
  ) then
    raise exception 'The matching final invoice number is already assigned to another subscription';
  end if;
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
      starts_at = case
        when preinvoice_data ->> 'planChange' = 'true' then starts_at
        else ordered_at
      end,
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
