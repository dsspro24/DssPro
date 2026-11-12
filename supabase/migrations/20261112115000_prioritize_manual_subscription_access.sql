do $$
declare
  function_definition text;
  active_subscription_order text := 'order by created_at desc';
  workspace_access_order text := 'order by subscription.created_at desc';
begin
  select pg_get_functiondef('public.guard_workspace_subscription_access()'::regprocedure)
  into function_definition;
  if position(active_subscription_order in function_definition) = 0 then
    raise exception 'Could not locate subscription ordering in workspace access guard';
  end if;
  function_definition := replace(
    function_definition,
    active_subscription_order,
    'order by manual_access_override desc, created_at desc'
  );
  execute function_definition;

  select pg_get_functiondef('public.has_workspace_read_access(uuid)'::regprocedure)
  into function_definition;
  if position(workspace_access_order in function_definition) = 0 then
    raise exception 'Could not locate subscription ordering in workspace read access check';
  end if;
  function_definition := replace(
    function_definition,
    workspace_access_order,
    'order by subscription.manual_access_override desc, subscription.created_at desc'
  );
  execute function_definition;
end;
$$;
