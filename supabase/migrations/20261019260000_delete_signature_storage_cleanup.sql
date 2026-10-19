create or replace function public.creator_delete_organization(input_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_name text;
  workspace_data jsonb;
  asset_paths jsonb;
  export_files jsonb;
  signature_files jsonb;
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;

  select name into organization_name
    from public.organizations
    where id = input_organization_id
    for update;
  if organization_name is null then return null; end if;

  select data into workspace_data
    from public.organization_data
    where organization_id = input_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'path', storage_path)), '[]'::jsonb)
    into asset_paths
    from public.organization_assets
    where organization_id = input_organization_id;
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'path', storage_path)), '[]'::jsonb)
    into export_files
    from public.export_jobs
    where organization_id = input_organization_id and storage_path is not null;
  select coalesce(jsonb_agg(jsonb_build_object('bucket', 'signature-assets', 'path', signature.value ->> 'signaturePath')), '[]'::jsonb)
    into signature_files
    from jsonb_array_elements(coalesce(workspace_data -> 'signatures', '[]'::jsonb)) as signature(value)
    where coalesce(signature.value ->> 'signaturePath', '') <> '';

  delete from public.document_signatures where organization_id = input_organization_id;
  delete from public.employee_test_attempts where organization_id = input_organization_id;
  delete from public.employee_document_assignments where organization_id = input_organization_id;
  delete from public.protocol_batch_employees where organization_id = input_organization_id;
  delete from public.protocol_batches where organization_id = input_organization_id;
  delete from public.organization_resource_access where organization_id = input_organization_id;
  delete from public.export_jobs where organization_id = input_organization_id;
  delete from public.organization_assets where organization_id = input_organization_id;
  delete from public.organization_documents where organization_id = input_organization_id;
  delete from public.organizations where id = input_organization_id;

  return jsonb_build_object(
    'organizationId', input_organization_id,
    'organizationName', organization_name,
    'assetFiles', asset_paths,
    'exportFiles', export_files,
    'signatureFiles', signature_files
  );
end;
$$;
