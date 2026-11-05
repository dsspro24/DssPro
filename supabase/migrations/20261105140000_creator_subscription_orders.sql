do $$
declare
  function_definition text;
  authorization_check text := $match$public.is_organization_member(input_organization_id, array['manager'])$match$;
begin
  select pg_get_functiondef('public.request_workspace_subscription(uuid, text, integer)'::regprocedure)
  into function_definition;

  if position(authorization_check in function_definition) = 0 then
    raise exception 'Could not locate subscription-order authorization check';
  end if;

  function_definition := replace(
    function_definition,
    authorization_check,
    $replacement$(public.is_creator() or public.is_organization_member(input_organization_id, array['manager']))$replacement$
  );
  execute function_definition;
end;
$$;
