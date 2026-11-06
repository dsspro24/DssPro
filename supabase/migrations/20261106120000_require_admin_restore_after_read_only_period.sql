do $$
declare
  function_definition text;
  insertion_anchor text := $anchor$if not found then raise exception 'Organization not found'; end if;$anchor$;
  access_guard text := $guard$
  if not public.is_creator() and exists (
    select 1
    from (
      select subscription.status, subscription.ends_at
      from public.workspace_subscriptions as subscription
      where subscription.organization_id = input_organization_id
        and (subscription.ends_at is not null or subscription.status = 'active')
      order by subscription.created_at desc
      limit 1
    ) as latest_subscription
    where latest_subscription.ends_at + interval '2 months' <= issue_time
  ) then
    raise exception 'Access restoration after the read-only period requires administrator assistance';
  end if;
$guard$;
begin
  select pg_get_functiondef('public.request_workspace_subscription(uuid, text, integer)'::regprocedure)
  into function_definition;

  if position(insertion_anchor in function_definition) = 0 then
    raise exception 'Could not locate subscription-order organization check';
  end if;

  function_definition := replace(
    function_definition,
    insertion_anchor,
    insertion_anchor || access_guard
  );
  execute function_definition;
end;
$$;
