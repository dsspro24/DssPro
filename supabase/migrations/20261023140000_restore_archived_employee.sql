create or replace function public.restore_archived_employee(
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
  workspace jsonb;
  organization jsonb;
  archive_record jsonb;
  archived_employee jsonb;
  employee jsonb;
  updated_workspace jsonb;
  updated_batches jsonb;
  proposed_batch jsonb;
  existing_batch jsonb;
  account_user_id uuid;
  archived_employee_id text;
  new_employee_id text := btrim(coalesce(input_employee ->> 'id', ''));
  new_employee_email text := lower(btrim(coalesce(input_employee ->> 'email', '')));
  new_contract_number text := btrim(coalesce(input_employee ->> 'contractNumber', ''));
  new_name text := btrim(coalesce(input_employee ->> 'name', ''));
  new_position text := btrim(coalesce(input_employee ->> 'position', 'Darbuotojas'));
  assigned_resource_id text;
  batch_employee_ids jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;
  if input_employee is null or jsonb_typeof(input_employee) <> 'object'
    or new_employee_id !~ '^emp-[a-z0-9-]{10,80}$'
    or new_name = '' or length(new_name) > 200
    or new_employee_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or new_contract_number = '' or length(new_contract_number) > 120
    or new_position = '' or length(new_position) > 120
    or jsonb_typeof(input_employee -> 'resourceIds') is distinct from 'array' then
    raise exception 'Rehired employee data is invalid';
  end if;
  if input_protocol_batches is null or jsonb_typeof(input_protocol_batches) <> 'array' then
    raise exception 'Protocol batch data is invalid';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data as organization_data
    where organization_data.organization_id = input_organization_id
    for update;
  if workspace is null then
    raise exception 'Organization workspace not found';
  end if;

  select item.value
    into organization
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_organization_id::text;
  if organization is null then
    raise exception 'Organization record not found';
  end if;

  select item.value
    into archive_record
    from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_archive_id
      and item.value ->> 'orgId' = input_organization_id::text;
  if archive_record is null then
    raise exception 'Archived employee record was not found in this organization';
  end if;
  archived_employee := archive_record -> 'employee';
  archived_employee_id := archived_employee ->> 'id';
  if lower(btrim(coalesce(archived_employee ->> 'email', ''))) <> new_employee_email then
    raise exception 'Employee email does not match the archived account';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where lower(btrim(coalesce(item.value ->> 'email', ''))) = new_employee_email
      or lower(btrim(coalesce(item.value ->> 'contractNumber', ''))) = lower(new_contract_number)
  ) then
    raise exception 'Employee email or contract number is already in use';
  end if;

  for assigned_resource_id in
    select jsonb_array_elements_text(input_employee -> 'resourceIds')
  loop
    if not (coalesce(organization -> 'resources', '[]'::jsonb) ? assigned_resource_id)
      or not exists (
        select 1
        from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as resource(value)
        where resource.value ->> 'id' = assigned_resource_id
      ) then
      raise exception 'Employee assignment contains a document not available to this organization';
    end if;
  end loop;

  select membership.user_id
    into account_user_id
    from public.organization_memberships as membership
    where membership.organization_id = input_organization_id
      and membership.employee_id = archived_employee_id
      and membership.role = 'employee';
  if account_user_id is null then
    raise exception 'Archived employee account link was not found';
  end if;
  if not exists (
    select 1
    from public.organization_employees as employee_record
    where employee_record.organization_id = input_organization_id
      and employee_record.employee_id = archived_employee_id
      and employee_record.auth_user_id = account_user_id
  ) then
    raise exception 'Archived employee login is not linked to the organization record';
  end if;

  employee := jsonb_build_object(
    'id', new_employee_id,
    'orgId', input_organization_id::text,
    'name', new_name,
    'email', new_employee_email,
    'contractNumber', new_contract_number,
    'position', new_position,
    'status', 'Aktyvus',
    'inviteCount', 1,
    'invitedAt', coalesce(nullif(input_employee ->> 'invitedAt', ''), now()::text),
    'medicalCertificateValidUntil', coalesce(input_employee ->> 'medicalCertificateValidUntil', ''),
    'medicalCertificateReminderDate', coalesce(input_employee ->> 'medicalCertificateReminderDate', ''),
    'resourceIds', input_employee -> 'resourceIds',
    'sizes', '{"shoes":"","clothes":"","pants":"","jacket":"","height":"","weight":"","helmet":""}'::jsonb,
    'progressByResource', '{}'::jsonb,
    'testResults', '[]'::jsonb,
    'pin', ''
  );

  updated_batches := coalesce(workspace -> 'protocolBatches', '[]'::jsonb);
  for proposed_batch in
    select item.value
    from jsonb_array_elements(input_protocol_batches) as item(value)
    where coalesce(item.value -> 'employeeIds', '[]'::jsonb) ? new_employee_id
  loop
    if proposed_batch ->> 'orgId' is distinct from input_organization_id::text
      or coalesce(proposed_batch ->> 'resourceId', '') = ''
      or not (coalesce(organization -> 'resources', '[]'::jsonb) ? coalesce(proposed_batch ->> 'resourceId', '')) then
      raise exception 'Protocol batch is not available to this organization';
    end if;

    select item.value
      into existing_batch
      from jsonb_array_elements(updated_batches) as item(value)
      where item.value ->> 'id' = proposed_batch ->> 'id';
    if existing_batch is null then
      updated_batches := updated_batches || jsonb_build_array(
        (proposed_batch - 'employeeIds') || jsonb_build_object('employeeIds', jsonb_build_array(new_employee_id))
      );
    else
      if existing_batch ->> 'resourceId' is distinct from proposed_batch ->> 'resourceId'
        or existing_batch ->> 'orgId' is distinct from input_organization_id::text then
        raise exception 'Protocol batch does not match the existing record';
      end if;
      select coalesce(jsonb_agg(to_jsonb(ids.value)), '[]'::jsonb)
        into batch_employee_ids
        from (
          select distinct value
          from jsonb_array_elements_text(coalesce(existing_batch -> 'employeeIds', '[]'::jsonb) || jsonb_build_array(new_employee_id)) as entry(value)
        ) as ids;
      updated_batches := (
        select coalesce(jsonb_agg(
          case when item.value ->> 'id' = proposed_batch ->> 'id'
            then jsonb_set(existing_batch, '{employeeIds}', batch_employee_ids, true)
            else item.value
          end
        ), '[]'::jsonb)
        from jsonb_array_elements(updated_batches) as item(value)
      );
    end if;
    existing_batch := null;
  end loop;

  update public.organization_employees
    set auth_user_id = null,
        updated_at = now()
    where organization_id = input_organization_id
      and employee_id = archived_employee_id
      and auth_user_id = account_user_id;
  update public.organization_memberships
    set employee_id = new_employee_id
    where organization_id = input_organization_id
      and user_id = account_user_id
      and employee_id = archived_employee_id
      and role = 'employee';
  if not found then
    raise exception 'Archived employee login could not be reassigned';
  end if;

  updated_workspace := jsonb_set(
    workspace,
    '{employees}',
    coalesce(workspace -> 'employees', '[]'::jsonb) || jsonb_build_array(employee),
    true
  );
  updated_workspace := jsonb_set(updated_workspace, '{protocolBatches}', updated_batches, true);
  update public.organization_data
    set data = updated_workspace,
        updated_by = auth.uid(),
        updated_at = now()
    where organization_id = input_organization_id;

  return true;
end;
$$;

revoke all on function public.restore_archived_employee(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.restore_archived_employee(uuid, text, jsonb, jsonb) to authenticated;
