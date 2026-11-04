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
  if active_subscription.status = 'pending' and (
    coalesce(active_subscription.ends_at, (active_subscription.preinvoice_data ->> 'dueDate')::timestamptz) is null
    or coalesce(active_subscription.ends_at, (active_subscription.preinvoice_data ->> 'dueDate')::timestamptz) < now()
  ) then
    raise exception 'Workspace is read-only after subscription expiry';
  end if;
  if active_subscription.status in ('active', 'expired', 'canceled')
    and active_subscription.ends_at is not null
    and active_subscription.ends_at < now() then
    raise exception 'Workspace is read-only after subscription expiry';
  end if;
  if active_subscription.status in ('expired', 'canceled') and active_subscription.ends_at is null then
    raise exception 'Workspace has no active subscription';
  end if;

  if active_subscription.status in ('pending', 'active')
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
        select subscription.status, subscription.ends_at, subscription.order_code,
          (subscription.preinvoice_data ->> 'dueDate')::timestamptz as preinvoice_due_at
        from public.workspace_subscriptions as subscription
        where subscription.organization_id = target_organization_id
          and not (
            subscription.preinvoice_data ->> 'planChange' = 'true'
            and subscription.payment_status = 'pending'
            and (subscription.preinvoice_data ->> 'dueDate')::timestamptz < now()
          )
        order by subscription.created_at desc
        limit 1
      ) as latest_subscription
      where (
          latest_subscription.status = 'pending'
          and latest_subscription.order_code is not null
          and coalesce(latest_subscription.ends_at, latest_subscription.preinvoice_due_at) + interval '2 months' > now()
        )
        or (latest_subscription.status = 'active' and latest_subscription.ends_at is null)
        or (
          latest_subscription.status in ('active', 'canceled', 'expired')
          and latest_subscription.ends_at + interval '2 months' > now()
        )
    );
$$;

revoke all on function public.has_workspace_read_access(uuid) from public, anon;
grant execute on function public.has_workspace_read_access(uuid) to authenticated;
