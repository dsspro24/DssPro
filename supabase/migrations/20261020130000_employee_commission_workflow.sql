create table if not exists public.organization_commission_assignments (
  assignment_id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id text not null references public.organization_employees (employee_id) on delete cascade,
  role text not null check (role in ('Komisijos narys', 'Komisijos pirmininkas')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  invited_by uuid not null references auth.users (id) on delete restrict,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  consent_signature_path text,
  consent_signature_method text,
  consent_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_commission_one_active_employee
  on public.organization_commission_assignments (organization_id, employee_id)
  where status in ('pending', 'accepted');

create unique index if not exists organization_commission_single_chair
  on public.organization_commission_assignments (organization_id)
  where role = 'Komisijos pirmininkas' and status in ('pending', 'accepted');

create table if not exists public.protocol_commission_signatures (
  signature_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id text not null,
  assignment_id uuid not null references public.organization_commission_assignments (assignment_id) on delete restrict,
  employee_id text not null references public.organization_employees (employee_id) on delete restrict,
  signer_name text not null,
  signer_role text not null check (signer_role in ('Komisijos narys', 'Komisijos pirmininkas')),
  signature_method text not null default 'PIN' check (signature_method = 'PIN'),
  signature_path text not null,
  signed_at timestamptz not null default now(),
  ip_address text,
  unique (batch_id, assignment_id)
);

alter table public.organization_commission_assignments enable row level security;
alter table public.protocol_commission_signatures enable row level security;
revoke all on table public.organization_commission_assignments from public, anon, authenticated;
revoke all on table public.protocol_commission_signatures from public, anon, authenticated;

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
    select jsonb_agg(
      jsonb_build_object(
        'id', assignment.assignment_id,
        'organizationId', assignment.organization_id,
        'employeeId', assignment.employee_id,
        'employeeName', employee.full_name,
        'employeeEmail', employee.email,
        'role', assignment.role,
        'status', assignment.status,
        'invitedAt', assignment.invited_at,
        'respondedAt', assignment.responded_at,
        'consentSignaturePath', assignment.consent_signature_path,
        'consentSignatureMethod', assignment.consent_signature_method,
        'consentIp', assignment.consent_ip
      ) order by case assignment.role when 'Komisijos pirmininkas' then 0 else 1 end, employee.full_name
    )
    from public.organization_commission_assignments as assignment
    join public.organization_employees as employee
      on employee.employee_id = assignment.employee_id
      and employee.organization_id = assignment.organization_id
    where assignment.organization_id = input_organization_id
      and assignment.status <> 'revoked'
  ), '[]'::jsonb);
end;
$$;

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
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
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
  if not found then
    raise exception 'Employee account was not found or employee is archived';
  end if;

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
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;
  update public.organization_commission_assignments
    set status = 'revoked', updated_at = now()
    where organization_id = input_organization_id
      and assignment_id = input_assignment_id
      and status in ('pending', 'accepted');
  return found;
end;
$$;

create or replace function public.get_employee_commission_invitations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  employee_organization_id uuid;
  current_employee_id text;
begin
  select membership.organization_id, membership.employee_id
    into employee_organization_id, current_employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;
  if not found then raise exception 'Employee invitation not found'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', assignment.assignment_id,
      'organizationId', assignment.organization_id,
      'organizationName', organization.name,
      'employeeId', assignment.employee_id,
      'role', assignment.role,
      'status', assignment.status,
      'invitedAt', assignment.invited_at,
      'respondedAt', assignment.responded_at,
      'consentSignaturePath', assignment.consent_signature_path,
      'consentSignatureMethod', assignment.consent_signature_method,
      'consentIp', assignment.consent_ip
    ) order by assignment.invited_at desc)
    from public.organization_commission_assignments as assignment
    join public.organizations as organization on organization.id = assignment.organization_id
    where assignment.organization_id = employee_organization_id
      and assignment.employee_id = current_employee_id
      and assignment.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.respond_to_commission_invitation(
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
  employee_organization_id uuid;
  current_employee_id text;
  assignment public.organization_commission_assignments%rowtype;
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
    for update;
  if not found or assignment.status <> 'pending' then
    raise exception 'Commission invitation is no longer pending';
  end if;

  if input_accept then
    if coalesce(input_signature_path, '') !~ ('^' || employee_organization_id::text || '/[0-9a-f-]{36}\.png$') then
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
    'employeeId', assignment.employee_id,
    'role', assignment.role,
    'status', assignment.status,
    'respondedAt', assignment.responded_at,
    'consentSignaturePath', assignment.consent_signature_path,
    'consentSignatureMethod', assignment.consent_signature_method,
    'consentIp', assignment.consent_ip
  );
end;
$$;

create or replace function public.get_employee_protocol_commission_tasks()
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
  tasks jsonb;
