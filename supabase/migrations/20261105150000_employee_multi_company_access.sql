create table public.employee_organization_access (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  unique (organization_id, employee_id)
);

create index employee_organization_access_user_idx
  on public.employee_organization_access (user_id, created_at);

create or replace function public.sync_employee_organization_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'employee'
    and new.employee_id is not null
    and new.employee_id is distinct from old.employee_id then
    update public.employee_organization_access
      set employee_id = new.employee_id
      where organization_id = new.organization_id
        and user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_employee_organization_access() from public, anon, authenticated;

create trigger sync_employee_organization_access
  after update of employee_id on public.organization_memberships
  for each row execute function public.sync_employee_organization_access();

alter table public.employee_organization_access enable row level security;

create policy "Employees can read their company access"
  on public.employee_organization_access for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.employee_organization_access from anon, authenticated;
grant select on public.employee_organization_access to authenticated;

insert into public.employee_organization_access (organization_id, user_id, employee_id)
select organization_id, user_id, employee_id
from public.organization_memberships
where role = 'employee' and employee_id is not null
on conflict (organization_id, user_id) do update
set employee_id = excluded.employee_id;

with ranked_employee_memberships as (
  select ctid,
    row_number() over (partition by user_id order by created_at desc, organization_id) as membership_rank
  from public.organization_memberships
  where role = 'employee' and employee_id is not null
)
delete from public.organization_memberships as membership
using ranked_employee_memberships as ranked
where membership.ctid = ranked.ctid and ranked.membership_rank > 1;

alter table public.organization_employees
  drop constraint if exists organization_employees_auth_user_id_key;

create or replace function public.get_employee_organizations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', organization.id,
    'name', organization.name,
    'companyCode', coalesce(organization.company_code, ''),
    'employeeId', access.employee_id
  ) order by organization.name), '[]'::jsonb)
  into result
  from public.employee_organization_access as access
  join public.organizations as organization on organization.id = access.organization_id
  join public.organization_employees as employee
    on employee.employee_id = access.employee_id
    and employee.organization_id = access.organization_id
  where access.user_id = (select auth.uid())
    and employee.archived_at is null
    and employee.status <> 'Archyvuotas';

  return result;
end;
$$;

create or replace function public.set_employee_organization(input_organization_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_employee_id text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select access.employee_id into selected_employee_id
  from public.employee_organization_access as access
  where access.user_id = (select auth.uid())
    and access.organization_id = input_organization_id
    and exists (
      select 1
      from public.organization_employees as employee
      where employee.employee_id = access.employee_id
        and employee.organization_id = access.organization_id
        and employee.archived_at is null
        and employee.status <> 'Archyvuotas'
    );

  if not found then
    raise exception 'Employee does not have access to this organization';
  end if;

  delete from public.organization_memberships
  where user_id = (select auth.uid()) and role = 'employee';

  insert into public.organization_memberships (organization_id, user_id, role, employee_id)
  values (input_organization_id, (select auth.uid()), 'employee', selected_employee_id);

  return true;
end;
$$;

create or replace function public.find_employee_account_by_email(input_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth_user.id
  from auth.users as auth_user
  join public.profiles as profile on profile.id = auth_user.id
  where lower(btrim(auth_user.email)) = lower(btrim(input_email))
    and profile.account_type = 'employee'
  limit 1;
$$;

create or replace function public.manager_restore_archived_employee(
  input_organization_id uuid,
  input_archive_id text,
  input_employee jsonb,
  input_protocol_batches jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived_employee_id text;
  employee_user_id uuid;
  restored_employee_id text := input_employee ->> 'id';
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  select archive_entry.value -> 'employee' ->> 'id'
  into archived_employee_id
  from public.organization_data as workspace
  cross join lateral jsonb_array_elements(coalesce(workspace.data -> 'archivedEmployees', '[]'::jsonb)) as archive_entry(value)
  where workspace.organization_id = input_organization_id
    and archive_entry.value ->> 'id' = input_archive_id
    and archive_entry.value ->> 'orgId' = input_organization_id::text;
  if archived_employee_id is null then
    raise exception 'Archived employee record was not found in this organization';
  end if;

  select access.user_id into employee_user_id
  from public.employee_organization_access as access
  where access.organization_id = input_organization_id
    and access.employee_id = archived_employee_id;
  if employee_user_id is null then
    raise exception 'Archived employee account link was not found';
  end if;

  insert into public.organization_memberships (organization_id, user_id, role, employee_id)
  values (input_organization_id, employee_user_id, 'employee', archived_employee_id)
  on conflict (organization_id, user_id) do update
    set employee_id = excluded.employee_id;

  perform public.restore_archived_employee(
    input_organization_id,
    input_archive_id,
    input_employee,
    input_protocol_batches
  );

  delete from public.organization_memberships
  where user_id = employee_user_id and role = 'employee';
  insert into public.organization_memberships (organization_id, user_id, role, employee_id)
  values (input_organization_id, employee_user_id, 'employee', restored_employee_id);

  return true;
end;
$$;

revoke all on function public.get_employee_organizations() from public, anon;
revoke all on function public.set_employee_organization(uuid) from public, anon;
revoke all on function public.find_employee_account_by_email(text) from public, anon, authenticated;
revoke all on function public.manager_restore_archived_employee(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.get_employee_organizations() to authenticated;
grant execute on function public.set_employee_organization(uuid) to authenticated;
grant execute on function public.find_employee_account_by_email(text) to service_role;
grant execute on function public.manager_restore_archived_employee(uuid, text, jsonb, jsonb) to authenticated;
