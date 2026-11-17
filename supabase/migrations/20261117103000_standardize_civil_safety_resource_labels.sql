update public.creator_workspace_data
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{resources}',
  coalesce((
    select jsonb_agg(
      case item.value ->> 'id'
        when 'res-civil-safety-training-test' then item.value || jsonb_build_object(
          'title', 'Civilinės saugos mokymai – žinių patikrinimo testas',
          'category', 'Civilinė sauga'
        )
        when 'res-civil-safety-training-journal' then item.value || jsonb_build_object(
          'title', 'Civilinės saugos mokymai – registravimo žurnalas',
          'category', 'Civilinė sauga'
        )
        when 'res-protocol-civil-safety-training' then item.value || jsonb_build_object(
          'title', 'Civilinės saugos mokymai – žinių patikrinimo protokolas',
          'category', 'Civilinė sauga'
        )
        else item.value
      end
    )
    from jsonb_array_elements(coalesce(data -> 'resources', '[]'::jsonb)) as item(value)
  ), '[]'::jsonb),
  true
),
updated_at = now()
where id = true;

alter table public.organization_data disable trigger guard_workspace_subscription_access;

update public.organization_data
set data = jsonb_set(
  data,
  '{resources}',
  coalesce((
    select jsonb_agg(
      case item.value ->> 'id'
        when 'res-civil-safety-training-test' then item.value || jsonb_build_object(
          'title', 'Civilinės saugos mokymai – žinių patikrinimo testas',
          'category', 'Civilinė sauga'
        )
        when 'res-civil-safety-training-journal' then item.value || jsonb_build_object(
          'title', 'Civilinės saugos mokymai – registravimo žurnalas',
          'category', 'Civilinė sauga'
        )
        when 'res-protocol-civil-safety-training' then item.value || jsonb_build_object(
          'title', 'Civilinės saugos mokymai – žinių patikrinimo protokolas',
          'category', 'Civilinė sauga'
        )
        else item.value
      end
    )
    from jsonb_array_elements(coalesce(data -> 'resources', '[]'::jsonb)) as item(value)
  ), '[]'::jsonb),
  true
),
updated_at = now()
where data ? 'resources';

do $$
begin
  perform public.sync_creator_resource_defaults();
end;
$$;

alter table public.organization_data enable trigger guard_workspace_subscription_access;
