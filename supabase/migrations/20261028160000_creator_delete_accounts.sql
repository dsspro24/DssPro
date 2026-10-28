alter table public.organization_data
  alter column updated_by drop not null;

alter table public.organization_data
  drop constraint if exists organization_data_updated_by_fkey;
alter table public.organization_data
  add constraint organization_data_updated_by_fkey
  foreign key (updated_by) references auth.users (id) on delete set null;

alter table public.export_jobs
  alter column requested_by drop not null;
alter table public.export_jobs
  drop constraint if exists export_jobs_requested_by_fkey;
alter table public.export_jobs
  add constraint export_jobs_requested_by_fkey
  foreign key (requested_by) references auth.users (id) on delete set null;

alter table public.organization_commission_assignments
  alter column invited_by drop not null;
alter table public.organization_commission_assignments
  drop constraint if exists organization_commission_assignments_invited_by_fkey;
alter table public.organization_commission_assignments
  add constraint organization_commission_assignments_invited_by_fkey
  foreign key (invited_by) references auth.users (id) on delete set null;

create or replace function public.creator_delete_account(input_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_name text;
  target_type text;
  target_email text;
  owned_organizations jsonb;
  storage_files jsonb;
  workspace_row record;
  remaining_organizations jsonb;
  updated_workspace jsonb;
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;
  if input_user_id is null or input_user_id = auth.uid() then
    raise exception 'Cannot delete this account';
  end if;

  select profile.full_name, profile.account_type, auth_user.email
    into target_name, target_type, target_email
    from public.profiles as profile
    join auth.users as auth_user on auth_user.id = profile.id
    where profile.id = input_user_id
    for update of profile, auth_user;

  if not found then
    raise exception 'Account was not found';
  end if;
  if target_type not in ('manager', 'dss_specialist') then
    raise exception 'Only manager and DSS specialist accounts can be deleted here';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', organization.id, 'name', organization.name)
    order by organization.name
  ), '[]'::jsonb)
    into owned_organizations
    from public.organizations as organization
    where organization.created_by = input_user_id;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', file.bucket_id, 'path', file.storage_path)), '[]'::jsonb)
    into storage_files
    from (
      select asset.bucket_id, asset.storage_path
        from public.organization_assets as asset
        join public.organizations as organization on organization.id = asset.organization_id
        where organization.created_by = input_user_id
      union
      select 'organization-assets', document.storage_path
        from public.organization_documents as document
        join public.organizations as organization on organization.id = document.organization_id
        where organization.created_by = input_user_id
          and document.storage_path is not null
      union
      select job.bucket_id, job.storage_path
        from public.export_jobs as job
        join public.organizations as organization on organization.id = job.organization_id
        where organization.created_by = input_user_id
          and job.storage_path is not null
      union
      select 'signature-assets', signature.value ->> 'signaturePath'
        from public.organization_data as workspace
        join public.organizations as organization on organization.id = workspace.organization_id
        cross join lateral jsonb_array_elements(coalesce(workspace.data -> 'signatures', '[]'::jsonb)) as signature(value)
        where organization.created_by = input_user_id
          and coalesce(signature.value ->> 'signaturePath', '') <> ''
    ) as file;

  for workspace_row in
    select organization_id, data, updated_by
      from public.organization_data
      where data is not null
      for update
  loop
    remaining_organizations := case
      when jsonb_typeof(workspace_row.data -> 'organizations') = 'array'
        then coalesce((
          select jsonb_agg(
            case
              when jsonb_typeof(organization.value -> 'dss') = 'array'
                then jsonb_set(
                  organization.value,
                  '{dss}',
                  coalesce((
                    select jsonb_agg(to_jsonb(specialist.value))
                    from jsonb_array_elements_text(organization.value -> 'dss') as specialist(value)
                    where specialist.value <> input_user_id::text
                  ), '[]'::jsonb),
                  true
                )
              else organization.value
            end
            order by organization.ordinality
          )
          from jsonb_array_elements(workspace_row.data -> 'organizations')
            with ordinality as organization(value, ordinality)
        ), '[]'::jsonb)
      else workspace_row.data -> 'organizations'
    end;

    updated_workspace := jsonb_set(
      jsonb_set(
        jsonb_set(
          workspace_row.data,
          '{organizations}',
          coalesce(remaining_organizations, '[]'::jsonb),
          workspace_row.data ? 'organizations'
        ),
        '{dssInvitations}',
        coalesce((
          select jsonb_agg(invitation.value order by invitation.ordinality)
          from jsonb_array_elements(coalesce(workspace_row.data -> 'dssInvitations', '[]'::jsonb))
            with ordinality as invitation(value, ordinality)
          where coalesce(invitation.value ->> 'specialist_user_id', invitation.value ->> 'specialistUserId', '') <> input_user_id::text
        ), '[]'::jsonb),
        workspace_row.data ? 'dssInvitations'
      ),
      '{dssOrganizationRequests}',
      coalesce((
        select jsonb_agg(request.value order by request.ordinality)
        from jsonb_array_elements(coalesce(workspace_row.data -> 'dssOrganizationRequests', '[]'::jsonb))
          with ordinality as request(value, ordinality)
        where coalesce(request.value ->> 'specialist_user_id', request.value ->> 'specialistUserId', '') <> input_user_id::text
      ), '[]'::jsonb),
      workspace_row.data ? 'dssOrganizationRequests'
    );

    if workspace_row.updated_by = input_user_id or updated_workspace is distinct from workspace_row.data then
      update public.organization_data
        set data = updated_workspace,
            updated_by = case when workspace_row.updated_by = input_user_id then null else workspace_row.updated_by end,
            updated_at = now()
        where organization_id = workspace_row.organization_id;
    end if;
  end loop;

  update public.export_jobs
    set requested_by = null
    where requested_by = input_user_id;
  update public.organization_commission_assignments
    set invited_by = null
    where invited_by = input_user_id;

  delete from public.organization_memberships
    where user_id = input_user_id;
  delete from public.dss_specialist_invitations
    where specialist_user_id = input_user_id;
  delete from public.dss_organization_requests
    where specialist_user_id = input_user_id;

  delete from public.protocol_commission_signatures
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.organization_commission_assignments
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.document_signatures
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.employee_test_attempts
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.employee_document_assignments
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.protocol_batch_employees
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.protocol_batches
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.organization_resource_access
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.export_jobs
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.organization_assets
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.organization_documents
    where organization_id in (
      select id from public.organizations where created_by = input_user_id
    );
  delete from public.organizations
    where created_by = input_user_id;

  return jsonb_build_object(
    'userId', input_user_id,
    'fullName', target_name,
    'email', target_email,
    'accountType', target_type,
    'ownedOrganizations', owned_organizations,
    'storageFiles', storage_files
  );
end;
$$;

revoke all on function public.creator_delete_account(uuid) from public, anon;
grant execute on function public.creator_delete_account(uuid) to authenticated;
