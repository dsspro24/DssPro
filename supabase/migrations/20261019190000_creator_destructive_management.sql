create or replace function public.creator_delete_archived_employees(
  input_organization_id uuid,
  input_archive_ids text[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  remaining_data jsonb;
  employee_ids text[];
begin
  if not public.is_creator() then raise exception 'Creator access required'; end if;

  select data into workspace
    from public.organization_data
    where organization_id = input_organization_id
    for update;
  if workspace is null then raise exception 'Organization workspace not found'; end if;

  select coalesce(array_agg(distinct archive.value -> 'employee' ->> 'id'), array[]::text[])
    into employee_ids
    from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as archive(value)
    where jsonb_typeof(archive.value -> 'employee') = 'object'
      and coalesce(archive.value -> 'employee' ->> 'id', '') <> ''
      and (input_archive_ids is null or archive.value ->> 'id' = any(input_archive_ids));

  if cardinality(employee_ids) = 0 then return 0; end if;

  delete from public.document_signatures
    where organization_id = input_organization_id and employee_id = any(employee_ids);
  delete from public.employee_test_attempts
    where organization_id = input_organization_id and employee_id = any(employee_ids);
  delete from public.employee_document_assignments
    where organization_id = input_organization_id and employee_id = any(employee_ids);
  delete from public.protocol_batch_employees
    where organization_id = input_organization_id and employee_id = any(employee_ids);
  delete from public.organization_memberships
    where organization_id = input_organization_id and role = 'employee' and employee_id = any(employee_ids);
  delete from public.organization_employees
    where organization_id = input_organization_id and employee_id = any(employee_ids);

  remaining_data := jsonb_set(
    workspace,
    '{archivedEmployees}',
    coalesce((
      select jsonb_agg(archive.value order by archive.value ->> 'archivedAt' desc)
      from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as archive(value)
      where input_archive_ids is not null and not (archive.value ->> 'id' = any(input_archive_ids))
    ), '[]'::jsonb),
    true
  );
  remaining_data := jsonb_set(
    remaining_data,
    '{signatures}',
    coalesce((
      select jsonb_agg(signature.value)
      from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as signature(value)
      where not (signature.value ->> 'employeeId' = any(employee_ids))
    ), '[]'::jsonb),
    true
  );
  remaining_data := jsonb_set(
    remaining_data,
    '{protocolBatches}',
    coalesce((
      select jsonb_agg(batch.value)
      from (
        select jsonb_set(
          batch.value,
          '{employeeIds}',
          coalesce((
            select jsonb_agg(to_jsonb(person.value))
            from jsonb_array_elements_text(coalesce(batch.value -> 'employeeIds', '[]'::jsonb)) as person(value)
            where not (person.value = any(employee_ids))
          ), '[]'::jsonb),
          true
        ) as value
        from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as batch(value)
      ) as batch
      where jsonb_array_length(batch.value -> 'employeeIds') > 0
    ), '[]'::jsonb),
    true
  );

  update public.organization_data
    set data = remaining_data,
    updated_by = auth.uid(),
    updated_at = now()
    where organization_id = input_organization_id;

  return cardinality(employee_ids);
end;
$$;

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

revoke all on function public.creator_delete_archived_employees(uuid, text[]) from public, anon;
revoke all on function public.creator_delete_organization(uuid) from public, anon;
grant execute on function public.creator_delete_archived_employees(uuid, text[]) to authenticated;
grant execute on function public.creator_delete_organization(uuid) to authenticated;