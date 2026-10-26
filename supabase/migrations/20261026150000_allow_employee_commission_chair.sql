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