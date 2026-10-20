create or replace function public.get_employee_sequence_number()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  employee_organization_id uuid;
  current_employee_id text;
  employee_sequence_number integer;
begin
  select membership.organization_id, membership.employee_id
    into employee_organization_id, current_employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;
  if not found then raise exception 'Employee membership not found'; end if;

  select employee.ordinality::integer
    into employee_sequence_number
    from public.organization_data as workspace
    cross join lateral jsonb_array_elements(coalesce(workspace.data -> 'employees', '[]'::jsonb))
      with ordinality as employee(value, ordinality)
    where workspace.organization_id = employee_organization_id
      and employee.value ->> 'id' = current_employee_id
      and employee.value ->> 'orgId' = employee_organization_id::text;
  if not found then raise exception 'Employee record not found'; end if;

  return employee_sequence_number;
end;
$$;

revoke all on function public.get_employee_sequence_number() from public, anon;
grant execute on function public.get_employee_sequence_number() to authenticated;
