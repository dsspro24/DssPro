create or replace function public.creator_get_account_commission_protocol_tasks(
  input_organization_id uuid,
  input_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  current_user_name text;
  tasks jsonb;
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  if not exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = input_organization_id
      and membership.user_id = input_user_id
      and membership.role = 'dss_specialist'
  ) then
    raise exception 'DSS specialist access required';
  end if;

  select full_name into current_user_name
  from public.profiles
  where id = input_user_id;

  select data into workspace
  from public.organization_data
  where organization_id = input_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignmentId', assignment.assignment_id,
    'organizationId', assignment.organization_id,
    'userId', assignment.assignee_user_id,
    'employeeId', assignment.employee_id,
    'employeeName', coalesce(nullif(current_user_name, ''), 'Komisijos narys'),
    'role', assignment.role,
    'batchId', batch.value ->> 'id',
    'batchNumber', batch.value -> 'number',
    'protocolDate', batch.value ->> 'protocolDate',
    'resourceId', resource.value ->> 'id',
    'resourceTitle', resource.value ->> 'title',
    'hasSigned', exists (
      select 1
      from public.protocol_commission_signatures as signed_protocol
      where signed_protocol.organization_id = input_organization_id
        and signed_protocol.batch_id = batch.value ->> 'id'
        and signed_protocol.assignment_id = assignment.assignment_id
    ),
    'employeeNames', (
      select coalesce(jsonb_agg(employee.value ->> 'name' order by employee.value ->> 'name'), '[]'::jsonb)
      from jsonb_array_elements(coalesce(batch.value -> 'employeeIds', '[]'::jsonb)) as batch_employee(value)
      join (
        select active_employee.value
        from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as active_employee(value)
        union all
        select archived_employee.value -> 'employee'
        from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as archived_employee(value)
      ) as employee(value) on employee.value ->> 'id' = batch_employee.value #>> '{}'
    ),
    'commissionAssignments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', commission_assignment.assignment_id,
        'employeeId', commission_assignment.employee_id,
        'userId', commission_assignment.assignee_user_id,
        'employeeName', coalesce(nullif(profile.full_name, ''), commission_employee.full_name, 'Komisijos narys'),
        'role', commission_assignment.role,
        'status', commission_assignment.status
      ) order by case commission_assignment.role when 'Komisijos pirmininkas' then 0 else 1 end,
        coalesce(profile.full_name, commission_employee.full_name)), '[]'::jsonb)
      from public.organization_commission_assignments as commission_assignment
      left join public.organization_employees as commission_employee
        on commission_employee.employee_id = commission_assignment.employee_id
        and commission_employee.organization_id = commission_assignment.organization_id
      left join public.profiles as profile on profile.id = commission_assignment.assignee_user_id
      where commission_assignment.organization_id = input_organization_id
        and commission_assignment.status = 'accepted'
        and commission_assignment.responded_at is not null
    ),
    'protocolCommissionSignatures', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', protocol_signature.signature_id,
        'orgId', protocol_signature.organization_id,
        'batchId', protocol_signature.batch_id,
        'assignmentId', protocol_signature.assignment_id,
        'employeeId', protocol_signature.employee_id,
        'userId', protocol_signature.signer_user_id,
        'signer', protocol_signature.signer_name,
        'role', protocol_signature.signer_role,
        'signatureMethod', protocol_signature.signature_method,
        'signaturePath', protocol_signature.signature_path,
        'signedAt', protocol_signature.signed_at,
        'ip', protocol_signature.ip_address
      ) order by protocol_signature.signed_at), '[]'::jsonb)
      from public.protocol_commission_signatures as protocol_signature
      where protocol_signature.organization_id = input_organization_id
        and protocol_signature.batch_id = batch.value ->> 'id'
    )
  ) order by batch.value ->> 'protocolDate', batch.value ->> 'number'), '[]'::jsonb)
  into tasks
  from public.organization_commission_assignments as assignment
  cross join lateral jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as batch(value)
  join lateral jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as resource(value)
    on resource.value ->> 'id' = batch.value ->> 'resourceId'
  where assignment.organization_id = input_organization_id
    and assignment.assignee_user_id = input_user_id
    and assignment.status = 'accepted'
    and assignment.responded_at is not null
    and coalesce(resource.value ->> 'templateKind', '') = 'knowledge-assessment-protocol'
    and coalesce(batch.value ->> 'protocolDate', '') <> ''
    and jsonb_array_length(coalesce(batch.value -> 'employeeIds', '[]'::jsonb)) > 0
    and coalesce((workspace -> 'organizations' -> 0 -> 'resourceSettings' -> (resource.value ->> 'id') -> 'commissionSignerOverrides' ->> assignment.role)::boolean, true)
    and (
      coalesce(resource.value ->> 'relatedTestId', '') = ''
      or not exists (
        select 1
        from jsonb_array_elements(coalesce(batch.value -> 'employeeIds', '[]'::jsonb)) as batch_employee(value)
        where not exists (
          select 1
          from (
            select active_employee.value
            from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as active_employee(value)
            union all
            select archived_employee.value -> 'employee'
            from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as archived_employee(value)
          ) as employee(value)
          cross join lateral jsonb_array_elements(coalesce(employee.value -> 'testResults', '[]'::jsonb)) as result(value)
          where employee.value ->> 'id' = batch_employee.value #>> '{}'
            and result.value ->> 'resourceId' = resource.value ->> 'relatedTestId'
            and coalesce((result.value ->> 'passed')::boolean, false)
        )
      )
    );

  return coalesce(tasks, '[]'::jsonb);
end;
$$;

revoke all on function public.creator_get_account_commission_protocol_tasks(uuid, uuid) from public, anon;
grant execute on function public.creator_get_account_commission_protocol_tasks(uuid, uuid) to authenticated;
