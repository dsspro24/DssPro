alter table public.organization_commission_assignments
  alter column employee_id drop not null;

alter table public.organization_commission_assignments
  add column if not exists assignee_user_id uuid references auth.users (id) on delete cascade;

alter table public.organization_commission_assignments
  add constraint organization_commission_assignment_assignee_check
  check ((employee_id is null) <> (assignee_user_id is null));

create unique index if not exists organization_commission_one_active_user
  on public.organization_commission_assignments (organization_id, assignee_user_id)
  where assignee_user_id is not null and status in ('pending', 'accepted');

alter table public.protocol_commission_signatures
  alter column employee_id drop not null;

alter table public.protocol_commission_signatures
  add column if not exists signer_user_id uuid references auth.users (id) on delete set null;

create or replace function public.get_organization_commission_assignments(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_member(input_organization_id, array['manager', 'dss_specialist']) then
    raise exception 'Organization member access required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', assignment.assignment_id,
      'organizationId', assignment.organization_id,
      'employeeId', assignment.employee_id,
      'userId', assignment.assignee_user_id,
      'employeeName', coalesce(profile.full_name, employee.full_name),
      'employeeEmail', employee.email,
      'role', assignment.role,
      'status', assignment.status,
      'invitedAt', assignment.invited_at,
      'respondedAt', assignment.responded_at,
      'consentSignaturePath', assignment.consent_signature_path,
      'consentSignatureMethod', assignment.consent_signature_method,
      'consentIp', assignment.consent_ip
    ) order by case assignment.role when 'Komisijos pirmininkas' then 0 else 1 end, coalesce(profile.full_name, employee.full_name))
    from public.organization_commission_assignments as assignment
    left join public.organization_employees as employee
      on employee.employee_id = assignment.employee_id
      and employee.organization_id = assignment.organization_id
    left join public.profiles as profile on profile.id = assignment.assignee_user_id
    where assignment.organization_id = input_organization_id
      and assignment.status <> 'revoked'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.invite_dss_specialist_to_commission(
  input_organization_id uuid,
  input_specialist_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.organization_commission_assignments%rowtype;
  specialist_name text;
begin
  if not public.can_manage_organization(input_organization_id) then
    raise exception 'Organization management access required';
  end if;

  if input_specialist_user_id is null then
    raise exception 'DSS specialist is required';
  end if;

  if not exists (
    select 1 from public.organization_memberships as membership
    where membership.organization_id = input_organization_id
      and membership.user_id = input_specialist_user_id
      and membership.role = 'dss_specialist'
  ) then
    raise exception 'DSS specialist is not assigned to this organization';
  end if;

  if exists (
    select 1 from public.organization_commission_assignments as existing
    where existing.organization_id = input_organization_id
      and existing.assignee_user_id = input_specialist_user_id
      and existing.status in ('pending', 'accepted')
  ) then
    raise exception 'DSS specialist already has an active commission assignment';
  end if;

  select full_name into specialist_name from public.profiles where id = input_specialist_user_id;
  insert into public.organization_commission_assignments (
    organization_id, assignee_user_id, role, status, invited_by, invited_at
  ) values (
    input_organization_id, input_specialist_user_id, 'Komisijos narys', 'pending', auth.uid(), now()
  ) returning * into assignment;

  return jsonb_build_object(
    'id', assignment.assignment_id,
    'organizationId', assignment.organization_id,
    'userId', assignment.assignee_user_id,
    'employeeName', specialist_name,
    'role', assignment.role,
    'status', assignment.status,
    'invitedAt', assignment.invited_at
  );
end;
$$;

create or replace function public.appoint_manager_as_commission_chair(input_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.organization_commission_assignments%rowtype;
  manager_name text;
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  if exists (
    select 1 from public.organization_commission_assignments as current_chair
    where current_chair.organization_id = input_organization_id
      and current_chair.role = 'Komisijos pirmininkas'
      and current_chair.status in ('pending', 'accepted')
      and (current_chair.assignee_user_id is distinct from auth.uid() or current_chair.employee_id is not null)
  ) then
    raise exception 'An active commission chair is already assigned';
  end if;

  select full_name into manager_name from public.profiles where id = auth.uid();
  insert into public.organization_commission_assignments (
    organization_id, assignee_user_id, role, status, invited_by, invited_at, responded_at
  ) values (
    input_organization_id, auth.uid(), 'Komisijos pirmininkas', 'accepted', auth.uid(), now(), now()
  ) on conflict (organization_id, assignee_user_id) where assignee_user_id is not null and status in ('pending', 'accepted')
  do update set role = excluded.role, status = 'accepted', responded_at = now(), updated_at = now()
  returning * into assignment;

  return jsonb_build_object(
    'id', assignment.assignment_id,
    'organizationId', assignment.organization_id,
    'userId', assignment.assignee_user_id,
    'employeeName', manager_name,
    'role', assignment.role,
    'status', assignment.status,
    'invitedAt', assignment.invited_at,
    'respondedAt', assignment.responded_at
  );
end;
$$;

create or replace function public.get_account_commission_invitations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', assignment.assignment_id,
      'organizationId', assignment.organization_id,
      'organizationName', organization.name,
      'userId', assignment.assignee_user_id,
      'role', assignment.role,
      'status', assignment.status,
      'invitedAt', assignment.invited_at
    ) order by assignment.invited_at desc)
    from public.organization_commission_assignments as assignment
    join public.organizations as organization on organization.id = assignment.organization_id
    where assignment.assignee_user_id = auth.uid()
      and assignment.status = 'pending'
      and assignment.role = 'Komisijos narys'
      and public.is_organization_member(assignment.organization_id, array['dss_specialist'])
  ), '[]'::jsonb);
