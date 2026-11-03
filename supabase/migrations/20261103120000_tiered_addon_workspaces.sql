alter table public.organizations
  add column if not exists parent_organization_id uuid references public.organizations (id) on delete set null;

create index if not exists organizations_parent_organization_id_idx
  on public.organizations (parent_organization_id)
  where parent_organization_id is not null;

insert into public.subscription_plans (code, name, amount_cents, currency, billing_interval, employee_limit, features, active)
values
  ('additional_workspace_20', 'Papildoma įmonė · iki 20 darbuotojų', 1999, 'EUR', 'month', 20, '{"documents": true, "reports": true}'::jsonb, true),
  ('additional_workspace_50', 'Papildoma įmonė · iki 50 darbuotojų', 3499, 'EUR', 'month', 50, '{"documents": true, "reports": true}'::jsonb, true),
  ('additional_workspace_75', 'Papildoma įmonė · iki 75 darbuotojų', 4499, 'EUR', 'month', 75, '{"documents": true, "reports": true}'::jsonb, true),
  ('additional_workspace_200', 'Papildoma įmonė · iki 200 darbuotojų', 8999, 'EUR', 'month', 200, '{"documents": true, "reports": true}'::jsonb, true)
on conflict (code) do update
set name = excluded.name,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    billing_interval = excluded.billing_interval,
    employee_limit = excluded.employee_limit,
    features = excluded.features,
    active = excluded.active,
    updated_at = now();

update public.workspace_subscriptions
set plan_code = 'additional_workspace_20',
    plan_name = 'Papildoma įmonė · iki 20 darbuotojų',
    updated_at = now()
where is_addon and plan_code = 'additional_workspace';

update public.subscription_plans
set active = false, updated_at = now()
where code = 'additional_workspace';

with roots as (
  select distinct on (membership.user_id)
    membership.user_id,
    organization.id as root_id
  from public.organization_memberships as membership
  join public.organizations as organization on organization.id = membership.organization_id
  where membership.role = 'manager'
    and organization.parent_organization_id is null
    and not exists (
      select 1
      from public.workspace_subscriptions as subscription
      where subscription.organization_id = organization.id and subscription.is_addon
    )
  order by membership.user_id, organization.created_at, organization.id
)
update public.organizations as addon
set parent_organization_id = roots.root_id
from public.workspace_subscriptions as subscription
join public.organization_memberships as membership
  on membership.organization_id = subscription.organization_id
 and membership.role = 'manager'
join roots on roots.user_id = membership.user_id
where subscription.organization_id = addon.id
  and subscription.is_addon
  and addon.parent_organization_id is null
  and addon.id <> roots.root_id;

