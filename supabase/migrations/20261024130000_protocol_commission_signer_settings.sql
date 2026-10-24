alter function public.record_employee_protocol_commission_signature(uuid, text, text, text)
  rename to record_employee_protocol_commission_signature_unchecked;

revoke all on function public.record_employee_protocol_commission_signature_unchecked(uuid, text, text, text)
  from public, anon, authenticated;

create or replace function public.record_employee_protocol_commission_signature(
  input_assignment_id uuid,
  input_batch_id text,
  input_pin text,
  input_signature_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_organization_id uuid;
  current_employee_id text;
  assignment public.organization_commission_assignments%rowtype;
  workspace jsonb;
  batch jsonb;
  resource_settings jsonb;
begin
  select membership.organization_id, membership.employee_id
    into employee_organization_id, current_employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;
  if not found then raise exception 'Employee invitation not found'; end if;

  select * into assignment
    from public.organization_commission_assignments
    where assignment_id = input_assignment_id
      and organization_id = employee_organization_id
      and organization_commission_assignments.employee_id = current_employee_id
      and status = 'accepted';
  if not found then raise exception 'Accepted commission assignment was not found'; end if;

  select data into workspace
    from public.organization_data
    where organization_id = employee_organization_id;
  select item.value into batch
    from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_batch_id
      and item.value ->> 'orgId' = employee_organization_id::text;

  select organization.value -> 'resourceSettings' -> (batch ->> 'resourceId')
    into resource_settings
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as organization(value)
    where organization.value ->> 'id' = employee_organization_id::text;

  if resource_settings -> 'commissionSignerOverrides' ? assignment.role
    and coalesce((resource_settings -> 'commissionSignerOverrides' ->> assignment.role)::boolean, false) = false then
    raise exception 'This commission role is not required to sign the protocol';
  end if;

  return public.record_employee_protocol_commission_signature_unchecked(
    input_assignment_id,
    input_batch_id,
    input_pin,
    input_signature_path
  );
end;
$$;

revoke all on function public.record_employee_protocol_commission_signature(uuid, text, text, text)
  from public, anon;
grant execute on function public.record_employee_protocol_commission_signature(uuid, text, text, text)
  to authenticated;
