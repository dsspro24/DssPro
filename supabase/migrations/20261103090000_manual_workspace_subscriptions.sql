insert into public.subscription_plans (code, name, amount_cents, currency, billing_interval, employee_limit, features, active)
values
  ('up_to_20', 'Iki 20 darbuotojų', 2999, 'EUR', 'month', 20, '{"documents": true, "reports": true}'::jsonb, true),
  ('up_to_50', 'Iki 50 darbuotojų', 4999, 'EUR', 'month', 50, '{"documents": true, "reports": true}'::jsonb, true),
  ('up_to_75', 'Iki 75 darbuotojų', 5999, 'EUR', 'month', 75, '{"documents": true, "reports": true}'::jsonb, true),
  ('up_to_200', 'Iki 200 darbuotojų', 12999, 'EUR', 'month', 200, '{"documents": true, "reports": true}'::jsonb, true),
  ('additional_workspace', 'Papildoma įmonė', 1999, 'EUR', 'month', 200, '{"documents": true, "reports": true}'::jsonb, true)
on conflict (code) do update
set name = excluded.name,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    billing_interval = excluded.billing_interval,
    employee_limit = excluded.employee_limit,
    features = excluded.features,
    active = excluded.active,
    updated_at = now();

update public.subscription_plans
set active = false, updated_at = now()
where code in ('standard', 'pro');

create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_code text not null references public.subscription_plans (code),
  plan_name text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'canceled', 'expired')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  is_addon boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists workspace_subscriptions_org_history_idx
  on public.workspace_subscriptions (organization_id, created_at desc);
create unique index if not exists workspace_subscriptions_one_pending_idx
  on public.workspace_subscriptions (organization_id) where status = 'pending';

alter table public.workspace_subscriptions enable row level security;

revoke all on public.workspace_subscriptions from anon, authenticated;
grant select on public.workspace_subscriptions to authenticated;

create policy "Managers and creators can read workspace subscriptions"
  on public.workspace_subscriptions for select to authenticated
  using (public.is_creator() or public.is_organization_member(organization_id, array['manager']));

create policy "Creators can read inactive subscription plans"
  on public.subscription_plans for select to authenticated
  using (public.is_creator());

grant select on public.subscription_plans to anon;
create policy "Anyone can read active subscription plans"
  on public.subscription_plans for select to anon
  using (active);

