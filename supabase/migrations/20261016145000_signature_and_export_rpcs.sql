alter function public.get_employee_workspace() rename to get_employee_workspace_internal;

create or replace function public.get_employee_workspace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  safe_resources jsonb := '[]'::jsonb;
  resource jsonb;
  safe_questions jsonb;
begin
  workspace := public.get_employee_workspace_internal();
  for resource in
    select item.value from jsonb_array_elements(coalesce(workspace #> '{data,resources}', '[]'::jsonb)) as item(value)
  loop
    select coalesce(jsonb_agg(question.value - 'correctIndex' - 'correctIndices'), '[]'::jsonb)
      into safe_questions
      from jsonb_array_elements(coalesce(resource -> 'questions', '[]'::jsonb)) as question(value);
    safe_resources := safe_resources || jsonb_build_array(jsonb_set(resource, '{questions}', safe_questions, true));
  end loop;
  workspace := jsonb_set(workspace, '{data,resources}', safe_resources, true);
  return workspace;
end;
$$;

revoke all on function public.get_employee_workspace() from public, anon;
revoke all on function public.get_employee_workspace_internal() from public, anon, authenticated;
grant execute on function public.get_employee_workspace() to authenticated;

update public.organization_data as workspace
set data = jsonb_set(
  workspace.data,
  '{organizations}',
  (
    select coalesce(jsonb_agg(organization.value - 'commissionPins'), '[]'::jsonb)
    from jsonb_array_elements(coalesce(workspace.data -> 'organizations', '[]'::jsonb)) as organization(value)
  ),
  true
)
where exists (
  select 1 from jsonb_array_elements(coalesce(workspace.data -> 'organizations', '[]'::jsonb)) as organization(value)
  where organization.value ? 'commissionPins'
);

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

  required_signers := coalesce(employee -> 'requiredSignersByResource' -> input_resource_id, resource -> 'requiredSigners', '[]'::jsonb);
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
  ) then
    raise exception 'Employee signature is required first';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
    where item.value ->> 'employeeId' = input_employee_id
      and item.value ->> 'resourceId' = input_resource_id
      and item.value ->> 'role' = input_signer_role
      and (input_signer_role <> 'Komisijos narys' or item.value ->> 'signer' = input_signer_name)
      and (item.value ->> 'validUntil' is null or (item.value ->> 'validUntil')::timestamptz >= signature_time)
  ) then
    raise exception 'This signer already has a current signature';
  end if;

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
    'ip', 'Server verified'
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

  update public.organization_data as organization_data
    set data = jsonb_set(organization_data.data, '{signatures}',
      coalesce(organization_data.data -> 'signatures', '[]'::jsonb) || jsonb_build_array(signature), true),
      updated_at = now()
    where organization_data.organization_id = input_organization_id;
  return signature;
end;
$$;

