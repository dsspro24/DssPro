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
  if auth.uid() is null or not public.can_manage_organization(input_organization_id) then
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
  if auth.uid() is null or not public.can_manage_organization(input_organization_id) then
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
