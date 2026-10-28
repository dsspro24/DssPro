create or replace function public.sync_creator_resource_defaults(
  input_resource_id text,
  input_previous_resource jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog jsonb;
  default_resource jsonb;
  previous_settings jsonb;
  next_settings jsonb;
  workspace_row record;
  organization_value jsonb;
  next_organizations jsonb;
  organization_settings jsonb;
  setting_row record;
  role_row record;
  setting_key text;
  setting_value jsonb;
  previous_value jsonb;
  current_value jsonb;
  role_key text;
  role_value jsonb;
  previous_role_value jsonb;
  current_role_value jsonb;
  next_roles jsonb;
begin
  if auth.uid() is not null and not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  if coalesce(input_resource_id, '') = '' then
    raise exception 'Resource id is required';
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
    return;
  end if;

  next_settings := coalesce(default_resource -> 'defaultSettings', '{}'::jsonb)
    || jsonb_build_object(
      'requiredSigners',
      coalesce(default_resource -> 'requiredSigners', default_resource -> 'defaultSettings' -> 'requiredSigners', '["Darbuotojas"]'::jsonb),
      'validityMonths',
      coalesce(default_resource -> 'validityMonths', default_resource -> 'defaultSettings' -> 'validityMonths', '12'::jsonb)
    );
  previous_settings := coalesce(input_previous_resource -> 'defaultSettings', '{}'::jsonb)
    || jsonb_build_object(
      'requiredSigners',
      coalesce(input_previous_resource -> 'requiredSigners', input_previous_resource -> 'defaultSettings' -> 'requiredSigners', '["Darbuotojas"]'::jsonb),
      'validityMonths',
      coalesce(input_previous_resource -> 'validityMonths', input_previous_resource -> 'defaultSettings' -> 'validityMonths', '12'::jsonb)
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
        organization_settings := coalesce(organization_value -> 'resourceSettings' -> input_resource_id, '{}'::jsonb);

        if not (coalesce(organization_value -> 'resourceSettingsOverrides', '[]'::jsonb) ? input_resource_id) then
          for setting_row in select * from jsonb_each(next_settings)
          loop
            setting_key := setting_row.key;
            setting_value := setting_row.value;
            current_value := organization_settings -> setting_key;
            previous_value := previous_settings -> setting_key;

            if setting_key = 'signatureFieldRoles' and jsonb_typeof(setting_value) = 'object' then
              next_roles := case
                when jsonb_typeof(current_value) = 'object' then current_value
                else '{}'::jsonb
              end;
              for role_row in select * from jsonb_each(setting_value)
              loop
                role_key := role_row.key;
                role_value := role_row.value;
                current_role_value := next_roles -> role_key;
                previous_role_value := previous_value -> role_key;
                if current_role_value is null
                  or (previous_role_value is not null and current_role_value = previous_role_value) then
                  next_roles := jsonb_set(next_roles, array[role_key], role_value, true);
                end if;
              end loop;
              organization_settings := jsonb_set(organization_settings, array[setting_key], next_roles, true);
            elsif current_value is null
              or (previous_value is not null and current_value = previous_value) then
              organization_settings := jsonb_set(organization_settings, array[setting_key], setting_value, true);
            end if;
          end loop;
        end if;

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
          jsonb_set(
            coalesce(organization_value -> 'resourceSettings', '{}'::jsonb),
            array[input_resource_id],
            organization_settings,
            true
          ),
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

update public.creator_workspace_data
set data = jsonb_set(
  data,
  '{resources}',
  (
    select coalesce(jsonb_agg(
      case
        when coalesce(item.value ->> 'organizationId', '') = ''
          then jsonb_set(item.value, '{defaultForOrganizations}', 'true'::jsonb, true)
        else item.value
      end
      order by item.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(data -> 'resources', '[]'::jsonb))
      with ordinality as item(value, ordinality)
  ),
  true
),
updated_at = now()
where id = true;

update public.organization_data as workspace
set data = jsonb_set(
  workspace.data,
  '{resources}',
  (
    select coalesce(jsonb_agg(resource.value), '[]'::jsonb)
    from (
      select existing.value
        from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb)) as existing(value)
        where existing.value ? 'organizationId'
      union all
      select shared.value
        from public.creator_workspace_data as catalog
        cross join lateral jsonb_array_elements(coalesce(catalog.data -> 'resources', '[]'::jsonb)) as shared(value)
        where catalog.id = true
          and coalesce(shared.value ->> 'organizationId', '') = ''
    ) as resource
  ),
  true
),
updated_at = now()
where workspace.data -> 'organizations' is not null;

select public.sync_creator_resource_defaults();

revoke all on function public.sync_creator_resource_defaults(text, jsonb) from public, anon;
grant execute on function public.sync_creator_resource_defaults(text, jsonb) to authenticated;
