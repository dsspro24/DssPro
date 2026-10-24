create or replace function public.can_read_signature_asset(input_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id::text = split_part(coalesce(input_path, ''), '/', 1)
      and membership.user_id = (select auth.uid())
      and membership.role in ('manager', 'dss_specialist')
  ) or exists (
    select 1
    from public.organization_memberships as membership
    join public.document_signatures as signature
      on signature.organization_id = membership.organization_id
      and signature.employee_id = membership.employee_id
    where membership.organization_id::text = split_part(coalesce(input_path, ''), '/', 1)
      and membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and signature.metadata ->> 'signaturePath' = input_path
  ) or public.is_creator();
$$;

revoke all on function public.can_read_signature_asset(text) from public, anon;
grant execute on function public.can_read_signature_asset(text) to authenticated;

drop policy if exists "Organization members can read signature assets" on storage.objects;
create policy "Authorized users can read signature assets"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'signature-assets'
    and public.can_read_signature_asset(name)
  );

drop policy if exists "Organization members can delete signature assets" on storage.objects;
create policy "Authorized users can delete signature assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'signature-assets'
    and (
      public.is_creator()
      or public.is_organization_member((storage.foldername(name))[1]::uuid, array['manager', 'dss_specialist'])
      or (
        public.is_organization_member((storage.foldername(name))[1]::uuid, array['employee'])
        and owner_id = (select auth.uid())::text
      )
    )
  );

create or replace function public.minimize_organization_employee_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.metadata := '{}'::jsonb;
  return new;
end;
$$;

revoke all on function public.minimize_organization_employee_metadata() from public, anon, authenticated;

drop trigger if exists minimize_organization_employee_metadata on public.organization_employees;
create trigger minimize_organization_employee_metadata
  before insert or update of metadata on public.organization_employees
  for each row execute function public.minimize_organization_employee_metadata();

update public.organization_employees
  set metadata = '{}'::jsonb
  where metadata <> '{}'::jsonb;

create or replace function public.anonymize_employee_audit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.audit_events
    set details = details - 'employeeId',
        target_id = 'redacted:' || id::text,
        target_type = case
          when target_type = 'document_signature' then 'anonymized_signature'
          else target_type
        end
    where organization_id = old.organization_id
      and details ->> 'employeeId' = old.employee_id;
  return old;
end;
$$;

revoke all on function public.anonymize_employee_audit_events() from public, anon, authenticated;

drop trigger if exists anonymize_employee_audit_events on public.organization_employees;
create trigger anonymize_employee_audit_events
  before delete on public.organization_employees
  for each row execute function public.anonymize_employee_audit_events();

create or replace function public.audit_organization_workspace_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_resource record;
  archived_count integer;
  purged_count integer;
  added_employee_count integer;
  settings_change record;
