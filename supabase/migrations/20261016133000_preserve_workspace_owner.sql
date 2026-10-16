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
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  if jsonb_typeof(input_resources) <> 'array'
    or jsonb_typeof(input_resource_types) <> 'array'
    or jsonb_typeof(input_subscriptions) <> 'array' then
    raise exception 'Creator workspace data must be arrays';
  end if;

  insert into public.creator_workspace_data (id, data, updated_by, updated_at)
  values (
    true,
    jsonb_build_object('resources', input_resources, 'resourceTypes', input_resource_types),
    auth.uid(),
    now()
  )
  on conflict (id) do update
    set data = excluded.data,
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
                from jsonb_array_elements(input_resources) as shared_resource(value)
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
      updated_at = now();
end;
$$;