create or replace function public.delete_company_protocol(
  input_organization_id uuid,
  input_resource_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  next_workspace jsonb;
begin
  if not public.can_manage_organization(input_organization_id) then
    raise exception 'Organization management access required';
  end if;
  if coalesce(input_resource_id, '') = '' then
    raise exception 'Resource id is required';
  end if;

  select organization_data.data into workspace
    from public.organization_data
    where organization_data.organization_id = input_organization_id
    for update;
  if workspace is null then
    raise exception 'Organization workspace not found';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_resource_id
      and item.value ->> 'organizationId' = input_organization_id::text
      and item.value ->> 'type' = 'Protokolas'
  ) then
    return false;
  end if;

  next_workspace := jsonb_set(
    workspace,
    '{resources}',
    (
      select coalesce(jsonb_agg(item.value), '[]'::jsonb)
      from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' <> input_resource_id
    ),
    true
  );
  next_workspace := jsonb_set(
    next_workspace,
    '{organizations}',
    (
      select coalesce(jsonb_agg(
        case when organization.value ->> 'id' = input_organization_id::text then
          jsonb_set(
            jsonb_set(
              organization.value,
              '{resources}',
              (
                select coalesce(jsonb_agg(to_jsonb(resource_id)), '[]'::jsonb)
                from jsonb_array_elements_text(coalesce(organization.value -> 'resources', '[]'::jsonb)) as resource(resource_id)
                where resource.resource_id <> input_resource_id
              ),
              true
            ),
            '{resourceSettings}',
            coalesce(organization.value -> 'resourceSettings', '{}'::jsonb) - input_resource_id,
            true
          )
        else organization.value end
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as organization(value)
    ),
    true
  );
  next_workspace := jsonb_set(
    next_workspace,
    '{employees}',
    (
      select coalesce(jsonb_agg(
        jsonb_set(
          jsonb_set(
            employee.value,
            '{resourceIds}',
            (
              select coalesce(jsonb_agg(to_jsonb(resource_id)), '[]'::jsonb)
              from jsonb_array_elements_text(coalesce(employee.value -> 'resourceIds', '[]'::jsonb)) as resource(resource_id)
              where resource.resource_id <> input_resource_id
            ),
            true
          ),
          '{requiredSignersByResource}',
          coalesce(employee.value -> 'requiredSignersByResource', '{}'::jsonb) - input_resource_id,
          true
        )
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as employee(value)
    ),
    true
  );

  update public.organization_data
    set data = next_workspace, updated_by = (select auth.uid()), updated_at = now()
    where organization_id = input_organization_id;

  delete from public.organization_resource_access
    where organization_id = input_organization_id and document_id = input_resource_id;
  delete from public.employee_document_assignments
    where organization_id = input_organization_id and document_id = input_resource_id;
  update public.organization_documents
    set active = false, updated_at = now()
    where organization_id = input_organization_id and document_id = input_resource_id;

  return true;
end;
$$;

revoke all on function public.delete_company_protocol(uuid, text) from public, anon;
grant execute on function public.delete_company_protocol(uuid, text) to authenticated;
