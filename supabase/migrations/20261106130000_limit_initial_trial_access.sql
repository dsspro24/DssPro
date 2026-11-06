do $$
declare
  function_definition text;
  declaration_anchor text := '  has_existing_pending boolean := false;';
  organization_anchor text := $anchor$if not found then raise exception 'Organization not found'; end if;$anchor$;
  invoice_anchor text := $anchor$'reactivation', is_reactivation,$anchor$;
  reactivation_anchor text := $anchor$
    ) into is_reactivation;
    select * into existing_pending$anchor$;
  draft_order_anchor text := $anchor$
        status = 'active',
        starts_at = issue_time,
        ends_at = issue_time + interval '5 days',$anchor$;
  draft_order_replacement text := $replacement$
        status = case when is_reactivation or grant_initial_trial then 'active' else 'pending' end,
        starts_at = case when grant_initial_trial then issue_time else null end,
        ends_at = case when is_reactivation then active_order.ends_at
          when grant_initial_trial then issue_time + interval '5 days' else null end,$replacement$;
  new_order_anchor text := $anchor$
      input_organization_id, requested_plan.code, requested_plan.name, 'active',
      requested_plan.amount_cents, addon, issue_time, issue_time + interval '5 days',$anchor$;
  new_order_replacement text := $replacement$
      input_organization_id, requested_plan.code, requested_plan.name,
      case when is_reactivation or grant_initial_trial then 'active' else 'pending' end,
      requested_plan.amount_cents, addon,
      case when grant_initial_trial then issue_time else null end,
      case when is_reactivation then active_order.ends_at
        when grant_initial_trial then issue_time + interval '5 days' else null end,$replacement$;
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
    or position(reactivation_anchor in function_definition) = 0
    or position(draft_order_anchor in function_definition) = 0
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
    invoice_anchor || E'\n    ''initialTrialAccess'', grant_initial_trial and not is_renewal,\n    ''accessAfterPayment'', not grant_initial_trial and not is_renewal,'
  );
  function_definition := replace(
    function_definition,
    reactivation_anchor,
    $replacement$
    ) into is_reactivation;
    if is_reactivation then
      select * into active_order
      from public.workspace_subscriptions
      where organization_id = input_organization_id
        and payment_status = 'paid'
        and ends_at is not null
        and ends_at <= issue_time
        and ends_at + interval '2 months' > issue_time
      order by ends_at desc
      limit 1
      for update;
    end if;
    select * into existing_pending$replacement$
  );
  function_definition := replace(
    function_definition,
    draft_order_anchor,
    draft_order_replacement
  );
  function_definition := replace(
    function_definition,
    new_order_anchor,
    new_order_replacement
  );
  execute function_definition;
end;
$$;

do $$
declare
  function_definition text;
  renewal_declaration_anchor text := '  is_renewal boolean;';
  renewal_assignment_anchor text := $anchor$is_renewal := current_subscription.preinvoice_data ->> 'renewal' = 'true';$anchor$;
  end_date_anchor text := $anchor$ends_at = case when is_renewal then ends_at else now() end,$anchor$;
begin
  select pg_get_functiondef('public.manager_cancel_workspace_subscription_order(uuid)'::regprocedure)
  into function_definition;

  if position(renewal_declaration_anchor in function_definition) = 0
    or position(renewal_assignment_anchor in function_definition) = 0
    or position(end_date_anchor in function_definition) = 0 then
    raise exception 'Could not locate expected subscription-order cancellation sections';
  end if;

  function_definition := replace(
    function_definition,
    renewal_declaration_anchor,
    renewal_declaration_anchor || E'\n  is_reactivation boolean;'
  );
  function_definition := replace(
    function_definition,
    renewal_assignment_anchor,
    renewal_assignment_anchor
      || E'\n  is_reactivation := current_subscription.preinvoice_data ->> ''reactivation'' = ''true'';'
  );
  function_definition := replace(
    function_definition,
    end_date_anchor,
    'ends_at = case when is_renewal or is_reactivation then ends_at else now() end,'
  );
  execute function_definition;
end;
$$;

do $$
declare
  function_definition text;
  start_anchor text := 'final_start := coalesce(current_subscription.starts_at, current_subscription.ordered_at);';
  end_anchor text := $anchor$
        else current_subscription.ordered_at + make_interval(months => current_subscription.order_months)
      end$anchor$;
begin
  select pg_get_functiondef('public.creator_confirm_workspace_subscription_payment(uuid, timestamptz)'::regprocedure)
  into function_definition;

  if position(start_anchor in function_definition) = 0
    or position(end_anchor in function_definition) = 0 then
    raise exception 'Could not locate expected subscription-payment confirmation sections';
  end if;

  function_definition := replace(
    function_definition,
    start_anchor,
    $replacement$
    final_start := case
      when current_subscription.preinvoice_data ->> 'accessAfterPayment' = 'true' then now()
      else coalesce(current_subscription.starts_at, current_subscription.ordered_at)
    end;$replacement$
  );
  function_definition := replace(
    function_definition,
    end_anchor,
    $replacement$
        else case
          when current_subscription.preinvoice_data ->> 'accessAfterPayment' = 'true'
            then final_start + make_interval(months => current_subscription.order_months)
          else current_subscription.ordered_at + make_interval(months => current_subscription.order_months)
        end
      end$replacement$
  );
  execute function_definition;
