alter table public.organization_memberships
  add column if not exists can_manage_workspace boolean not null default false;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_creator() or exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and (
        membership.role = 'manager'
        or (membership.role = 'dss_specialist' and membership.can_manage_workspace)
      )
  );
$$;

create or replace function public.get_dss_management_access(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', membership.user_id,
      'canManageWorkspace', membership.can_manage_workspace
    ))
    from public.organization_memberships as membership
    where membership.organization_id = input_organization_id
      and membership.role = 'dss_specialist'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.set_dss_management_access(
  input_organization_id uuid,
  input_specialist_user_id uuid,
  input_can_manage boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  update public.organization_memberships
    set can_manage_workspace = coalesce(input_can_manage, false)
    where organization_id = input_organization_id
      and user_id = input_specialist_user_id
      and role = 'dss_specialist';
  return found;
end;
$$;

revoke all on function public.can_manage_organization(uuid) from public, anon;
revoke all on function public.get_dss_management_access(uuid) from public, anon;
revoke all on function public.set_dss_management_access(uuid, uuid, boolean) from public, anon;
grant execute on function public.can_manage_organization(uuid) to authenticated;
grant execute on function public.get_dss_management_access(uuid) to authenticated;
grant execute on function public.set_dss_management_access(uuid, uuid, boolean) to authenticated;

create policy "Delegated DSS managers can update organization workspace"
  on public.organization_data for update to authenticated
  using (
    exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = organization_data.organization_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'dss_specialist'
        and membership.can_manage_workspace
    )
  )
  with check (
    updated_by = (select auth.uid())
    and exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = organization_data.organization_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'dss_specialist'
        and membership.can_manage_workspace
    )
  );

create policy "Delegated DSS managers can upload organization assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'organization-assets'
    and exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = (storage.foldername(name))[1]::uuid
        and membership.user_id = (select auth.uid())
        and membership.role = 'dss_specialist'
        and membership.can_manage_workspace
    )
  );

create policy "Delegated DSS managers can update organization assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'organization-assets'
    and exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = (storage.foldername(name))[1]::uuid
        and membership.user_id = (select auth.uid())
        and membership.role = 'dss_specialist'
        and membership.can_manage_workspace
    )
  )
  with check (
    bucket_id = 'organization-assets'
    and exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = (storage.foldername(name))[1]::uuid
        and membership.user_id = (select auth.uid())
        and membership.role = 'dss_specialist'
        and membership.can_manage_workspace
    )
  );

create policy "Delegated DSS managers can delete organization assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'organization-assets'
    and exists (
      select 1 from public.organization_memberships as membership
      where membership.organization_id = (storage.foldername(name))[1]::uuid
        and membership.user_id = (select auth.uid())
        and membership.role = 'dss_specialist'
        and membership.can_manage_workspace
    )
  );

create or replace function public.invite_employee_to_commission(
  input_organization_id uuid,
  input_employee_id text,
  input_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_record public.organization_employees%rowtype;
  assignment public.organization_commission_assignments%rowtype;
begin
  if not public.can_manage_organization(input_organization_id) then
    raise exception 'Organization management access required';
  end if;
  if input_role not in ('Komisijos narys', 'Komisijos pirmininkas') then
    raise exception 'Commission role is invalid';
  end if;
  if exists (
    select 1 from public.organization_commission_assignments as existing_assignment
    where existing_assignment.organization_id = input_organization_id
      and existing_assignment.employee_id = input_employee_id
      and existing_assignment.status in ('pending', 'accepted')
  ) then
    raise exception 'Employee already has an active commission assignment';
  end if;

  select employee.* into employee_record
    from public.organization_employees as employee
    join public.organization_memberships as membership
      on membership.organization_id = employee.organization_id
      and membership.employee_id = employee.employee_id
      and membership.role = 'employee'
    where employee.organization_id = input_organization_id
      and employee.employee_id = input_employee_id
      and employee.archived_at is null
      and membership.user_id is not null;
  if not found then raise exception 'Employee account was not found or employee is archived'; end if;

  if input_role = 'Komisijos pirmininkas' and exists (
    select 1 from public.organization_commission_assignments as current_chair
    where current_chair.organization_id = input_organization_id
      and current_chair.role = 'Komisijos pirmininkas'
      and current_chair.status in ('pending', 'accepted')
      and current_chair.employee_id <> input_employee_id
  ) then
    raise exception 'An active commission chair is already assigned';
  end if;

  insert into public.organization_commission_assignments (
    organization_id, employee_id, role, status, invited_by, invited_at
  ) values (
    input_organization_id, input_employee_id, input_role, 'pending', auth.uid(), now()
  ) returning * into assignment;

  return jsonb_build_object(
    'id', assignment.assignment_id,
    'organizationId', assignment.organization_id,
    'employeeId', assignment.employee_id,
    'employeeName', employee_record.full_name,
    'employeeEmail', employee_record.email,
    'role', assignment.role,
    'status', assignment.status,
    'invitedAt', assignment.invited_at
  );
end;
$$;

create or replace function public.revoke_employee_commission_assignment(
  input_organization_id uuid,
  input_assignment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_organization(input_organization_id) then
    raise exception 'Organization management access required';
  end if;
  update public.organization_commission_assignments
    set status = 'revoked', updated_at = now()
    where organization_id = input_organization_id
      and assignment_id = input_assignment_id
      and status in ('pending', 'accepted');
  return found;
end;
$$;