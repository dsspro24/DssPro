create or replace function public.record_employee_signature(
  input_resource_id text,
  input_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_organization_id uuid;
  employee_id text;
  workspace jsonb;
  employee jsonb;
  organization jsonb;
  resource jsonb;
  signature jsonb;
  signature_time timestamptz := now();
  validity_months integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.verify_signing_pin(input_pin) then
    return null;
  end if;

  select membership.organization_id, membership.employee_id
    into employee_organization_id, employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;

  if not found then
    raise exception 'Employee invitation not found';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = employee_organization_id
    for update;

  select item.value
    into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_id;

  select item.value
    into resource
    from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_resource_id;

  select item.value
    into organization
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_organization_id::text;

  if employee is null or resource is null
    or not (coalesce(employee -> 'resourceIds', '[]'::jsonb) ? input_resource_id) then
    raise exception 'Document is not assigned to this employee';
  end if;

  if coalesce(resource ->> 'relatedTestId', '') <> '' and not exists (
    select 1
    from jsonb_array_elements(coalesce(employee -> 'testResults', '[]'::jsonb)) as result(value)
    where result.value ->> 'resourceId' = resource ->> 'relatedTestId'
      and coalesce((result.value ->> 'passed')::boolean, false)
  ) then
    raise exception 'Complete the required test before signing this document';
  end if;

  if resource ->> 'type' = 'Testas' and not exists (
    select 1
    from jsonb_array_elements(coalesce(employee -> 'testResults', '[]'::jsonb)) as result(value)
    where result.value ->> 'resourceId' = input_resource_id
      and coalesce((result.value ->> 'passed')::boolean, false)
  ) then
    raise exception 'Pass the test before signing it';
  end if;

  if resource ->> 'type' <> 'Testas'
    and coalesce(employee -> 'progressByResource' ->> input_resource_id, '') <> 'completed' then
    raise exception 'Complete the document before signing it';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as existing(value)
    where existing.value ->> 'employeeId' = employee_id
      and existing.value ->> 'resourceId' = input_resource_id
      and existing.value ->> 'role' = 'Darbuotojas'
      and (existing.value ->> 'validUntil' is null or (existing.value ->> 'validUntil')::timestamptz >= signature_time)
  ) then
    raise exception 'This document is already signed';
  end if;

  validity_months := case
    when coalesce(resource ->> 'validityMonths', '') ~ '^[0-9]{1,3}$' then (resource ->> 'validityMonths')::integer
    else null
  end;

  signature := jsonb_build_object(
    'id', 'sig-' || extensions.gen_random_uuid()::text,
    'orgId', employee_organization_id,
    'employeeId', employee_id,
    'contractNumber', coalesce(employee ->> 'contractNumber', ''),
    'resourceId', input_resource_id,
    'signer', employee ->> 'name',
    'role', 'Darbuotojas',
    'signatureMethod', 'PIN',
    'signedAt', signature_time,
    'validUntil', case when validity_months is null then null else signature_time + make_interval(months => validity_months) end,
    'ip', private.request_client_ip()
  );

  if input_resource_id = 'res-aap' then
    signature := signature || jsonb_build_object('aapSnapshot', jsonb_build_object(
      'companyName', organization ->> 'name',
      'companyCode', organization ->> 'companyCode',
      'employeeId', employee_id,
      'employeeName', employee ->> 'name',
      'contractNumber', coalesce(employee ->> 'contractNumber', ''),
      'department', coalesce(employee ->> 'department', ''),
      'position', coalesce(employee ->> 'position', 'Darbuotojas'),
      'sizes', coalesce(employee -> 'sizes', '{}'::jsonb),
      'items', coalesce(organization -> 'aapItems', '[]'::jsonb)
    ));
  end if;

  update public.organization_data as organization_data
    set data = jsonb_set(
      organization_data.data,
      '{signatures}',
      coalesce(organization_data.data -> 'signatures', '[]'::jsonb) || jsonb_build_array(signature),
      true
    ),
    updated_at = now()
    where organization_data.organization_id = employee_organization_id;

  return signature;
end;
$$;