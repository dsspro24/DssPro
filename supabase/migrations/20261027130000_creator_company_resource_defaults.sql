create or replace function public.set_creator_resource_default(
  input_resource_id text,
  input_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog jsonb;
  resource jsonb;
  next_resource jsonb;
  next_resources jsonb;
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;
  if coalesce(input_resource_id, '') = '' or input_enabled is null then
    raise exception 'Resource and default setting are required';
  end if;

  select data into catalog
    from public.creator_workspace_data
    where id = true
    for update;
  if catalog is null then
    raise exception 'Creator catalog is not initialized';
  end if;

  select item.value into resource
    from jsonb_array_elements(coalesce(catalog -> 'resources', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_resource_id
      and coalesce(item.value ->> 'organizationId', '') = '';
  if resource is null then
    return false;
  end if;
  if coalesce((resource ->> 'defaultForOrganizations')::boolean, false) = input_enabled then
    return true;
  end if;

  next_resource := jsonb_set(resource, '{defaultForOrganizations}', to_jsonb(input_enabled), true);
  select coalesce(jsonb_agg(
      case when item.value ->> 'id' = input_resource_id then next_resource else item.value end
      order by item.ordinality
    ), '[]'::jsonb)
    into next_resources
    from jsonb_array_elements(coalesce(catalog -> 'resources', '[]'::jsonb))
      with ordinality as item(value, ordinality);

  update public.creator_workspace_data
    set data = jsonb_set(catalog, '{resources}', next_resources, true),
        updated_by = auth.uid(),
        updated_at = now()
    where id = true;

  update public.organization_data as workspace
    set data = jsonb_set(
      jsonb_set(
        workspace.data,
        '{resources}',
        (
          select coalesce(jsonb_agg(
            case
              when item.value ->> 'id' = input_resource_id
                and coalesce(item.value ->> 'organizationId', '') = ''
                then next_resource
              else item.value
            end
            order by item.ordinality
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb))
            with ordinality as item(value, ordinality)
        ),
        true
      ),
      '{organizations}',
      (
        select coalesce(jsonb_agg(
          case
            when organization.value ->> 'id' = workspace.organization_id::text then
              jsonb_set(
                organization.value,
                '{resources}',
                case
                  when input_enabled and not (coalesce(organization.value -> 'resources', '[]'::jsonb) ? input_resource_id)
                    then coalesce(organization.value -> 'resources', '[]'::jsonb) || jsonb_build_array(input_resource_id)
                  else (
                    select coalesce(jsonb_agg(to_jsonb(resource_id.value) order by resource_id.ordinality), '[]'::jsonb)
                    from jsonb_array_elements_text(coalesce(organization.value -> 'resources', '[]'::jsonb))
                      with ordinality as resource_id(value, ordinality)
                    where input_enabled or resource_id.value <> input_resource_id
                  )
                end,
                true
              )
            else organization.value
          end
          order by organization.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(workspace.data -> 'organizations', '[]'::jsonb))
          with ordinality as organization(value, ordinality)
      ),
      true
    ),
    updated_by = auth.uid(),
    updated_at = now()
  where workspace.data -> 'organizations' is not null;

  return true;
end;
$$;

revoke all on function public.set_creator_resource_default(text, boolean) from public, anon;
grant execute on function public.set_creator_resource_default(text, boolean) to authenticated;

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

  required_signers := coalesce(
    employee -> 'requiredSignersByResource' -> input_resource_id,
    organization_record -> 'resourceSettings' -> input_resource_id -> 'requiredSigners',
    resource -> 'requiredSigners',
    '[]'::jsonb
  );
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
