create or replace function public.get_employee_protocol_commission_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  employee_organization_id uuid;
  current_employee_id text;
  workspace jsonb;
  status_data jsonb;
begin
  select membership.organization_id, membership.employee_id
    into employee_organization_id, current_employee_id
    from public.organization_memberships as membership
    where membership.user_id = auth.uid()
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;
  if not found then raise exception 'Employee invitation not found'; end if;

  select data into workspace
  from public.organization_data
  where organization_id = employee_organization_id;
  if workspace is null then raise exception 'Organization workspace not found'; end if;

  select jsonb_build_object(
    'commissionAssignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assignment.assignment_id,
        'batchId', batch.value ->> 'id',
        'employeeId', assignment.employee_id,
        'userId', assignment.assignee_user_id,
        'employeeName', coalesce(nullif(profile.full_name, ''), commission_employee.full_name, 'Komisijos narys'),
        'role', assignment.role,
        'status', assignment.status
      ) order by case assignment.role when 'Komisijos pirmininkas' then 0 else 1 end,
        coalesce(profile.full_name, commission_employee.full_name))
      from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as batch(value)
      join lateral jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as resource(value)
        on resource.value ->> 'id' = batch.value ->> 'resourceId'
      join public.organization_commission_assignments as assignment
        on assignment.organization_id = employee_organization_id
      left join public.organization_employees as commission_employee
        on commission_employee.employee_id = assignment.employee_id
        and commission_employee.organization_id = assignment.organization_id
      left join public.profiles as profile on profile.id = assignment.assignee_user_id
      where batch.value ->> 'orgId' = employee_organization_id::text
        and coalesce(batch.value -> 'employeeIds', '[]'::jsonb) ? current_employee_id
        and coalesce(resource.value ->> 'templateKind', '') = 'knowledge-assessment-protocol'
        and assignment.status = 'accepted'
        and assignment.responded_at is not null
        and coalesce((workspace -> 'organizations' -> 0 -> 'resourceSettings' -> (resource.value ->> 'id') -> 'commissionSignerOverrides' ->> assignment.role)::boolean, true)
    ), '[]'::jsonb),
    'protocolCommissionSignatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', signature.signature_id,
        'orgId', signature.organization_id,
        'batchId', signature.batch_id,
        'assignmentId', signature.assignment_id,
        'employeeId', signature.employee_id,
        'userId', signature.signer_user_id,
        'signer', signature.signer_name,
        'role', signature.signer_role,
        'signatureMethod', signature.signature_method,
        'signaturePath', signature.signature_path,
        'signedAt', signature.signed_at,
        'ip', signature.ip_address
      ) order by signature.signed_at)
      from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as batch(value)
      join public.protocol_commission_signatures as signature
        on signature.organization_id = employee_organization_id
        and signature.batch_id = batch.value ->> 'id'
      join lateral jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as resource(value)
        on resource.value ->> 'id' = batch.value ->> 'resourceId'
      where batch.value ->> 'orgId' = employee_organization_id::text
        and coalesce(batch.value -> 'employeeIds', '[]'::jsonb) ? current_employee_id
        and coalesce(resource.value ->> 'templateKind', '') = 'knowledge-assessment-protocol'
    ), '[]'::jsonb)
  ) into status_data;

  return status_data;
end;
$$;

revoke all on function public.get_employee_protocol_commission_status() from public, anon;
grant execute on function public.get_employee_protocol_commission_status() to authenticated;
