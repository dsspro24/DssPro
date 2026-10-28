create or replace function public.sync_creator_resource_defaults()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_resource jsonb;
  resource_id text;
  resource_settings jsonb;
begin
  if auth.uid() is not null and not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  for default_resource in
    select item.value
      from public.creator_workspace_data as catalog
      cross join lateral jsonb_array_elements(coalesce(catalog.data -> 'resources', '[]'::jsonb)) as item(value)
      where catalog.id = true
        and coalesce((item.value ->> 'defaultForOrganizations')::boolean, false)
        and coalesce(item.value ->> 'organizationId', '') = ''
  loop
    resource_id := default_resource ->> 'id';
    resource_settings := coalesce(default_resource -> 'defaultSettings', '{}'::jsonb)
      || jsonb_build_object(
        'requiredSigners',
        coalesce(default_resource -> 'requiredSigners', default_resource -> 'defaultSettings' -> 'requiredSigners', '["Darbuotojas"]'::jsonb),
        'validityMonths',
        coalesce(default_resource -> 'validityMonths', default_resource -> 'defaultSettings' -> 'validityMonths', '12'::jsonb)
      );

    update public.organization_data as workspace
      set data = jsonb_set(
        workspace.data,
        '{organizations}',
        (
          select coalesce(jsonb_agg(
            case
              when organization.value ->> 'id' = workspace.organization_id::text then
                jsonb_set(
                  jsonb_set(
                    organization.value,
                    '{resources}',
                    case
                      when coalesce(organization.value -> 'resources', '[]'::jsonb) ? resource_id
                        then coalesce(organization.value -> 'resources', '[]'::jsonb)
                      else coalesce(organization.value -> 'resources', '[]'::jsonb) || jsonb_build_array(resource_id)
                    end,
                    true
                  ),
                  '{resourceSettings}',
                  jsonb_set(
                    coalesce(organization.value -> 'resourceSettings', '{}'::jsonb),
                    array[resource_id],
                    coalesce(organization.value -> 'resourceSettings' -> resource_id, '{}'::jsonb) || resource_settings,
                    true
                  ),
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
      updated_by = coalesce(auth.uid(), workspace.updated_by),
      updated_at = now()
      where workspace.data -> 'organizations' is not null;
  end loop;
end;
$$;

revoke all on function public.sync_creator_resource_defaults() from public, anon;
grant execute on function public.sync_creator_resource_defaults() to authenticated;

select public.sync_creator_resource_defaults();

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

  next_resource := case
    when coalesce((resource ->> 'defaultForOrganizations')::boolean, false) = input_enabled
      then resource
    else jsonb_set(resource, '{defaultForOrganizations}', to_jsonb(input_enabled), true)
  end;
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

  if input_enabled then
    perform public.sync_creator_resource_defaults();
  end if;

  return true;
end;
$$;
