create or replace function public.apply_creator_resource_default_to_organizations(input_resource_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog jsonb;
  default_resource jsonb;
  default_settings jsonb;
  workspace_row record;
  organization_value jsonb;
  next_organizations jsonb;
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  select data into catalog
    from public.creator_workspace_data
    where id = true;

  select item.value into default_resource
    from jsonb_array_elements(coalesce(catalog -> 'resources', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_resource_id
      and coalesce((item.value ->> 'defaultForOrganizations')::boolean, false)
      and coalesce(item.value ->> 'organizationId', '') = '';

  if default_resource is null then
    raise exception 'Default creator resource not found';
  end if;

  default_settings := coalesce(default_resource -> 'defaultSettings', '{}'::jsonb)
    || jsonb_build_object(
      'requiredSigners',
      coalesce(default_resource -> 'requiredSigners', default_resource -> 'defaultSettings' -> 'requiredSigners', '["Darbuotojas"]'::jsonb),
      'validityMonths',
      coalesce(default_resource -> 'validityMonths', default_resource -> 'defaultSettings' -> 'validityMonths', '12'::jsonb)
    );

  for workspace_row in
    select organization_id, data, updated_by
      from public.organization_data
      where data -> 'organizations' is not null
      for update
  loop
    next_organizations := '[]'::jsonb;

    for organization_value in
      select item.value
        from jsonb_array_elements(coalesce(workspace_row.data -> 'organizations', '[]'::jsonb))
          with ordinality as item(value, ordinality)
        order by item.ordinality
    loop
      if organization_value ->> 'id' = workspace_row.organization_id::text then
        organization_value := jsonb_set(
          jsonb_set(
            organization_value,
            '{resources}',
            case
              when coalesce(organization_value -> 'resources', '[]'::jsonb) ? input_resource_id
                then coalesce(organization_value -> 'resources', '[]'::jsonb)
              else coalesce(organization_value -> 'resources', '[]'::jsonb) || jsonb_build_array(input_resource_id)
            end,
            true
          ),
          '{resourceSettings}',
          case
            when coalesce(organization_value -> 'resourceSettingsOverrides', '[]'::jsonb) ? input_resource_id
              then coalesce(organization_value -> 'resourceSettings', '{}'::jsonb)
            else jsonb_set(
              coalesce(organization_value -> 'resourceSettings', '{}'::jsonb),
              array[input_resource_id],
              default_settings,
              true
            )
          end,
          true
        );
      end if;

      next_organizations := next_organizations || jsonb_build_array(organization_value);
    end loop;

    update public.organization_data
      set data = jsonb_set(workspace_row.data, '{organizations}', next_organizations, true),
          updated_by = coalesce(auth.uid(), workspace_row.updated_by),
          updated_at = now()
      where organization_id = workspace_row.organization_id;
  end loop;
end;
$$;

revoke all on function public.apply_creator_resource_default_to_organizations(text) from public, anon;
grant execute on function public.apply_creator_resource_default_to_organizations(text) to authenticated;
