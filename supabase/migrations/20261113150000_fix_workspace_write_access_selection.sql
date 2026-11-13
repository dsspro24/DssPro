do $$
declare
  function_definition text;
  write_order_anchor text := 'order by manual_access_override desc, created_at desc';
  write_order_replacement text := 'order by case when status = ''active'' and (ends_at is null or ends_at >= now()) then 0 else 1 end, manual_access_override desc, created_at desc, id desc';
  pending_check_anchor text := $anchor$
  if active_subscription.status = 'pending' and active_subscription.order_code is null then
    raise exception 'Place a subscription order before changing workspace data';
  end if;
  if active_subscription.status = 'pending' and (
    coalesce(active_subscription.ends_at, (active_subscription.preinvoice_data ->> 'dueDate')::timestamptz) is null
    or coalesce(active_subscription.ends_at, (active_subscription.preinvoice_data ->> 'dueDate')::timestamptz) < now()
  ) then
    raise exception 'Workspace is read-only after subscription expiry';
  end if;$anchor$;
  pending_check_replacement text := $replacement$
  if active_subscription.status = 'pending' then
    if active_subscription.order_code is null then
      raise exception 'Place a subscription order before changing workspace data';
    end if;
    raise exception 'Workspace changes require confirmed subscription payment';
  end if;$replacement$;
  active_order_check_anchor text := $anchor$
  if active_subscription.status in ('active', 'expired', 'canceled')
    and active_subscription.ends_at is not null
    and active_subscription.ends_at < now() then$anchor$;
  active_order_check text := $check$
  if active_subscription.status = 'active'
    and active_subscription.payment_status = 'pending'
    and active_subscription.order_code is not null
    and not active_subscription.manual_access_override
    and active_subscription.preinvoice_data ->> 'initialTrialAccess' is distinct from 'true'
    and active_subscription.preinvoice_data ->> 'planChange' is distinct from 'true'
    and active_subscription.preinvoice_data ->> 'individualPlan' is distinct from 'true' then
    raise exception 'Workspace changes require confirmed subscription payment';
  end if;

$check$;
  read_order_anchor text := 'order by subscription.manual_access_override desc, subscription.created_at desc';
  read_order_replacement text := 'order by case when subscription.status = ''active'' and (subscription.ends_at is null or subscription.ends_at > now()) then 0 else 1 end, subscription.manual_access_override desc, subscription.created_at desc, subscription.id desc';
begin
  select pg_get_functiondef('public.guard_workspace_subscription_access()'::regprocedure)
  into function_definition;
  if position(write_order_anchor in function_definition) = 0
    or position(pending_check_anchor in function_definition) = 0
    or position(active_order_check_anchor in function_definition) = 0 then
    raise exception 'Could not locate expected workspace write-access guard sections';
  end if;
  function_definition := replace(function_definition, write_order_anchor, write_order_replacement);
  function_definition := replace(function_definition, pending_check_anchor, pending_check_replacement);
  function_definition := replace(
    function_definition,
    active_order_check_anchor,
    active_order_check || active_order_check_anchor
  );
  execute function_definition;

  select pg_get_functiondef('public.has_workspace_read_access(uuid)'::regprocedure)
  into function_definition;
  if position(read_order_anchor in function_definition) = 0 then
    raise exception 'Could not locate expected workspace read-access ordering';
  end if;
  function_definition := replace(function_definition, read_order_anchor, read_order_replacement);
  execute function_definition;
end;
$$;