begin
  select membership.organization_id, membership.employee_id
    into employee_organization_id, current_employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;
  if not found then raise exception 'Employee invitation not found'; end if;

  select data into workspace
    from public.organization_data
    where organization_id = employee_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignmentId', assignment.assignment_id,
    'employeeId', assignment.employee_id,
    'role', assignment.role,
    'batchId', batch.value ->> 'id',
    'batchNumber', batch.value -> 'number',
    'protocolDate', batch.value ->> 'protocolDate',
    'resourceId', resource.value ->> 'id',
    'resourceTitle', resource.value ->> 'title',
    'hasSigned', exists (
      select 1
      from public.protocol_commission_signatures as signed_protocol
      where signed_protocol.organization_id = employee_organization_id
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
        ) as employee(value)
          on employee.value ->> 'id' = batch_employee.value #>> '{}'
    ),
    'commissionAssignments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', commission_assignment.assignment_id,
        'employeeId', commission_assignment.employee_id,
        'employeeName', commission_employee.full_name,
        'role', commission_assignment.role,
        'status', commission_assignment.status
      ) order by case commission_assignment.role when 'Komisijos pirmininkas' then 0 else 1 end, commission_employee.full_name), '[]'::jsonb)
      from public.organization_commission_assignments as commission_assignment
      join public.organization_employees as commission_employee
        on commission_employee.employee_id = commission_assignment.employee_id
        and commission_employee.organization_id = commission_assignment.organization_id
      where commission_assignment.organization_id = employee_organization_id
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
        'signer', protocol_signature.signer_name,
        'role', protocol_signature.signer_role,
        'signatureMethod', protocol_signature.signature_method,
        'signaturePath', protocol_signature.signature_path,
        'signedAt', protocol_signature.signed_at,
        'ip', protocol_signature.ip_address
      ) order by protocol_signature.signed_at), '[]'::jsonb)
      from public.protocol_commission_signatures as protocol_signature
      where protocol_signature.organization_id = employee_organization_id
        and protocol_signature.batch_id = batch.value ->> 'id'
    )
  ) order by batch.value ->> 'protocolDate', batch.value ->> 'number'), '[]'::jsonb)
    into tasks
    from public.organization_commission_assignments as assignment
    cross join lateral jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as batch(value)
    join lateral jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as resource(value)
      on resource.value ->> 'id' = batch.value ->> 'resourceId'
    where assignment.organization_id = employee_organization_id
      and assignment.employee_id = current_employee_id
      and assignment.status = 'accepted'
      and assignment.responded_at is not null
      and coalesce(resource.value ->> 'templateKind', '') = 'knowledge-assessment-protocol'
      and coalesce(batch.value ->> 'protocolDate', '') <> ''
      and assignment.responded_at::date <= to_date(batch.value ->> 'protocolDate', 'YYYY-MM-DD')
      and jsonb_array_length(coalesce(batch.value -> 'employeeIds', '[]'::jsonb)) > 0
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
  employee_name text;
  assignment public.organization_commission_assignments%rowtype;
  workspace jsonb;
  batch jsonb;
  resource jsonb;
  signature jsonb;
begin
  select membership.organization_id, membership.employee_id
    into employee_organization_id, current_employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;
  if not found then raise exception 'Employee invitation not found'; end if;

  if coalesce(input_signature_path, '') !~ ('^' || employee_organization_id::text || '/[0-9a-f-]{36}\.png$') then
    raise exception 'Signature storage path is invalid';
  end if;

  select * into assignment
    from public.organization_commission_assignments
    where assignment_id = input_assignment_id
      and organization_id = employee_organization_id
      and organization_commission_assignments.employee_id = current_employee_id
      and status = 'accepted'
    for update;
  if not found then raise exception 'Accepted commission assignment was not found'; end if;

  select data into workspace
    from public.organization_data
    where organization_id = employee_organization_id
    for update;
  select item.value into batch
    from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_batch_id
      and item.value ->> 'orgId' = employee_organization_id::text
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

  if exists (
    select 1 from public.protocol_commission_signatures as existing
    where existing.batch_id = input_batch_id
      and existing.assignment_id = input_assignment_id
  ) then
    raise exception 'This commission member has already signed this protocol';
  end if;

  if not public.verify_signing_pin(input_pin) then return null; end if;

  select full_name into employee_name
    from public.organization_employees
    where organization_employees.employee_id = current_employee_id
      and organization_employees.organization_id = employee_organization_id;
  signature := jsonb_build_object(
    'id', 'protocol-commission-' || extensions.gen_random_uuid()::text,
    'orgId', employee_organization_id,
    'batchId', input_batch_id,
    'assignmentId', input_assignment_id,
    'employeeId', current_employee_id,
    'signer', employee_name,
    'role', assignment.role,
    'signatureMethod', 'PIN',
    'signaturePath', input_signature_path,
    'signedAt', now(),
    'ip', private.request_client_ip()
  );

  insert into public.protocol_commission_signatures (
    signature_id, organization_id, batch_id, assignment_id, employee_id,
    signer_name, signer_role, signature_path, signed_at, ip_address
  ) values (
    signature ->> 'id', employee_organization_id, input_batch_id, input_assignment_id,
    current_employee_id, employee_name, assignment.role, input_signature_path,
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

revoke all on function public.get_organization_commission_assignments(uuid) from public, anon;
revoke all on function public.invite_employee_to_commission(uuid, text, text) from public, anon;
revoke all on function public.revoke_employee_commission_assignment(uuid, uuid) from public, anon;
revoke all on function public.get_employee_commission_invitations() from public, anon;
revoke all on function public.respond_to_commission_invitation(uuid, boolean, text, text) from public, anon;
revoke all on function public.get_employee_protocol_commission_tasks() from public, anon;
revoke all on function public.record_employee_protocol_commission_signature(uuid, text, text, text) from public, anon;
revoke all on function public.get_organization_protocol_commission_signatures(uuid) from public, anon;
grant execute on function public.get_organization_commission_assignments(uuid) to authenticated;
grant execute on function public.invite_employee_to_commission(uuid, text, text) to authenticated;
grant execute on function public.revoke_employee_commission_assignment(uuid, uuid) to authenticated;
grant execute on function public.get_employee_commission_invitations() to authenticated;
grant execute on function public.respond_to_commission_invitation(uuid, boolean, text, text) to authenticated;
grant execute on function public.get_employee_protocol_commission_tasks() to authenticated;
grant execute on function public.record_employee_protocol_commission_signature(uuid, text, text, text) to authenticated;
grant execute on function public.get_organization_protocol_commission_signatures(uuid) to authenticated;
