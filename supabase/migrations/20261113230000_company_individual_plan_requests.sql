create or replace function public.creator_upsert_company_custom_plan(
  input_organization_id uuid,
  input_subscription_id uuid,
  input_amount_cents integer,
  input_employee_limit integer
)
returns public.subscription_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_record public.organizations%rowtype;
  current_subscription public.workspace_subscriptions%rowtype;
  result public.subscription_plans%rowtype;
  active_employee_count integer;
  custom_plan_code text;
  custom_plan_name text;
  has_existing_subscription boolean := false;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if input_amount_cents is null or input_amount_cents < 0 then
    raise exception 'Price cannot be negative';
  end if;
  if input_employee_limit is null or input_employee_limit < 1 then
    raise exception 'Employee limit must be at least one';
  end if;

  select * into organization_record
  from public.organizations
  where id = input_organization_id
  for update;
  if not found then raise exception 'Organization not found'; end if;

  if input_subscription_id is null then
    select exists (
      select 1
      from public.workspace_subscriptions
      where organization_id = input_organization_id
    ) into has_existing_subscription;
  else
    select * into current_subscription
    from public.workspace_subscriptions
    where id = input_subscription_id
    for update;
    if not found then
      raise exception 'Subscription not found';
    end if;
    if current_subscription.organization_id <> input_organization_id then
      raise exception 'Subscription does not belong to this organization';
    end if;
    if current_subscription.is_addon then
      raise exception 'Individual plans cannot be assigned to additional workspaces';
    end if;
  end if;

  select count(*) into active_employee_count
  from public.organization_employees
  where organization_id = input_organization_id
    and archived_at is null
    and status = 'Aktyvus';
  if active_employee_count > input_employee_limit then
    raise exception 'Employee limit cannot be lower than the active employee count';
  end if;

  custom_plan_code := 'individual_' || replace(input_organization_id::text, '-', '')
    || '_' || replace(gen_random_uuid()::text, '-', '');
  custom_plan_name := format('Individualus planas (iki %s darbuotojų)', input_employee_limit);

  insert into public.subscription_plans (
    code, name, amount_cents, currency, billing_interval, employee_limit,
    features, active, organization_id
  ) values (
    custom_plan_code, custom_plan_name, input_amount_cents, 'EUR', 'month',
    input_employee_limit, '{"documents": true, "reports": true}'::jsonb,
    true, input_organization_id
  )
  returning * into result;

  if input_subscription_id is null and not has_existing_subscription then
    insert into public.workspace_subscriptions (
      organization_id, plan_code, plan_name, status, amount_cents, currency,
      is_addon, created_by
    ) values (
      input_organization_id, result.code, result.name, 'pending',
      result.amount_cents, result.currency, false, auth.uid()
    );
  end if;

  return result;
end;
$$;

revoke all on function public.creator_upsert_company_custom_plan(uuid, uuid, integer, integer)
  from public, anon;
grant execute on function public.creator_upsert_company_custom_plan(uuid, uuid, integer, integer)
  to authenticated;

drop policy if exists "Users can read applicable active subscription plans"
  on public.subscription_plans;
create policy "Users can read applicable active subscription plans"
  on public.subscription_plans for select to authenticated
  using (
    public.is_creator()
    or (active and organization_id is null)
    or (
      active
      and organization_id is not null
      and public.is_organization_member(organization_id, array['manager'])
    )
  );

create or replace function public.create_organization_with_billing_details(
  organization_name text,
  organization_code text,
  input_billing_address text,
  input_vat_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  selected_plan_code text;
begin
  new_organization_id := public.create_organization(organization_name, organization_code);

  update public.organizations
  set billing_address = btrim(coalesce(input_billing_address, '')),
      vat_code = btrim(coalesce(input_vat_code, ''))
  where id = new_organization_id;

  if auth.jwt() -> 'user_metadata' ->> 'plan_code' = 'individual_request' then
    delete from public.workspace_subscriptions
    where organization_id = new_organization_id
      and order_code is null;
    return new_organization_id;
  end if;

  select plan_code into selected_plan_code
  from public.workspace_subscriptions
  where organization_id = new_organization_id
  order by created_at desc
  limit 1;
  perform public.request_workspace_subscription(new_organization_id, selected_plan_code, 1);

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_with_billing_details(text, text, text, text) from public, anon;
grant execute on function public.create_organization_with_billing_details(text, text, text, text) to authenticated;
