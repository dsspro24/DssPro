create or replace function public.get_organization_workspace_metadata(input_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select workspace.data - 'resources'
  from public.organization_data as workspace
  where workspace.organization_id = input_organization_id;
$$;

revoke all on function public.get_organization_workspace_metadata(uuid) from public, anon;
grant execute on function public.get_organization_workspace_metadata(uuid) to authenticated;
