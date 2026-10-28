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

create or replace function public.sync_creator_resource_defaults()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_resource jsonb;
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
    perform public.sync_creator_resource_defaults(default_resource ->> 'id', default_resource);
  end loop;
end;
$$;

create or replace function public.save_creator_workspace(
  input_resources jsonb,
  input_resource_types jsonb,
  input_subscriptions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  shared_resources jsonb;
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  if jsonb_typeof(input_resources) <> 'array'
    or jsonb_typeof(input_resource_types) <> 'array'
    or jsonb_typeof(input_subscriptions) <> 'array' then
    raise exception 'Creator workspace data must be arrays';
  end if;

  select data -> 'resources' into shared_resources
    from public.creator_workspace_data
    where id = true
    for update;
  shared_resources := coalesce(shared_resources, input_resources);

  insert into public.creator_workspace_data as existing_catalog (id, data, updated_by, updated_at)
  values (
    true,
    jsonb_build_object('resources', shared_resources, 'resourceTypes', input_resource_types),
    auth.uid(),
    now()
  )
  on conflict (id) do update
    set data = jsonb_set(
      jsonb_set(
        coalesce(existing_catalog.data, '{}'::jsonb),
        '{resources}',
        coalesce(existing_catalog.data -> 'resources', excluded.data -> 'resources'),
        true
      ),
      '{resourceTypes}',
      excluded.data -> 'resourceTypes',
      true
    ),
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  update public.organization_data as workspace
  set data = jsonb_set(
        jsonb_set(
          jsonb_set(
            workspace.data,
            '{resources}',
            (
              select coalesce(jsonb_agg(resource.value), '[]'::jsonb)
              from (
                select existing_resource.value
                from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb)) as existing_resource(value)
                where existing_resource.value ? 'organizationId'
                union all
                select shared_resource.value
                from jsonb_array_elements(shared_resources) as shared_resource(value)
              ) as resource
            ),
            true
          ),
          '{resourceTypes}',
          input_resource_types,
          true
        ),
        '{subscriptions}',
        (
          select coalesce(jsonb_agg(subscription.value), '[]'::jsonb)
          from jsonb_array_elements(input_subscriptions) as subscription(value)
          where subscription.value ->> 'orgId' = workspace.organization_id::text
        ),
        true
      ),
      updated_at = now()
  where workspace.data -> 'organizations' is not null;
end;
$$;

revoke all on function public.sync_creator_resource_defaults(text, jsonb) from public, anon;
revoke all on function public.sync_creator_resource_defaults() from public, anon;
grant execute on function public.sync_creator_resource_defaults(text, jsonb) to authenticated;
grant execute on function public.sync_creator_resource_defaults() to authenticated;
revoke all on function public.save_creator_workspace(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_creator_workspace(jsonb, jsonb, jsonb) to authenticated;

select public.sync_creator_resource_defaults();
