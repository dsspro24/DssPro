do $$
declare
  function_definition text;
  declaration_anchor text := '  has_existing_pending boolean := false;';
  organization_anchor text := $anchor$if not found then raise exception 'Organization not found'; end if;$anchor$;
  invoice_anchor text := $anchor$'reactivation', is_reactivation,$anchor$;
  pending_order_anchor text := $anchor$
        status = 'active',
        starts_at = issue_time,
        ends_at = issue_time + interval '5 days',$anchor$;
  pending_order_replacement text := $replacement$
        status = case when grant_initial_trial then 'active' else 'pending' end,
        starts_at = case when grant_initial_trial then issue_time else null end,
        ends_at = case when grant_initial_trial then issue_time + interval '5 days' else null end,$replacement$;
  new_order_anchor text := $anchor$
      input_organization_id, requested_plan.code, requested_plan.name, 'active',
      requested_plan.amount_cents, addon, issue_time, issue_time + interval '5 days',$anchor$;
  new_order_replacement text := $replacement$
      input_organization_id, requested_plan.code, requested_plan.name,
      case when grant_initial_trial then 'active' else 'pending' end,
      requested_plan.amount_cents, addon,
      case when grant_initial_trial then issue_time else null end,
      case when grant_initial_trial then issue_time + interval '5 days' else null end,$replacement$;
  prior_order_check text := $check$
  select coalesce(created_by, auth.uid()) into trial_owner_id
  from public.organizations
  where id = input_organization_id;

  select exists (
    select 1
    from public.workspace_subscriptions as subscription
    join public.organizations as organization
      on organization.id = subscription.organization_id
    where (
        organization.created_by = trial_owner_id
        or subscription.organization_id = input_organization_id
      )
      and (
        subscription.order_code is not null
        or subscription.payment_status = 'paid'
        or subscription.preinvoice_data is not null
      )
  ) into has_prior_order;
  grant_initial_trial := not public.is_creator() and not has_prior_order;
$check$;
begin
  select pg_get_functiondef('public.request_workspace_subscription(uuid, text, integer)'::regprocedure)
  into function_definition;

  if position(declaration_anchor in function_definition) = 0
    or position(organization_anchor in function_definition) = 0
    or position(invoice_anchor in function_definition) = 0
    or position(pending_order_anchor in function_definition) = 0
    or position(new_order_anchor in function_definition) = 0 then
    raise exception 'Could not locate expected subscription-order function sections';
  end if;

  function_definition := replace(
    function_definition,
    declaration_anchor,
    declaration_anchor
      || E'\n  has_prior_order boolean := false;\n  trial_owner_id uuid;\n  grant_initial_trial boolean := false;'
  );
  function_definition := replace(
    function_definition,
    organization_anchor,
    organization_anchor || prior_order_check
  );
  function_definition := replace(
    function_definition,
    invoice_anchor,
    invoice_anchor
      || E'\n    ''initialTrialAccess'', grant_initial_trial and not is_renewal,'
      || E'\n    ''accessAfterPayment'', not grant_initial_trial and not is_renewal,'
  );
  function_definition := replace(
    function_definition,
    pending_order_anchor,
    pending_order_replacement
  );
  function_definition := replace(
    function_definition,
    new_order_anchor,
    new_order_replacement
  );
  execute function_definition;
end;
$$;
