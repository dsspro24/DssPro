create or replace function public.get_account_commission_protocol_tasks(input_organization_id uuid)
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
  if not public.is_organization_member(input_organization_id, array['manager', 'dss_specialist']) then
    raise exception 'Organization member access required';
  end if;

  select full_name into current_user_name from public.profiles where id = auth.uid();
  select data into workspace from public.organization_data where organization_id = input_organization_id;

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
      select 1 from public.protocol_commission_signatures as signed_protocol
      where signed_protocol.organization_id = input_organization_id
        and signed_protocol.batch_id = batch.value ->> 'id'
        and signed_protocol.assignment_id = assignment.assignment_id
    ),
    'employeeNames', (
      select coalesce(jsonb_agg(employee.value ->> 'name' order by employee.value ->> 'name'), '[]'::jsonb)
      from jsonb_array_elements(coalesce(batch.value -> 'employeeIds', '[]'::jsonb)) as batch_employee(value)
      join (
        select active_employee.value from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as active_employee(value)
        union all
        select archived_employee.value -> 'employee' from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as archived_employee(value)
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
    and assignment.assignee_user_id = auth.uid()
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
            select active_employee.value from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as active_employee(value)
            union all
            select archived_employee.value -> 'employee' from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as archived_employee(value)
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

create or replace function public.record_account_commission_protocol_signature(
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
  assignment public.organization_commission_assignments%rowtype;
  workspace jsonb;
  batch jsonb;
  resource jsonb;
  signer_name text;
  signature jsonb;
begin
  select * into assignment
  from public.organization_commission_assignments
  where assignment_id = input_assignment_id
    and assignee_user_id = auth.uid()
    and status = 'accepted'
  for update;
  if not found then raise exception 'Accepted commission assignment was not found'; end if;

  if assignment.role = 'Komisijos pirmininkas'
    and not public.is_organization_member(assignment.organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  elsif assignment.role = 'Komisijos narys'
    and not public.is_organization_member(assignment.organization_id, array['dss_specialist']) then
    raise exception 'Assigned DSS specialist access required';
  end if;

  if coalesce(input_signature_path, '') !~ ('^' || assignment.organization_id::text || '/[0-9a-f-]{36}\.png$') then
    raise exception 'Signature storage path is invalid';
  end if;

  select data into workspace
  from public.organization_data
  where organization_id = assignment.organization_id
  for update;
  select item.value into batch
  from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = input_batch_id
    and item.value ->> 'orgId' = assignment.organization_id::text
    and coalesce(item.value ->> 'protocolDate', '') <> '';
  if batch is null then raise exception 'Ready protocol batch was not found'; end if;

  select item.value into resource
  from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = batch ->> 'resourceId'
    and item.value ->> 'templateKind' = 'knowledge-assessment-protocol';
  if resource is null then raise exception 'Knowledge assessment protocol was not found'; end if;

  if coalesce(resource ->> 'relatedTestId', '') <> '' and exists (
    select 1
    from jsonb_array_elements(coalesce(batch -> 'employeeIds', '[]'::jsonb)) as batch_employee(value)
    where not exists (
      select 1
      from (
        select active_employee.value from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as active_employee(value)
        union all
        select archived_employee.value -> 'employee' from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as archived_employee(value)
      ) as employee(value)
      cross join lateral jsonb_array_elements(coalesce(employee.value -> 'testResults', '[]'::jsonb)) as result(value)
      where employee.value ->> 'id' = batch_employee.value #>> '{}'
        and result.value ->> 'resourceId' = resource ->> 'relatedTestId'
        and coalesce((result.value ->> 'passed')::boolean, false)
    )
  ) then
    raise exception 'All employees must pass the required test before protocol signatures';
  end if;

  if not coalesce((
    select (organization.value -> 'resourceSettings' -> (resource ->> 'id') -> 'commissionSignerOverrides' ->> assignment.role)::boolean
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as organization(value)
    where organization.value ->> 'id' = assignment.organization_id::text
  ), true) then
    raise exception 'This commission role is not required to sign the protocol';
  end if;

  if exists (
    select 1 from public.protocol_commission_signatures as existing
    where existing.organization_id = assignment.organization_id
      and existing.batch_id = input_batch_id
      and existing.assignment_id = input_assignment_id
  ) then
    raise exception 'This commission member has already signed this protocol';
  end if;
  if not public.verify_signing_pin(input_pin) then return null; end if;

  select full_name into signer_name from public.profiles where id = auth.uid();
  signature := jsonb_build_object(
    'id', 'protocol-commission-' || extensions.gen_random_uuid()::text,
    'orgId', assignment.organization_id,
    'batchId', input_batch_id,
    'assignmentId', input_assignment_id,
    'employeeId', null,
    'userId', auth.uid(),
    'signer', coalesce(nullif(signer_name, ''), 'Komisijos narys'),
    'role', assignment.role,
    'signatureMethod', 'PIN',
    'signaturePath', input_signature_path,
    'signedAt', now(),
    'ip', private.request_client_ip()
  );

  insert into public.protocol_commission_signatures (
    signature_id, organization_id, batch_id, assignment_id, employee_id, signer_user_id,
    signer_name, signer_role, signature_path, signed_at, ip_address
  ) values (
    signature ->> 'id', assignment.organization_id, input_batch_id, input_assignment_id, null, auth.uid(),
    signature ->> 'signer', assignment.role, input_signature_path,
    (signature ->> 'signedAt')::timestamptz, signature ->> 'ip'
  );

  return signature;
end;
$$;

create or replace function public.get_organization_protocol_commission_signatures(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_member(input_organization_id, array['manager', 'dss_specialist']) then
    raise exception 'Organization access required';
  end if;
  return coalesce((
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
    from public.protocol_commission_signatures as signature
    where signature.organization_id = input_organization_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_account_commission_protocol_tasks(uuid) from public, anon;
revoke all on function public.record_account_commission_protocol_signature(uuid, text, text, text) from public, anon;
grant execute on function public.get_account_commission_protocol_tasks(uuid) to authenticated;
grant execute on function public.record_account_commission_protocol_signature(uuid, text, text, text) to authenticated;
