create or replace function public.protect_organization_workspace_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  organization_item jsonb;
  organizations jsonb := '[]'::jsonb;
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{signatures}', '[]'::jsonb, true);
    new.data := jsonb_set(new.data, '{archivedEmployees}', '[]'::jsonb, true);
  else
    if new.data -> 'signatures' is distinct from old.data -> 'signatures' then
      new.data := jsonb_set(new.data, '{signatures}', coalesce(old.data -> 'signatures', '[]'::jsonb), true);
    end if;
    new.data := jsonb_set(new.data, '{archivedEmployees}', coalesce(old.data -> 'archivedEmployees', '[]'::jsonb), true);
  end if;

  for organization_item in
    select item.value from jsonb_array_elements(coalesce(new.data -> 'organizations', '[]'::jsonb)) as item(value)
  loop
    organizations := organizations || jsonb_build_array(organization_item - 'commissionPins');
  end loop;
  new.data := jsonb_set(new.data, '{organizations}', organizations, true);
  return new;
end;
$$;

create or replace function public.get_organization_workspace_metadata(input_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select workspace.data - 'resources' - 'archivedEmployees'
  from public.organization_data as workspace
  where workspace.organization_id = input_organization_id;
$$;

create or replace function public.get_archived_employee_page(
  input_organization_id uuid,
  input_search text default '',
  input_page integer default 1,
  input_page_size integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  normalized_search text := lower(btrim(coalesce(input_search, '')));
  current_page integer := greatest(coalesce(input_page, 1), 1);
  current_page_size integer := greatest(1, least(coalesce(input_page_size, 12), 50));
  total_count integer;
  page_records_json jsonb;
begin
  if auth.uid() is null
    or (not public.is_organization_member(input_organization_id, array['manager']) and not public.is_creator()) then
    raise exception 'Archive access denied';
  end if;

  select organization_data.data into workspace
  from public.organization_data as organization_data
  where organization_data.organization_id = input_organization_id;

  if workspace is null then
    return jsonb_build_object('records', '[]'::jsonb, 'totalCount', 0);
  end if;

  with matching_records as materialized (
    select item.value as record
    from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as item(value)
    where item.value ->> 'orgId' = input_organization_id::text
      and (normalized_search = ''
        or strpos(lower(concat_ws(' ',
        item.value #>> '{employee,name}',
        item.value #>> '{employee,email}',
        item.value #>> '{employee,contractNumber}',
        item.value #>> '{employee,position}'
      )), normalized_search) > 0)
  ),
  page_records as (
    select record
    from matching_records
    order by nullif(record ->> 'archivedAt', '')::timestamptz desc nulls last, record ->> 'id'
    limit current_page_size
    offset (current_page - 1) * current_page_size
  ),
  record_result as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', record -> 'id',
      'orgId', record -> 'orgId',
      'employee', jsonb_build_object(
        'id', record #> '{employee,id}',
        'name', record #> '{employee,name}',
        'email', record #> '{employee,email}',
        'contractNumber', record #> '{employee,contractNumber}',
        'position', record #> '{employee,position}'
      ),
      'archivedAt', record -> 'archivedAt',
      'signatureCount', jsonb_array_length(coalesce(record -> 'signatures', '[]'::jsonb))
    )), '[]'::jsonb) as records
    from page_records
  ),
  count_result as (
    select count(*)::integer as total_count from matching_records
  )
  select count_result.total_count, record_result.records
  into total_count, page_records_json
  from count_result cross join record_result;

  return jsonb_build_object('records', page_records_json, 'totalCount', total_count);
end;
$$;

