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
  billing_settings public.creator_billing_settings%rowtype;
  result public.workspace_subscriptions%rowtype;
  final_number text;
  final_start timestamptz;
  final_end timestamptz;
  final_document jsonb;
  final_issuer jsonb;
  is_renewal boolean;
  is_reactivation boolean;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;

  select * into current_subscription
  from public.workspace_subscriptions
  where id = input_subscription_id
  for update;
  if not found then raise exception 'Subscription not found'; end if;
  if current_subscription.order_code is null or current_subscription.preinvoice_data is null then
    raise exception 'Subscription has no issued preliminary invoice';
  end if;
  if current_subscription.status = 'canceled' then
    raise exception 'A canceled order cannot be marked as paid';
  end if;
  if current_subscription.payment_status = 'paid' then
    raise exception 'This order is already marked as paid';
  end if;
  if current_subscription.order_code !~ '^DSS[0-9]{7,}$' then
    raise exception 'Subscription order number has an invalid format';
  end if;

  select * into billing_settings
  from public.creator_billing_settings
  where id = true;
  if not found then
    billing_settings.issuer_details := '{}'::jsonb;
  end if;
  final_issuer := coalesce(
    nullif(billing_settings.issuer_details, '{}'::jsonb),
    current_subscription.preinvoice_data -> 'issuer',
    '{}'::jsonb
  );

  is_renewal := current_subscription.preinvoice_data ->> 'renewal' = 'true';
  is_reactivation := current_subscription.preinvoice_data ->> 'reactivation' = 'true';
  if is_renewal then
    final_start := coalesce(
      (current_subscription.preinvoice_data ->> 'serviceStart')::timestamptz,
      current_subscription.starts_at,
      current_subscription.ordered_at
    );
    final_end := coalesce(
      (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz,
      input_end_at,
      final_start + make_interval(months => current_subscription.order_months)
    );
  elsif is_reactivation then
    final_start := coalesce(
      (current_subscription.preinvoice_data ->> 'serviceStart')::timestamptz,
      current_subscription.starts_at,
      current_subscription.ordered_at
    );
    if final_start <= now() then final_start := now(); end if;
    final_end := coalesce(
      input_end_at,
      final_start + make_interval(months => current_subscription.order_months)
    );
  else
    final_start := case
      when current_subscription.preinvoice_data ->> 'accessAfterPayment' = 'true' then now()
      when current_subscription.preinvoice_data ->> 'planChange' = 'true'
        then coalesce(
          (current_subscription.preinvoice_data ->> 'serviceStart')::timestamptz,
          current_subscription.starts_at,
          current_subscription.ordered_at
        )
      else coalesce(current_subscription.starts_at, current_subscription.ordered_at)
    end;
    final_end := coalesce(
      case when current_subscription.preinvoice_data ->> 'planChange' = 'true'
        then (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz
      end,
      input_end_at,
      case when current_subscription.preinvoice_data ->> 'planChange' = 'true'
        then (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz
        else case
          when current_subscription.preinvoice_data ->> 'accessAfterPayment' = 'true'
            then final_start + make_interval(months => current_subscription.order_months)
          else current_subscription.ordered_at + make_interval(months => current_subscription.order_months)
        end
      end
    );
  end if;
  if final_start is null or final_end <= final_start then
    raise exception 'Subscription end date must be after its start date';
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
    'serviceStart', final_start,
    'serviceEnd', final_end,
    'issuer', final_issuer
  );

  update public.workspace_subscriptions
  set status = 'expired',
      ends_at = case
        when is_renewal or is_reactivation
          or starts_at >= current_subscription.ordered_at
          then ends_at
        else least(coalesce(ends_at, current_subscription.ordered_at), current_subscription.ordered_at)
      end,
      cancel_at_period_end = false,
      updated_at = now()
  where organization_id = current_subscription.organization_id
    and id <> current_subscription.id
    and status = 'active';

  update public.workspace_subscriptions
  set status = 'active',
      starts_at = final_start,
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