insert into public.workspace_subscriptions (
  id, organization_id, plan_code, plan_name, status, amount_cents, currency,
  starts_at, ends_at, created_at, updated_at
)
select
  case
    when coalesce(subscription.value ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (subscription.value ->> 'id')::uuid
    else gen_random_uuid()
  end,
  workspace.organization_id,
  case
    when lower(coalesce(subscription.value ->> 'plan', '')) = 'pro' then 'pro'
    when lower(coalesce(subscription.value ->> 'plan', '')) in ('standard', 'standartinis') then 'standard'
    else 'up_to_20'
  end,
  coalesce(subscription.value ->> 'plan', 'Iki 20 darbuotojų'),
  case lower(coalesce(subscription.value ->> 'status', ''))
    when 'aktyvi' then 'active'
    when 'active' then 'active'
    when 'atšaukta' then 'canceled'
    when 'canceled' then 'canceled'
    when 'pasibaigusi' then 'expired'
    when 'expired' then 'expired'
    else 'pending'
  end,
  greatest(0, round(coalesce((subscription.value ->> 'price')::numeric, 0) * 100)::integer),
  coalesce(subscription.value ->> 'currency', 'EUR'),
  null,
  case when coalesce(subscription.value ->> 'endsAt', '') ~ '^\d{4}-\d{2}-\d{2}$'
    then (subscription.value ->> 'endsAt')::timestamptz else null end,
  now(),
  now()
from public.organization_data as workspace
cross join lateral jsonb_array_elements(coalesce(workspace.data -> 'subscriptions', '[]'::jsonb)) as subscription(value)
where coalesce(subscription.value ->> 'id', '') <> ''
  and not exists (
    select 1 from public.workspace_subscriptions as existing
    where existing.organization_id = workspace.organization_id
  )
on conflict (id) do nothing;

create or replace function public.create_organization(
  organization_name text,
  organization_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  selected_plan_code text;
  selected_plan public.subscription_plans%rowtype;
  normalized_name text := btrim(coalesce(organization_name, ''));
  normalized_code text := nullif(btrim(coalesce(organization_code, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if normalized_name = '' then raise exception 'Organization name is required'; end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and account_type = 'manager'
  ) then raise exception 'Manager account required'; end if;
  if exists (
    select 1 from public.organization_memberships
    where user_id = auth.uid() and role = 'manager'
  ) then raise exception 'Use the additional workspace order to create another company'; end if;

  selected_plan_code := coalesce(auth.jwt() -> 'user_metadata' ->> 'plan_code', 'up_to_20');
  if selected_plan_code not in ('up_to_20', 'up_to_50', 'up_to_75', 'up_to_200') then
    selected_plan_code := 'up_to_20';
  end if;
  select * into selected_plan from public.subscription_plans
  where code = selected_plan_code and active;
  if not found then raise exception 'Selected subscription plan is unavailable'; end if;

  insert into public.organizations (name, company_code, created_by)
  values (normalized_name, normalized_code, auth.uid())
  returning id into new_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'manager');

  insert into public.workspace_subscriptions (
    organization_id, plan_code, plan_name, amount_cents, created_by
  ) values (
    new_organization_id, selected_plan.code, selected_plan.name, selected_plan.amount_cents, auth.uid()
  );

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

create or replace function public.create_additional_organization(
  organization_name text,
  organization_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  addon_plan public.subscription_plans%rowtype;
  normalized_name text := btrim(coalesce(organization_name, ''));
  normalized_code text := nullif(btrim(coalesce(organization_code, '')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if normalized_name = '' then raise exception 'Organization name is required'; end if;
  if not exists (
    select 1 from public.organization_memberships
    where user_id = auth.uid() and role = 'manager'
  ) then raise exception 'Manager membership required'; end if;

  select * into addon_plan from public.subscription_plans
  where code = 'additional_workspace' and active;
  if not found then raise exception 'Additional workspace plan is unavailable'; end if;

  insert into public.organizations (name, company_code, created_by)
  values (normalized_name, normalized_code, auth.uid())
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
  if addon then
    if input_plan_code <> 'additional_workspace' then
      raise exception 'Additional workspace plan cannot be changed by the manager';
    end if;
  elsif input_plan_code = 'additional_workspace' then
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

create or replace function public.cancel_workspace_subscription(input_subscription_id uuid)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.workspace_subscriptions%rowtype;
begin
  update public.workspace_subscriptions as subscription
  set status = case when subscription.status = 'pending' then 'canceled' else subscription.status end,
      cancel_at_period_end = subscription.status <> 'pending',
      updated_at = now()
  where subscription.id = input_subscription_id
    and subscription.status in ('pending', 'active')
    and public.is_organization_member(subscription.organization_id, array['manager'])
  returning subscription.* into result;
  if not found then raise exception 'Subscription cannot be canceled'; end if;
  return result;
end;
$$;

revoke all on function public.cancel_workspace_subscription(uuid) from public, anon;
grant execute on function public.cancel_workspace_subscription(uuid) to authenticated;

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
  where code = input_plan_code and code in ('up_to_20', 'up_to_50', 'up_to_75', 'up_to_200', 'additional_workspace')
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
  if current_subscription.is_addon <> (input_plan_code = 'additional_workspace') then
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
  order by created_at desc
  limit 1;
  if not found then return new; end if;

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

drop trigger if exists guard_workspace_subscription_access on public.organization_data;
create trigger guard_workspace_subscription_access
  before insert or update on public.organization_data
  for each row execute function public.guard_workspace_subscription_access();

insert into public.workspace_subscriptions (
  organization_id, plan_code, plan_name, status, amount_cents, currency, created_by
)
select
  organization.id,
  plan.code,
  plan.name,
  'pending',
  plan.amount_cents,
  plan.currency,
  organization.created_by
from public.organizations as organization
cross join public.subscription_plans as plan
where plan.code = 'up_to_20'
  and not exists (
    select 1
    from public.workspace_subscriptions as existing
    where existing.organization_id = organization.id
  );

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
        select subscription.status, subscription.ends_at
        from public.workspace_subscriptions as subscription
        where subscription.organization_id = target_organization_id
        order by subscription.created_at desc
        limit 1
      ) as latest_subscription
      where latest_subscription.status = 'pending'
        or (latest_subscription.status = 'active' and latest_subscription.ends_at is null)
        or (
          latest_subscription.status in ('active', 'canceled', 'expired')
          and latest_subscription.ends_at + interval '2 months' > now()
        )
    );
$$;

revoke all on function public.has_workspace_read_access(uuid) from public, anon;
grant execute on function public.has_workspace_read_access(uuid) to authenticated;

create policy "Workspace subscription limits organization data reads"
  on public.organization_data as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits employee reads"
  on public.organization_employees as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits document reads"
  on public.organization_documents as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits resource access reads"
  on public.organization_resource_access as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits assignment reads"
  on public.employee_document_assignments as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits test attempt reads"
  on public.employee_test_attempts as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits protocol reads"
  on public.protocol_batches as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits protocol participant reads"
  on public.protocol_batch_employees as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits signature reads"
  on public.document_signatures as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits asset metadata reads"
  on public.organization_assets as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits audit reads"
  on public.audit_events as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits export reads"
  on public.export_jobs as restrictive for select to authenticated
  using (public.has_workspace_read_access(organization_id));

create policy "Workspace subscription limits storage reads"
  on storage.objects as restrictive for select to authenticated
  using (
    bucket_id not in ('organization-assets', 'organization-exports', 'signature-assets')
    or public.is_creator()
    or case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then public.has_workspace_read_access(split_part(name, '/', 1)::uuid)
      else false
    end
  );
