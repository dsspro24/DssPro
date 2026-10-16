alter table public.profiles
  drop constraint if exists profiles_account_type_check;

update public.profiles as profile
set account_type = 'creator'
from auth.users as auth_user
where auth_user.id = profile.id
  and lower(btrim(auth_user.email)) = 'dsspro24@gmail.com';

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('manager', 'dss_specialist', 'employee', 'creator'));

create or replace function public.is_creator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = (select auth.uid())
      and lower(btrim(auth_user.email)) = 'dsspro24@gmail.com'
  );
$$;

revoke all on function public.is_creator() from public, anon;
grant execute on function public.is_creator() to authenticated;

create policy "Creators can read all organizations"
  on public.organizations for select to authenticated
  using (public.is_creator());

create policy "Creators can read all organization workspace data"
  on public.organization_data for select to authenticated
  using (public.is_creator());

create policy "Creators can insert organization workspace data"
  on public.organization_data for insert to authenticated
  with check (public.is_creator() and updated_by = (select auth.uid()));

create policy "Creators can update organization workspace data"
  on public.organization_data for update to authenticated
  using (public.is_creator())
  with check (public.is_creator() and updated_by = (select auth.uid()));

create table public.creator_workspace_data (
  id boolean primary key default true check (id),
  data jsonb not null,
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.creator_workspace_data enable row level security;

create policy "Authenticated users can read the shared creator catalog"
  on public.creator_workspace_data for select to authenticated
  using (true);

revoke all on public.creator_workspace_data from anon, authenticated;
grant select on public.creator_workspace_data to authenticated;

create or replace function public.save_creator_workspace(
  input_resources jsonb,
  input_resource_types jsonb,
  input_subscriptions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  if jsonb_typeof(input_resources) <> 'array'
    or jsonb_typeof(input_resource_types) <> 'array'
    or jsonb_typeof(input_subscriptions) <> 'array' then
    raise exception 'Creator workspace data must be arrays';
  end if;

  insert into public.creator_workspace_data (id, data, updated_by, updated_at)
  values (
    true,
    jsonb_build_object('resources', input_resources, 'resourceTypes', input_resource_types),
    auth.uid(),
    now()
  )
  on conflict (id) do update
    set data = excluded.data,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  update public.organization_data as workspace
  set data = jsonb_set(
        jsonb_set(
          jsonb_set(
            workspace.data,
            '{resources}',
            (
              select coalesce(jsonb_agg(resource.value), '[]'::jsonb)
              from (
                select existing_resource.value
                from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb)) as existing_resource(value)
                where existing_resource.value ? 'organizationId'
                union all
                select shared_resource.value
                from jsonb_array_elements(input_resources) as shared_resource(value)
              ) as resource
            ),
            true
          ),
          '{resourceTypes}',
          input_resource_types,
          true
        ),
        '{subscriptions}',
        (
          select coalesce(jsonb_agg(subscription.value), '[]'::jsonb)
          from jsonb_array_elements(input_subscriptions) as subscription(value)
          where subscription.value ->> 'orgId' = workspace.organization_id::text
        ),
        true
      ),
      updated_by = auth.uid(),
      updated_at = now();
end;
$$;

revoke all on function public.save_creator_workspace(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_creator_workspace(jsonb, jsonb, jsonb) to authenticated;