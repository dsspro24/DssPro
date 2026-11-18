create or replace function public.save_creator_resource_presets(input_presets jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  if jsonb_typeof(input_presets) is distinct from 'array' then
    raise exception 'Organization resource presets are invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(input_presets) as preset(value)
    where jsonb_typeof(preset.value) is distinct from 'object'
      or jsonb_typeof(preset.value -> 'id') is distinct from 'string'
      or jsonb_typeof(preset.value -> 'resourceIds') is distinct from 'array'
  ) then
    raise exception 'Organization resource presets are invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(input_presets) as preset(value)
    cross join lateral jsonb_array_elements(preset.value -> 'resourceIds') as resource_id(value)
    where jsonb_typeof(resource_id.value) is distinct from 'string'
  ) then
    raise exception 'Organization resource presets are invalid';
  end if;

  insert into public.creator_workspace_data as existing_catalog (id, data, updated_by, updated_at)
  values (
    true,
    jsonb_build_object('organizationResourcePresets', input_presets),
    auth.uid(),
    now()
  )
  on conflict (id) do update
    set data = jsonb_set(
      coalesce(existing_catalog.data, '{}'::jsonb),
      '{organizationResourcePresets}',
      excluded.data -> 'organizationResourcePresets',
      true
    ),
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.save_creator_resource_presets(jsonb) from public, anon;
grant execute on function public.save_creator_resource_presets(jsonb) to authenticated;
