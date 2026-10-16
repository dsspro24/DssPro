create or replace function public.save_creator_resource(input_resource jsonb, input_resource_types jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog jsonb;
  resource_id text;
  next_resources jsonb;
  next_types jsonb;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if jsonb_typeof(input_resource) <> 'object'
    or jsonb_typeof(input_resource_types) <> 'array'
    or coalesce(input_resource ->> 'id', '') = ''
    or coalesce(input_resource ->> 'title', '') = ''
    or coalesce(input_resource ->> 'organizationId', '') <> '' then
    raise exception 'Shared resource data is invalid';
  end if;

  resource_id := input_resource ->> 'id';
  select data into catalog from public.creator_workspace_data where id = true for update;
  if catalog is null then catalog := jsonb_build_object('resources', '[]'::jsonb, 'resourceTypes', input_resource_types); end if;

  select coalesce(jsonb_agg(case when item.value ->> 'id' = resource_id then input_resource else item.value end), '[]'::jsonb)
    into next_resources
    from jsonb_array_elements(coalesce(catalog -> 'resources', '[]'::jsonb)) as item(value);
  if not exists (
    select 1 from jsonb_array_elements(next_resources) as item(value) where item.value ->> 'id' = resource_id
  ) then
    next_resources := next_resources || jsonb_build_array(input_resource);
  end if;
  next_types := input_resource_types;

  insert into public.creator_workspace_data (id, data, updated_by)
  values (true, jsonb_build_object('resources', next_resources, 'resourceTypes', next_types), auth.uid())
  on conflict (id) do update
    set data = jsonb_build_object('resources', next_resources, 'resourceTypes', next_types),
        updated_by = excluded.updated_by,
        updated_at = now();

  update public.organization_data as workspace
    set data = jsonb_set(
      jsonb_set(
        workspace.data,
        '{resources}',
        (
          select coalesce(jsonb_agg(resource.value), '[]'::jsonb)
          from (
            select existing.value from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb)) as existing(value)
            where existing.value ? 'organizationId'
            union all
            select shared.value from jsonb_array_elements(next_resources) as shared(value)
          ) as resource
        ),
        true
      ),
      '{resourceTypes}', next_types, true
    ),
    updated_at = now()
  where workspace.data -> 'organizations' is not null;
end;
$$;

create or replace function public.delete_creator_resource(input_resource_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog jsonb;
  next_resources jsonb;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;
  if coalesce(input_resource_id, '') = '' then raise exception 'Resource id is required'; end if;

  select data into catalog from public.creator_workspace_data where id = true for update;
  if catalog is null then raise exception 'Creator catalog is not initialized'; end if;

  select coalesce(jsonb_agg(item.value), '[]'::jsonb)
    into next_resources
    from jsonb_array_elements(coalesce(catalog -> 'resources', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' <> input_resource_id;

  if jsonb_array_length(next_resources) = jsonb_array_length(coalesce(catalog -> 'resources', '[]'::jsonb)) then
    return false;
  end if;

  update public.creator_workspace_data
    set data = jsonb_set(data, '{resources}', next_resources, true),
        updated_by = auth.uid(), updated_at = now()
    where id = true;

  update public.organization_data as workspace
    set data = jsonb_set(
      jsonb_set(
        jsonb_set(
          workspace.data,
          '{resources}',
          (
            select coalesce(jsonb_agg(resource.value), '[]'::jsonb)
            from (
              select existing.value from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb)) as existing(value)
              where existing.value ? 'organizationId'
              union all
              select shared.value from jsonb_array_elements(next_resources) as shared(value)
            ) as resource
          ),
          true
        ),
        '{organizations}',
        (
          select coalesce(jsonb_agg(
            jsonb_set(
              jsonb_set(organization.value, '{resources}', coalesce((
                select jsonb_agg(resource_id)
                from jsonb_array_elements_text(coalesce(organization.value -> 'resources', '[]'::jsonb)) as resource(resource_id)
                where resource.resource_id <> input_resource_id
              ), '[]'::jsonb), true),
              '{resourceSettings}',
              coalesce(organization.value -> 'resourceSettings', '{}'::jsonb) - input_resource_id,
              true
            )
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(workspace.data -> 'organizations', '[]'::jsonb)) as organization(value)
        ),
        true
      ),
      '{employees}',
      (
        select coalesce(jsonb_agg(
          jsonb_set(
            jsonb_set(employee.value, '{resourceIds}', coalesce((
              select jsonb_agg(resource_id)
              from jsonb_array_elements_text(coalesce(employee.value -> 'resourceIds', '[]'::jsonb)) as resource(resource_id)
              where resource.resource_id <> input_resource_id
            ), '[]'::jsonb), true),
            '{requiredSignersByResource}', coalesce(employee.value -> 'requiredSignersByResource', '{}'::jsonb) - input_resource_id, true
          )
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(workspace.data -> 'employees', '[]'::jsonb)) as employee(value)
      ),
      true
    ),
    updated_at = now()
  where workspace.data -> 'organizations' is not null;

  delete from public.organization_resource_access where document_id = input_resource_id;
  delete from public.employee_document_assignments where document_id = input_resource_id;
  update public.organization_documents set active = false, updated_at = now()
    where document_id = input_resource_id and organization_id is null;
  return true;
end;
$$;

revoke all on function public.save_creator_resource(jsonb, jsonb) from public, anon;
revoke all on function public.delete_creator_resource(text) from public, anon;
grant execute on function public.save_creator_resource(jsonb, jsonb) to authenticated;
grant execute on function public.delete_creator_resource(text) to authenticated;