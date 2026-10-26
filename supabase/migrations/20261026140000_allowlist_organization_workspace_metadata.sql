create or replace function public.get_organization_workspace_metadata(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  workspace jsonb;
  organization_record jsonb;
begin
  if auth.uid() is null
    or (not public.is_organization_member(input_organization_id, array['manager', 'dss_specialist']) and not public.is_creator()) then
    raise exception 'Organization workspace access denied';
  end if;

  select organization_data.data into workspace
  from public.organization_data as organization_data
  where organization_data.organization_id = input_organization_id;
  if workspace is null then return null; end if;

  select item.value into organization_record
  from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = input_organization_id::text;

  return jsonb_build_object(
    'resourceTypes', coalesce(workspace -> 'resourceTypes', '[]'::jsonb),
    'organizations', case when organization_record is null then '[]'::jsonb else jsonb_build_array(organization_record) end,
    'employees', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
      where item.value ->> 'orgId' = input_organization_id::text
    ), '[]'::jsonb),
    'signatures', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
      where item.value ->> 'orgId' = input_organization_id::text
    ), '[]'::jsonb),
    'protocolBatches', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as item(value)
      where item.value ->> 'orgId' = input_organization_id::text
    ), '[]'::jsonb),
    'aapIssuances', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'aapIssuances', '[]'::jsonb)) as item(value)
      where item.value ->> 'orgId' = input_organization_id::text
    ), '[]'::jsonb),
    'commissionAssignments', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'commissionAssignments', '[]'::jsonb)) as item(value)
      where item.value ->> 'organizationId' = input_organization_id::text
    ), '[]'::jsonb),
    'commissionInvitations', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'commissionInvitations', '[]'::jsonb)) as item(value)
      where item.value ->> 'organizationId' = input_organization_id::text
    ), '[]'::jsonb),
    'commissionTasks', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'commissionTasks', '[]'::jsonb)) as item(value)
      where item.value ->> 'organizationId' = input_organization_id::text
    ), '[]'::jsonb),
    'protocolCommissionSignatures', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'protocolCommissionSignatures', '[]'::jsonb)) as item(value)
      where item.value ->> 'orgId' = input_organization_id::text
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'subscriptions', '[]'::jsonb)) as item(value)
      where item.value ->> 'orgId' = input_organization_id::text
    ), '[]'::jsonb),
    'specialists', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'specialists', '[]'::jsonb)) as item(value)
      where coalesce(organization_record -> 'dss', '[]'::jsonb) ? (item.value ->> 'id')
    ), '[]'::jsonb),
    'dssInvitations', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'dssInvitations', '[]'::jsonb)) as item(value)
      where coalesce(item.value ->> 'organization_id', item.value ->> 'organizationId') = input_organization_id::text
    ), '[]'::jsonb),
    'dssOrganizationRequests', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'dssOrganizationRequests', '[]'::jsonb)) as item(value)
      where coalesce(item.value ->> 'organization_id', item.value ->> 'organizationId') = input_organization_id::text
    ), '[]'::jsonb)
  );
end;
$$;