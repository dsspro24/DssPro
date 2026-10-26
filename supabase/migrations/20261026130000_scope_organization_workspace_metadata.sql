create or replace function public.get_organization_workspace_metadata(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  workspace jsonb;
begin
  if auth.uid() is null
    or (not public.is_organization_member(input_organization_id, array['manager', 'dss_specialist']) and not public.is_creator()) then
    raise exception 'Organization workspace access denied';
  end if;

  select organization_data.data into workspace
  from public.organization_data as organization_data
  where organization_data.organization_id = input_organization_id;

  if workspace is null then return null; end if;

  return (workspace - 'resources' - 'archivedEmployees'
    - 'organizations' - 'employees' - 'signatures' - 'protocolBatches'
    - 'commissionAssignments' - 'commissionInvitations' - 'protocolCommissionSignatures'
    - 'subscriptions') || jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = input_organization_id::text
    ), '[]'::jsonb),
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
    'protocolCommissionSignatures', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'protocolCommissionSignatures', '[]'::jsonb)) as item(value)
      where item.value ->> 'orgId' = input_organization_id::text
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(workspace -> 'subscriptions', '[]'::jsonb)) as item(value)
      where item.value ->> 'orgId' = input_organization_id::text
    ), '[]'::jsonb)
  );
end;
$$;