begin
  for changed_resource in
    with old_resources as (
      select item.value as resource
      from jsonb_array_elements(coalesce(old.data -> 'resources', '[]'::jsonb)) as item(value)
    ),
    new_resources as (
      select item.value as resource
      from jsonb_array_elements(coalesce(new.data -> 'resources', '[]'::jsonb)) as item(value)
    )
    select coalesce(old_resource.resource ->> 'id', new_resource.resource ->> 'id') as resource_id,
      old_resource.resource as old_value,
      new_resource.resource as new_value
    from old_resources as old_resource
    full join new_resources as new_resource
      on old_resource.resource ->> 'id' = new_resource.resource ->> 'id'
    where old_resource.resource is distinct from new_resource.resource
      and coalesce(old_resource.resource ->> 'id', new_resource.resource ->> 'id') is not null
  loop
    insert into public.audit_events (
      event_key, organization_id, actor_user_id, action, target_type, target_id, details
    ) values (
      'workspace-document:' || gen_random_uuid()::text,
      new.organization_id,
      coalesce(new.updated_by, auth.uid()),
      case
        when changed_resource.old_value is null then 'document.created'
        when changed_resource.new_value is null then 'document.deleted'
        else 'document.updated'
      end,
      'document',
      changed_resource.resource_id,
      jsonb_strip_nulls(jsonb_build_object(
        'documentType', changed_resource.new_value ->> 'type',
        'title', changed_resource.new_value ->> 'title',
        'version', changed_resource.new_value ->> 'version'
      ))
    );
  end loop;

  for settings_change in
    select coalesce(old_setting.key, new_setting.key) as document_id
    from jsonb_each(coalesce((
      select item.value -> 'resourceSettings'
      from jsonb_array_elements(coalesce(old.data -> 'organizations', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = new.organization_id::text
    ), '{}'::jsonb)) as old_setting(key, value)
    full join jsonb_each(coalesce((
      select item.value -> 'resourceSettings'
      from jsonb_array_elements(coalesce(new.data -> 'organizations', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = new.organization_id::text
    ), '{}'::jsonb)) as new_setting(key, value)
      on old_setting.key = new_setting.key
    where old_setting.value is distinct from new_setting.value
  loop
    insert into public.audit_events (
      event_key, organization_id, actor_user_id, action, target_type, target_id, details
    ) values (
      'workspace-document-settings:' || gen_random_uuid()::text,
      new.organization_id,
      coalesce(new.updated_by, auth.uid()),
      'document.settings_updated',
      'document',
      settings_change.document_id,
      '{}'::jsonb
    );
  end loop;

  select count(*)::integer
    into archived_count
    from jsonb_array_elements(coalesce(new.data -> 'archivedEmployees', '[]'::jsonb)) as current_archive(value)
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(old.data -> 'archivedEmployees', '[]'::jsonb)) as previous_archive(value)
      where previous_archive.value ->> 'id' = current_archive.value ->> 'id'
    );

  if archived_count > 0 then
    insert into public.audit_events (
      event_key, organization_id, actor_user_id, action, target_type, target_id, details
    ) values (
      'workspace-employee-archive:' || gen_random_uuid()::text,
      new.organization_id,
      coalesce(new.updated_by, auth.uid()),
      'employee.archived',
      'employee_archive',
      new.organization_id::text,
      jsonb_build_object('count', archived_count)
    );
  end if;

  select count(*)::integer
    into purged_count
    from jsonb_array_elements(coalesce(old.data -> 'archivedEmployees', '[]'::jsonb)) as previous_archive(value)
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(new.data -> 'archivedEmployees', '[]'::jsonb)) as current_archive(value)
      where current_archive.value ->> 'id' = previous_archive.value ->> 'id'
    );

  if purged_count > 0 then
    insert into public.audit_events (
      event_key, organization_id, actor_user_id, action, target_type, target_id, details
    ) values (
      'workspace-employee-purge:' || gen_random_uuid()::text,
      new.organization_id,
      coalesce(new.updated_by, auth.uid()),
      'employee.personal_data_purged',
      'employee_archive',
      new.organization_id::text,
      jsonb_build_object('count', purged_count)
    );
  end if;

  select count(*)::integer
    into added_employee_count
    from jsonb_array_elements(coalesce(new.data -> 'employees', '[]'::jsonb)) as current_employee(value)
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(old.data -> 'employees', '[]'::jsonb)) as previous_employee(value)
      where previous_employee.value ->> 'id' = current_employee.value ->> 'id'
    );

  if added_employee_count > 0 then
    insert into public.audit_events (
      event_key, organization_id, actor_user_id, action, target_type, target_id, details
    ) values (
      'workspace-employee-add:' || gen_random_uuid()::text,
      new.organization_id,
      coalesce(new.updated_by, auth.uid()),
      'employee.added_or_restored',
      'employee',
      new.organization_id::text,
      jsonb_build_object('count', added_employee_count)
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_organization_workspace_changes() from public, anon, authenticated;

drop trigger if exists audit_organization_workspace_changes on public.organization_data;
create trigger audit_organization_workspace_changes
  after update of data on public.organization_data
  for each row
  when (old.data is distinct from new.data)
  execute function public.audit_organization_workspace_changes();

create or replace function public.audit_signature_record_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.metadata ->> 'signaturePath' is distinct from new.metadata ->> 'signaturePath' then
    insert into public.audit_events (
      event_key, organization_id, actor_user_id, action, target_type, target_id, details
    ) values (
      'signature-image-update:' || gen_random_uuid()::text,
      new.organization_id,
      coalesce(auth.uid(), new.signer_user_id),
      'document.signature_image_updated',
      'document_signature',
      new.signature_id,
      jsonb_build_object(
        'employeeId', new.employee_id,
        'documentId', new.document_id,
        'signerRole', new.signer_role
      )
    );
    return new;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_signature_record_changes() from public, anon, authenticated;

drop trigger if exists audit_signature_record_changes on public.document_signatures;
create trigger audit_signature_record_changes
  after update of metadata on public.document_signatures
  for each row execute function public.audit_signature_record_changes();

create or replace function public.creator_get_archived_employee_signature_paths(
  input_organization_id uuid,
  input_archive_ids text[] default null
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  signature_paths text[];
begin
  if auth.uid() is null or not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  select coalesce(array_agg(distinct signature.value ->> 'signaturePath'), array[]::text[])
    into signature_paths
    from public.organization_data as workspace
    cross join lateral jsonb_array_elements(coalesce(workspace.data -> 'archivedEmployees', '[]'::jsonb)) as archive(value)
    cross join lateral jsonb_array_elements(coalesce(archive.value -> 'signatures', '[]'::jsonb)) as signature(value)
    where workspace.organization_id = input_organization_id
      and archive.value ->> 'orgId' = input_organization_id::text
      and (input_archive_ids is null or archive.value ->> 'id' = any(input_archive_ids))
      and coalesce(signature.value ->> 'signaturePath', '') <> '';

  return signature_paths;
end;
$$;

revoke all on function public.creator_get_archived_employee_signature_paths(uuid, text[]) from public, anon;
grant execute on function public.creator_get_archived_employee_signature_paths(uuid, text[]) to authenticated;