create or replace function public.record_manager_signature(input_employee_id text, input_resource_id text, input_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
  workspace jsonb;
  organization_record jsonb;
  signer_name text;
begin
  select employee_record.organization_id into organization_id
    from public.organization_employees as employee_record where employee_record.employee_id = input_employee_id;
  if not found or not public.is_organization_member(organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;
  if not public.verify_signing_pin(input_pin) then return null; end if;
  select organization_data.data into workspace from public.organization_data where organization_data.organization_id = organization_id;
  select item.value into organization_record
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = organization_id::text;
  select full_name into signer_name from public.profiles where id = auth.uid();
  return public.append_organization_signature(organization_id, input_employee_id, input_resource_id,
    coalesce(nullif(signer_name, ''), organization_record ->> 'manager', 'Įmonės vadovas'), 'Vadovas');
end;
$$;

create or replace function public.record_dss_signature(input_organization_id uuid, input_employee_id text, input_resource_id text, input_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  signer_name text;
begin
  if not public.is_organization_member(input_organization_id, array['dss_specialist']) then
    raise exception 'Assigned DSS specialist access required';
  end if;
  if not public.verify_signing_pin(input_pin) then return null; end if;
  select full_name into signer_name from public.profiles where id = auth.uid();
  return public.append_organization_signature(input_organization_id, input_employee_id, input_resource_id,
    coalesce(nullif(signer_name, ''), 'DSS specialistas'), 'DSS specialistas');
end;
$$;

create or replace function public.get_commission_signer_status(input_organization_id uuid)
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
    select jsonb_object_agg(signer.signer_name, true)
    from public.organization_commission_signers as signer
    where signer.organization_id = input_organization_id and signer.active
  ), '{}'::jsonb);
end;
$$;

create or replace function public.set_commission_signer_pin(input_organization_id uuid, input_signer_name text, input_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then raise exception 'Organization manager access required'; end if;
  if input_pin !~ '^[0-9]{4}$' then raise exception 'PIN must contain exactly four digits'; end if;
  select organization_data.data into workspace from public.organization_data where organization_data.organization_id = input_organization_id;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_organization_id::text and coalesce(item.value -> 'commission', '[]'::jsonb) ? input_signer_name
  ) then raise exception 'Commission member is not registered for this organization'; end if;

  insert into public.organization_commission_signers (organization_id, signer_name, pin_hash, created_by)
  values (input_organization_id, input_signer_name, extensions.crypt(input_pin, extensions.gen_salt('bf', 12)), auth.uid())
  on conflict (organization_id, signer_name) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null,
        active = true, created_by = excluded.created_by, updated_at = now();
  return true;
end;
$$;

create or replace function public.record_commission_signature(input_organization_id uuid, input_employee_id text, input_resource_id text, input_signer_name text, input_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  signer public.organization_commission_signers%rowtype;
  next_attempts integer;
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then raise exception 'Organization manager access required'; end if;
  select * into signer from public.organization_commission_signers
    where organization_id = input_organization_id and signer_name = input_signer_name and active for update;
  if not found then raise exception 'Commission PIN is not configured'; end if;
  if signer.locked_until > now() then return null; end if;
  if input_pin !~ '^[0-9]{4}$' or extensions.crypt(input_pin, signer.pin_hash) <> signer.pin_hash then
    next_attempts := signer.failed_attempts + 1;
    update public.organization_commission_signers
      set failed_attempts = next_attempts,
          locked_until = case when next_attempts >= 5 then now() + interval '15 minutes' else null end,
          updated_at = now()
      where organization_id = input_organization_id and signer_name = input_signer_name;
    return null;
  end if;
  update public.organization_commission_signers set failed_attempts = 0, locked_until = null, updated_at = now()
    where organization_id = input_organization_id and signer_name = input_signer_name;
  return public.append_organization_signature(input_organization_id, input_employee_id, input_resource_id, input_signer_name, 'Komisijos narys');
end;
$$;

create or replace function public.request_data_export(input_organization_id uuid, input_format text default 'zip', input_filters jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  export_id uuid;
begin
  if auth.uid() is null or not public.is_organization_member(input_organization_id, array['manager']) then raise exception 'Organization manager access required'; end if;
  if input_format not in ('pdf', 'zip') then raise exception 'Export format must be pdf or zip'; end if;
  if jsonb_typeof(input_filters) <> 'object' then raise exception 'Export filters must be an object'; end if;
  insert into public.export_jobs (organization_id, requested_by, export_format, filters)
  values (input_organization_id, auth.uid(), input_format, input_filters) returning id into export_id;
  return export_id;
end;
$$;

revoke all on function public.append_organization_signature(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_manager_signature(text, text, text) from public, anon;
revoke all on function public.record_dss_signature(uuid, text, text, text) from public, anon;
revoke all on function public.get_commission_signer_status(uuid) from public, anon;
revoke all on function public.set_commission_signer_pin(uuid, text, text) from public, anon;
revoke all on function public.record_commission_signature(uuid, text, text, text, text) from public, anon;
revoke all on function public.request_data_export(uuid, text, jsonb) from public, anon;
grant execute on function public.record_manager_signature(text, text, text) to authenticated;
grant execute on function public.record_dss_signature(uuid, text, text, text) to authenticated;
grant execute on function public.get_commission_signer_status(uuid) to authenticated;
grant execute on function public.set_commission_signer_pin(uuid, text, text) to authenticated;
grant execute on function public.record_commission_signature(uuid, text, text, text, text) to authenticated;
grant execute on function public.request_data_export(uuid, text, jsonb) to authenticated;