create or replace function public.get_archived_employee_record(
  input_organization_id uuid,
  input_archive_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  archive_record jsonb;
  latest_for_email boolean;
  archived_email text;
begin
  if auth.uid() is null
    or (not public.is_organization_member(input_organization_id, array['manager']) and not public.is_creator()) then
    raise exception 'Archive access denied';
  end if;

  select organization_data.data into workspace
  from public.organization_data as organization_data
  where organization_data.organization_id = input_organization_id;

  select item.value into archive_record
  from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = input_archive_id
    and item.value ->> 'orgId' = input_organization_id::text;

  if archive_record is null then
    return null;
  end if;

  archived_email := lower(btrim(coalesce(archive_record #>> '{employee,email}', '')));
  select not exists (
    select 1
    from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as item(value)
    where item.value ->> 'orgId' = input_organization_id::text
      and lower(btrim(coalesce(item.value #>> '{employee,email}', ''))) = archived_email
      and coalesce(nullif(item.value ->> 'archivedAt', '')::timestamptz, '-infinity'::timestamptz)
        > coalesce(nullif(archive_record ->> 'archivedAt', '')::timestamptz, '-infinity'::timestamptz)
  ) into latest_for_email;

  return jsonb_build_object('record', archive_record, 'isLatestForEmail', latest_for_email);
end;
$$;

create or replace function public.find_archived_employee_by_email(
  input_organization_id uuid,
  input_email text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  archive_record jsonb;
  normalized_email text := lower(btrim(coalesce(input_email, '')));
begin
  if auth.uid() is null or not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  if normalized_email = '' then
    return null;
  end if;

  select organization_data.data into workspace
  from public.organization_data as organization_data
  where organization_data.organization_id = input_organization_id;

  select item.value into archive_record
  from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as item(value)
  where item.value ->> 'orgId' = input_organization_id::text
    and lower(btrim(coalesce(item.value #>> '{employee,email}', ''))) = normalized_email
  order by nullif(item.value ->> 'archivedAt', '')::timestamptz desc nulls last
  limit 1;

  if archive_record is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', archive_record -> 'id',
    'orgId', archive_record -> 'orgId',
    'employee', jsonb_build_object(
      'id', archive_record #> '{employee,id}',
      'name', archive_record #> '{employee,name}',
      'email', archive_record #> '{employee,email}',
      'position', archive_record #> '{employee,position}'
    ),
    'archivedAt', archive_record -> 'archivedAt'
  );
end;
$$;

create or replace function public.get_archived_employee_report_data(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report_data jsonb;
begin
  if auth.uid() is null
    or (not public.is_organization_member(input_organization_id, array['manager']) and not public.is_creator()) then
    raise exception 'Archive access denied';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'orgId', archive.value -> 'orgId',
      'employee', coalesce(archive.value -> 'employee', '{}'::jsonb) - 'pin'
    )
    order by nullif(archive.value ->> 'archivedAt', '')::timestamptz desc nulls last
  ), '[]'::jsonb) into report_data
  from public.organization_data as workspace
  cross join lateral jsonb_array_elements(coalesce(workspace.data -> 'archivedEmployees', '[]'::jsonb)) as archive(value)
  where workspace.organization_id = input_organization_id
    and archive.value ->> 'orgId' = input_organization_id::text;
  return coalesce(report_data, '[]'::jsonb);
end;
$$;

create or replace function public.archive_organization_employee(
  input_organization_id uuid,
  input_employee_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  employee jsonb;
  organization jsonb;
  archive_id text;
  archive_record jsonb;
begin
  if auth.uid() is null or not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  select organization_data.data into workspace
  from public.organization_data as organization_data
  where organization_data.organization_id = input_organization_id
  for update;

  select item.value into employee
  from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = input_employee_id
    and item.value ->> 'orgId' = input_organization_id::text;

  if employee is null then
    raise exception 'Active employee was not found';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
    where item.value ->> 'employeeId' = input_employee_id
      and item.value ->> 'orgId' = input_organization_id::text
  ) then
    raise exception 'Employee has no signatures and cannot be archived';
  end if;

  select item.value into organization
  from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
  where item.value ->> 'id' = input_organization_id::text;

  archive_id := 'archive-' || input_employee_id || '-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  archive_record := jsonb_build_object(
    'id', archive_id,
    'orgId', input_organization_id::text,
    'organization', case when organization is null then null else jsonb_build_object(
      'id', organization -> 'id',
      'name', organization -> 'name',
      'companyCode', organization -> 'companyCode'
    ) end,
    'employee', jsonb_set((employee - 'pin'), '{status}', '"Atleistas"'::jsonb, true),
    'resources', coalesce((
      select jsonb_agg(resource.value)
      from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as resource(value)
      where coalesce(employee -> 'resourceIds', '[]'::jsonb) ? (resource.value ->> 'id')
    ), '[]'::jsonb),
    'signatures', coalesce((
      select jsonb_agg(signature.value)
      from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as signature(value)
      where signature.value ->> 'employeeId' = input_employee_id
        and signature.value ->> 'orgId' = input_organization_id::text
    ), '[]'::jsonb),
    'archivedAt', now()::text
  );

  update public.organization_data
  set data = jsonb_set(
    jsonb_set(
      coalesce(workspace, '{}'::jsonb),
      '{employees}',
      coalesce((
        select jsonb_agg(item.value)
        from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
        where item.value ->> 'id' <> input_employee_id
      ), '[]'::jsonb),
      true
    ),
    '{archivedEmployees}',
    coalesce(workspace -> 'archivedEmployees', '[]'::jsonb) || jsonb_build_array(archive_record),
    true
  ),
  updated_by = auth.uid(),
  updated_at = now()
  where organization_id = input_organization_id;

  return archive_id;
end;
$$;

revoke all on function public.get_archived_employee_page(uuid, text, integer, integer) from public, anon;
revoke all on function public.get_archived_employee_record(uuid, text) from public, anon;
revoke all on function public.find_archived_employee_by_email(uuid, text) from public, anon;
revoke all on function public.get_archived_employee_report_data(uuid) from public, anon;
revoke all on function public.archive_organization_employee(uuid, text) from public, anon;
grant execute on function public.get_archived_employee_page(uuid, text, integer, integer) to authenticated;
grant execute on function public.get_archived_employee_record(uuid, text) to authenticated;
grant execute on function public.find_archived_employee_by_email(uuid, text) to authenticated;
grant execute on function public.get_archived_employee_report_data(uuid) to authenticated;
grant execute on function public.archive_organization_employee(uuid, text) to authenticated;
