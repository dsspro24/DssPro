update public.creator_workspace_data
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{resources}',
  coalesce((
    select jsonb_agg(
      case
        when item.value ->> 'id' in (
          'res-civil-safety-training-test',
          'res-civil-safety-training-journal',
          'res-protocol-civil-safety-training'
        ) then item.value || jsonb_build_object(
          'defaultForOrganizations', true
        ) || case
          when item.value ->> 'id' = 'res-protocol-civil-safety-training'
            then jsonb_build_object('relatedTestId', 'res-civil-safety-training-test')
          else '{}'::jsonb
        end
        else item.value
      end
    )
    from jsonb_array_elements(coalesce(data -> 'resources', '[]'::jsonb)) as item(value)
  ), '[]'::jsonb),
  true
),
updated_at = now()
where id = true;

do $$
begin
  execute 'alter table public.organization_data disable trigger guard_workspace_subscription_access';
  perform public.sync_creator_resource_defaults();
  execute 'alter table public.organization_data enable trigger guard_workspace_subscription_access';
end;
$$;
