do $$
declare
  function_definition text;
  renewal_block_anchor text := $anchor$
  if is_renewal or is_reactivation then
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
  else$anchor$;
  renewal_block_replacement text := $replacement$
  if is_renewal then
    final_start := coalesce(
      (current_subscription.preinvoice_data ->> 'serviceStart')::timestamptz,
      current_subscription.starts_at,
      current_subscription.ordered_at
    );
    final_end := coalesce(
      input_end_at,
      (current_subscription.preinvoice_data ->> 'serviceEnd')::timestamptz,
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
  else$replacement$;
begin
  select pg_get_functiondef('public.creator_confirm_workspace_subscription_payment(uuid, timestamptz)'::regprocedure)
  into function_definition;

  if position(renewal_block_anchor in function_definition) = 0 then
    raise exception 'Could not locate expected renewal payment-confirmation logic';
  end if;

  function_definition := replace(function_definition, renewal_block_anchor, renewal_block_replacement);
  execute function_definition;
end;
$$;