end;
$$;

create or replace function public.respond_to_account_commission_invitation(
  input_assignment_id uuid,
  input_accept boolean,
  input_pin text,
  input_signature_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.organization_commission_assignments%rowtype;
begin
  select * into assignment
  from public.organization_commission_assignments
  where assignment_id = input_assignment_id
    and assignee_user_id = auth.uid()
    and role = 'Komisijos narys'
  for update;
  if not found or assignment.status <> 'pending'
    or not public.is_organization_member(assignment.organization_id, array['dss_specialist']) then
    raise exception 'Commission invitation is no longer available';
  end if;

  if input_accept then
    if coalesce(input_signature_path, '') !~ ('^' || assignment.organization_id::text || '/[0-9a-f-]{36}\.png$') then
      raise exception 'Consent signature path is invalid';
    end if;
    if not public.verify_signing_pin(input_pin) then return null; end if;
  end if;

  update public.organization_commission_assignments
  set status = case when input_accept then 'accepted' else 'declined' end,
      responded_at = now(),
      consent_signature_path = case when input_accept then input_signature_path else null end,
      consent_signature_method = case when input_accept then 'PIN' else null end,
      consent_ip = case when input_accept then private.request_client_ip() else null end,
      updated_at = now()
  where assignment_id = input_assignment_id
  returning * into assignment;

  return jsonb_build_object(
    'id', assignment.assignment_id,
    'organizationId', assignment.organization_id,
    'userId', assignment.assignee_user_id,
    'role', assignment.role,
    'status', assignment.status,
    'respondedAt', assignment.responded_at,
    'consentSignaturePath', assignment.consent_signature_path,
    'consentSignatureMethod', assignment.consent_signature_method,
    'consentIp', assignment.consent_ip
  );
end;
$$;

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
        'employeeName', coalesce(profile.full_name, commission_employee.full_name),
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
        and commission_assignment.responded_at::date <= to_date(batch.value ->> 'protocolDate', 'YYYY-MM-DD')
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
    and assignment.responded_at::date <= to_date(batch.value ->> 'protocolDate', 'YYYY-MM-DD')
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
  if assignment.responded_at is null or assignment.responded_at::date > to_date(batch ->> 'protocolDate', 'YYYY-MM-DD') then
    raise exception 'Commission assignment is not valid for this protocol date';
  end if;

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

revoke all on function public.invite_dss_specialist_to_commission(uuid, uuid) from public, anon;
revoke all on function public.appoint_manager_as_commission_chair(uuid) from public, anon;
revoke all on function public.get_account_commission_invitations() from public, anon;
revoke all on function public.respond_to_account_commission_invitation(uuid, boolean, text, text) from public, anon;
revoke all on function public.get_account_commission_protocol_tasks(uuid) from public, anon;
revoke all on function public.record_account_commission_protocol_signature(uuid, text, text, text) from public, anon;
grant execute on function public.invite_dss_specialist_to_commission(uuid, uuid) to authenticated;
grant execute on function public.appoint_manager_as_commission_chair(uuid) to authenticated;
grant execute on function public.get_account_commission_invitations() to authenticated;
grant execute on function public.respond_to_account_commission_invitation(uuid, boolean, text, text) to authenticated;
grant execute on function public.get_account_commission_protocol_tasks(uuid) to authenticated;
grant execute on function public.record_account_commission_protocol_signature(uuid, text, text, text) to authenticated;

create or replace function public.append_organization_signature(
  input_organization_id uuid,
  input_employee_id text,
  input_resource_id text,
  input_signer_name text,
  input_signer_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  organization_record jsonb;
  employee jsonb;
  resource jsonb;
  resource_settings jsonb;
  required_signers jsonb;
  signature jsonb;
  signature_time timestamptz := now();
  validity_months integer;
begin
  if input_signer_role not in ('Vadovas', 'DSS specialistas', 'Komisijos narys') then
    raise exception 'Signer role is invalid';
  end if;

  select organization_data.data into workspace
  from public.organization_data
  where organization_data.organization_id = input_organization_id
  for update;
  if workspace is null then raise exception 'Organization workspace not found'; end if;

  select item.value into organization_record
  from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = input_organization_id::text;
  select item.value into employee
  from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = input_employee_id
    and item.value ->> 'orgId' = input_organization_id::text;
  select item.value into resource
  from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = input_resource_id;

  if organization_record is null or employee is null or resource is null
    or not (coalesce(employee -> 'resourceIds', '[]'::jsonb) ? input_resource_id) then
    raise exception 'Employee or assigned document was not found';
  end if;

  if resource ->> 'templateKind' = 'intro-dss-journal' then
    resource_settings := organization_record -> 'resourceSettings' -> input_resource_id;
    required_signers := jsonb_build_array('Darbuotojas')
      || case when coalesce((resource_settings ->> 'instructorCanManager')::boolean, false) then jsonb_build_array('Vadovas') else '[]'::jsonb end
      || case when coalesce((resource_settings ->> 'instructorCanDss')::boolean, true) then jsonb_build_array('DSS specialistas') else '[]'::jsonb end;
    if jsonb_array_length(required_signers) = 1 then
      required_signers := jsonb_build_array('Darbuotojas', 'DSS specialistas');
    end if;
  else
    resource_settings := organization_record -> 'resourceSettings' -> input_resource_id;
    required_signers := coalesce(
      employee -> 'requiredSignersByResource' -> input_resource_id,
      resource_settings -> 'requiredSigners',
      resource -> 'requiredSigners',
      '[]'::jsonb
    );
  end if;

  if input_signer_role = 'Komisijos narys' then
    if not (required_signers ? 'Komisijos narys' or required_signers ? 'Komisijos nariai') then
      raise exception 'Commission signature is not required for this document';
    end if;
  elsif not (required_signers ? input_signer_role) then
    raise exception 'This signature is not required for the document';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
    where item.value ->> 'employeeId' = input_employee_id
      and item.value ->> 'resourceId' = input_resource_id
      and item.value ->> 'role' = 'Darbuotojas'
      and (item.value ->> 'validUntil' is null or (item.value ->> 'validUntil')::timestamptz >= signature_time)
  ) then raise exception 'Employee signature is required first'; end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
    where item.value ->> 'employeeId' = input_employee_id
      and item.value ->> 'resourceId' = input_resource_id
      and item.value ->> 'role' = input_signer_role
      and (input_signer_role <> 'Komisijos narys' or item.value ->> 'signer' = input_signer_name)
      and (item.value ->> 'validUntil' is null or (item.value ->> 'validUntil')::timestamptz >= signature_time)
  ) then raise exception 'This signer already has a current signature'; end if;

  validity_months := case when coalesce(resource ->> 'validityMonths', '') ~ '^[0-9]{1,3}$' then (resource ->> 'validityMonths')::integer else null end;
  signature := jsonb_build_object(
    'id', 'sig-' || extensions.gen_random_uuid()::text,
    'orgId', input_organization_id,
    'employeeId', input_employee_id,
    'contractNumber', coalesce(employee ->> 'contractNumber', ''),
    'resourceId', input_resource_id,
    'signer', input_signer_name,
    'role', input_signer_role,
    'signatureMethod', 'PIN',
    'signedAt', signature_time,
    'validUntil', case when validity_months is null then null else signature_time + make_interval(months => validity_months) end,
    'ip', private.request_client_ip()
  );

  if input_resource_id = 'res-aap' then
    signature := signature || jsonb_build_object('aapSnapshot', jsonb_build_object(
      'companyName', organization_record ->> 'name',
      'companyCode', organization_record ->> 'companyCode',
      'employeeId', input_employee_id,
      'employeeName', employee ->> 'name',
      'contractNumber', coalesce(employee ->> 'contractNumber', ''),
      'position', coalesce(employee ->> 'position', 'Darbuotojas'),
      'sizes', coalesce(employee -> 'sizes', '{}'::jsonb),
      'items', coalesce(organization_record -> 'aapItems', '[]'::jsonb)
    ));
  end if;

  update public.organization_data
  set data = jsonb_set(
    organization_data.data,
    '{signatures}',
    coalesce(organization_data.data -> 'signatures', '[]'::jsonb) || jsonb_build_array(signature),
    true
  ), updated_at = now()
  where organization_data.organization_id = input_organization_id;
  return signature;
end;
$$;