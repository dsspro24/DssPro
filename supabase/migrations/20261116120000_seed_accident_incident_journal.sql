update public.creator_workspace_data
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{resources}',
  coalesce(data -> 'resources', '[]'::jsonb) || case
    when exists (
      select 1
      from jsonb_array_elements(coalesce(data -> 'resources', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = 'res-accident-incident-journal'
    ) then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'id', 'res-accident-incident-journal',
      'title', 'Nelaimingų atsitikimų darbe, incidentų ir nelaimingų atsitikimų darbe aktų registravimo žurnalas',
      'type', 'Žurnalas',
      'category', 'Nelaimingi atsitikimai ir incidentai',
      'duration', '15 įrašų',
      'templateKind', 'accident-incident-journal',
      'adminOnly', true,
      'defaultForOrganizations', true,
      'requiredSigners', '[]'::jsonb,
      'defaultSettings', jsonb_build_object(
        'recorderRole', 'Vadovas',
        'recorderName', '',
        'recorderPosition', 'Įmonės vadovas',
        'incidentEntries', '[]'::jsonb
      ),
      'isProtocolTemplate', false
    ))
  end,
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