end;
$$;

update public.workspace_subscriptions as subscription
set preinvoice_data = jsonb_set(
  coalesce(subscription.preinvoice_data, '{}'::jsonb),
  '{initialTrialAccess}',
  'true'::jsonb,
  true
)
where subscription.order_code is not null
  and subscription.preinvoice_data is not null
  and not (subscription.preinvoice_data ? 'initialTrialAccess')
  and not exists (
    select 1
    from public.workspace_subscriptions as earlier
    join public.organizations as earlier_organization
      on earlier_organization.id = earlier.organization_id
    join public.organizations as current_organization
      on current_organization.id = subscription.organization_id
    where earlier.order_code is not null
      and (
        earlier_organization.created_by = current_organization.created_by
        or earlier_organization.id = current_organization.id
      )
      and (
        coalesce(earlier.ordered_at, earlier.created_at),
        earlier.created_at,
        earlier.id
      ) < (
        coalesce(subscription.ordered_at, subscription.created_at),
        subscription.created_at,
        subscription.id
      )
  );

create or replace function public.guard_workspace_subscription_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_subscription public.workspace_subscriptions%rowtype;
  employee_limit integer;
  active_employee_count integer;
begin
  if public.is_creator() then return new; end if;

  select * into active_subscription
  from public.workspace_subscriptions
  where organization_id = new.organization_id
    and not (
      preinvoice_data ->> 'planChange' = 'true'
      and payment_status = 'pending'
      and (preinvoice_data ->> 'dueDate')::timestamptz < now()
    )
  order by created_at desc
  limit 1;
  if not found then raise exception 'Place a subscription order before changing workspace data'; end if;

  if active_subscription.status = 'pending' and active_subscription.order_code is null then
    raise exception 'Place a subscription order before changing workspace data';
  end if;
  if active_subscription.status = 'pending' then
    raise exception 'Workspace changes require confirmed subscription payment';
  end if;
  if active_subscription.status in ('active', 'expired', 'canceled')
    and active_subscription.ends_at is not null
    and active_subscription.ends_at < now() then
    raise exception 'Workspace is read-only after subscription expiry';
  end if;
  if active_subscription.status in ('expired', 'canceled') and active_subscription.ends_at is null then
    raise exception 'Workspace has no active subscription';
  end if;

  if active_subscription.status = 'active'
    and (active_subscription.ends_at is null or active_subscription.ends_at >= now()) then
    select coalesce(plan.employee_limit, 200) into employee_limit
    from public.subscription_plans as plan
    where plan.code = active_subscription.plan_code;
    employee_limit := coalesce(employee_limit, 200);
    select count(*) into active_employee_count
    from jsonb_array_elements(coalesce(new.data -> 'employees', '[]'::jsonb)) as employee(value)
    where employee.value ->> 'orgId' = new.organization_id::text
      and employee.value ->> 'status' = 'Aktyvus'
      and coalesce(employee.value ->> 'archivedAt', '') = '';
    if active_employee_count > employee_limit then
      raise exception 'The active employee limit for this plan has been exceeded';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_workspace_subscription_access() from public, anon, authenticated;

create or replace function public.has_workspace_read_access(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_organization_id is null
    or public.is_creator()
    or exists (
      select 1
      from (
        select subscription.status, subscription.ends_at, subscription.payment_status,
          subscription.preinvoice_data
        from public.workspace_subscriptions as subscription
        where subscription.organization_id = target_organization_id
          and not (
            subscription.order_code is not null
            and coalesce(subscription.payment_status, '') <> 'paid'
            and subscription.preinvoice_data ->> 'initialTrialAccess' is distinct from 'true'
            and subscription.preinvoice_data ->> 'planChange' is distinct from 'true'
          )
          and not (
            subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
            and subscription.payment_status <> 'paid'
            and not (
              subscription.status = 'active'
              and subscription.ends_at > now()
            )
          )
          and not (
            subscription.preinvoice_data ->> 'renewal' = 'true'
            and subscription.payment_status = 'pending'
          )
          and not (
            subscription.preinvoice_data ->> 'planChange' = 'true'
            and subscription.payment_status = 'pending'
            and (subscription.preinvoice_data ->> 'dueDate')::timestamptz < now()
          )
        order by subscription.created_at desc
        limit 1
      ) as latest_subscription
      where (
          latest_subscription.status = 'active'
          and latest_subscription.ends_at is null
        )
        or (
          latest_subscription.status = 'active'
          and latest_subscription.ends_at > now()
          and latest_subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
          and latest_subscription.payment_status = 'pending'
        )
        or (
          latest_subscription.status in ('active', 'canceled', 'expired')
          and latest_subscription.ends_at + interval '2 months' > now()
          and not (
            latest_subscription.preinvoice_data ->> 'initialTrialAccess' = 'true'
            and latest_subscription.payment_status <> 'paid'
          )
        )
    );
$$;

revoke all on function public.has_workspace_read_access(uuid) from public, anon;
grant execute on function public.has_workspace_read_access(uuid) to authenticated;