create or replace function public.create_additional_organization(
  organization_name text,
  organization_code text,
  input_plan_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  root_organization_id uuid;
  addon_plan public.subscription_plans%rowtype;
  normalized_name text := btrim(coalesce(organization_name, ''));
  normalized_code text := nullif(btrim(coalesce(organization_code, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if normalized_name = '' then raise exception 'Organization name is required'; end if;
  if input_plan_code not in (
    'additional_workspace_20', 'additional_workspace_50',
    'additional_workspace_75', 'additional_workspace_200'
  ) then raise exception 'Select a valid additional workspace plan'; end if;

  select coalesce(organization.parent_organization_id, organization.id)
  into root_organization_id
  from public.organizations as organization
  where public.is_organization_member(organization.id, array['manager'])
  order by organization.parent_organization_id nulls first, organization.created_at
  limit 1;
  if root_organization_id is null then raise exception 'Manager membership required'; end if;

  select * into addon_plan from public.subscription_plans
  where code = input_plan_code and active;
  if not found then raise exception 'Additional workspace plan is unavailable'; end if;

  insert into public.organizations (name, company_code, created_by, parent_organization_id)
  values (normalized_name, normalized_code, auth.uid(), root_organization_id)
  returning id into new_organization_id;
  insert into public.organization_memberships (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'manager');
  insert into public.workspace_subscriptions (
    organization_id, plan_code, plan_name, amount_cents, is_addon, created_by
  ) values (
    new_organization_id, addon_plan.code, addon_plan.name, addon_plan.amount_cents, true, auth.uid()
  );

  return new_organization_id;
end;
$$;

revoke all on function public.create_additional_organization(text, text, text) from public, anon;
grant execute on function public.create_additional_organization(text, text, text) to authenticated;

create or replace function public.create_additional_organization(
  organization_name text,
  organization_code text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_additional_organization(
    organization_name,
    organization_code,
    'additional_workspace_20'
  );
$$;

revoke all on function public.create_additional_organization(text, text) from public, anon;
grant execute on function public.create_additional_organization(text, text) to authenticated;

create or replace function public.request_workspace_subscription(
  input_organization_id uuid,
  input_plan_code text
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_employee_count integer;
  requested_plan public.subscription_plans%rowtype;
  existing_pending public.workspace_subscriptions%rowtype;
  result public.workspace_subscriptions%rowtype;
  addon boolean;
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Manager membership required';
  end if;

  select coalesce(bool_or(is_addon), false) into addon
  from public.workspace_subscriptions
  where organization_id = input_organization_id;
  if addon and input_plan_code not in (
    'additional_workspace_20', 'additional_workspace_50',
    'additional_workspace_75', 'additional_workspace_200'
  ) then
    raise exception 'Additional workspace plan cannot be changed by the manager';
  elsif not addon and input_plan_code like 'additional_workspace_%' then
    raise exception 'Additional workspace orders require a new company workspace';
  end if;

  select count(*) into active_employee_count
  from public.organization_employees
  where organization_id = input_organization_id
    and archived_at is null
    and status = 'Aktyvus';
  if active_employee_count > 200 then
    raise exception 'Plans are available for up to 200 active employees';
  end if;

  select * into requested_plan from public.subscription_plans
  where code = input_plan_code and active;
  if not found then raise exception 'Selected subscription plan is unavailable'; end if;
  if coalesce(requested_plan.employee_limit, 200) < active_employee_count then
    raise exception 'The selected plan does not cover the active employee count';
  end if;

  select * into existing_pending from public.workspace_subscriptions
  where organization_id = input_organization_id and status = 'pending'
  order by created_at desc limit 1 for update;
  if found then
    update public.workspace_subscriptions
    set plan_code = requested_plan.code,
        plan_name = requested_plan.name,
        amount_cents = requested_plan.amount_cents,
        updated_at = now()
    where id = existing_pending.id
    returning * into result;
  else
    insert into public.workspace_subscriptions (
      organization_id, plan_code, plan_name, amount_cents, is_addon, created_by
    ) values (
      input_organization_id, requested_plan.code, requested_plan.name,
      requested_plan.amount_cents, addon, auth.uid()
    ) returning * into result;
  end if;

  return result;
end;
$$;

revoke all on function public.request_workspace_subscription(uuid, text) from public, anon;
grant execute on function public.request_workspace_subscription(uuid, text) to authenticated;

create or replace function public.creator_set_subscription_plan_price(
  input_plan_code text,
  input_amount_cents integer
)
returns public.subscription_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.subscription_plans%rowtype;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if input_amount_cents < 0 then raise exception 'Price cannot be negative'; end if;
  update public.subscription_plans
  set amount_cents = input_amount_cents, updated_at = now()
  where code = input_plan_code and code in (
    'up_to_20', 'up_to_50', 'up_to_75', 'up_to_200',
    'additional_workspace_20', 'additional_workspace_50',
    'additional_workspace_75', 'additional_workspace_200'
  )
  returning * into result;
  if not found then raise exception 'Subscription plan not found'; end if;
  return result;
end;
$$;

revoke all on function public.creator_set_subscription_plan_price(text, integer) from public, anon;
grant execute on function public.creator_set_subscription_plan_price(text, integer) to authenticated;

create or replace function public.creator_update_workspace_subscription(
  input_subscription_id uuid,
  input_status text,
  input_plan_code text,
  input_amount_cents integer,
  input_starts_at timestamptz,
  input_ends_at timestamptz,
  input_cancel_at_period_end boolean
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_subscription public.workspace_subscriptions%rowtype;
  selected_plan public.subscription_plans%rowtype;
  result public.workspace_subscriptions%rowtype;
  input_plan_is_addon boolean := input_plan_code in (
    'additional_workspace_20', 'additional_workspace_50',
    'additional_workspace_75', 'additional_workspace_200', 'additional_workspace'
  );
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if input_status not in ('pending', 'active', 'canceled', 'expired') then
    raise exception 'Invalid subscription status';
  end if;
  if input_amount_cents < 0 then raise exception 'Price cannot be negative'; end if;
  if input_ends_at is not null and input_starts_at is not null and input_ends_at <= input_starts_at then
    raise exception 'End date must be after start date';
  end if;

  select * into current_subscription from public.workspace_subscriptions
  where id = input_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if current_subscription.is_addon <> input_plan_is_addon then
    raise exception 'Subscription plan type cannot be changed';
  end if;
  select * into selected_plan from public.subscription_plans where code = input_plan_code;
  if not found then raise exception 'Subscription plan not found'; end if;

  if input_status = 'active' then
    if input_starts_at is null or input_ends_at is null then
      raise exception 'Active subscriptions require start and end dates';
    end if;
    update public.workspace_subscriptions
    set status = 'expired',
        ends_at = least(coalesce(ends_at, input_starts_at), input_starts_at),
        cancel_at_period_end = false,
        updated_at = now()
    where organization_id = current_subscription.organization_id
      and id <> input_subscription_id
      and status = 'active';
  end if;

  update public.workspace_subscriptions
  set status = input_status,
      plan_code = input_plan_code,
      plan_name = selected_plan.name,
      amount_cents = input_amount_cents,
      starts_at = input_starts_at,
      ends_at = input_ends_at,
      cancel_at_period_end = coalesce(input_cancel_at_period_end, false),
      updated_at = now()
  where id = input_subscription_id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.creator_update_workspace_subscription(uuid, text, text, integer, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.creator_update_workspace_subscription(uuid, text, text, integer, timestamptz, timestamptz, boolean) to authenticated;
