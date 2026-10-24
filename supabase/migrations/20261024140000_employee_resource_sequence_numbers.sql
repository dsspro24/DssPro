create or replace function public.save_organization_employee_sequence_numbers(
  input_organization_id uuid,
  input_employee_id text,
  input_sequence_numbers jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  organization jsonb;
  employee jsonb;
  updated_employee jsonb;
  updated_workspace jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  if coalesce(input_employee_id, '') = '' or length(input_employee_id) > 200
    or input_sequence_numbers is null
    or jsonb_typeof(input_sequence_numbers) <> 'object' then
    raise exception 'Employee document sequence numbers are invalid';
  end if;

  if (select count(*) from jsonb_each(input_sequence_numbers)) > 1000 then
    raise exception 'Employee document sequence numbers are invalid';
  end if;

  if exists (
    select 1
    from jsonb_each(input_sequence_numbers) as sequence_number(resource_id, value)
    where jsonb_typeof(sequence_number.value) <> 'number'
      or sequence_number.value::text !~ '^[1-9][0-9]*$'
      or (sequence_number.value::text)::numeric > 2147483647
  ) then
    raise exception 'Employee document sequence numbers must be positive integers';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data as organization_data
    where organization_data.organization_id = input_organization_id
    for update;

  if workspace is null then
    raise exception 'Organization workspace not found';
  end if;

  select item.value
    into organization
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_organization_id::text;

  if organization is null then
    raise exception 'Organization record not found';
  end if;

  select item.value
    into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_employee_id
      and item.value ->> 'orgId' = input_organization_id::text;

  if employee is null then
    raise exception 'Employee record not found';
  end if;

  if exists (
    select 1
    from jsonb_each(input_sequence_numbers) as sequence_number(resource_id, value)
    where not (
      coalesce(employee -> 'sequenceNumbersByResource', '{}'::jsonb) ? sequence_number.resource_id
      and employee -> 'sequenceNumbersByResource' -> sequence_number.resource_id = sequence_number.value
    )
      and (
        not (coalesce(organization -> 'resources', '[]'::jsonb) ? sequence_number.resource_id)
        or not exists (
          select 1
          from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as resource(value)
          where resource.value ->> 'id' = sequence_number.resource_id
        )
      )
  ) then
    raise exception 'Document sequence number references a document not available to this organization';
  end if;

  if exists (
    select 1
    from jsonb_each(input_sequence_numbers) as sequence_number(resource_id, value)
    where coalesce(employee -> 'sequenceNumbersByResource', '{}'::jsonb) ? sequence_number.resource_id
      and employee -> 'sequenceNumbersByResource' -> sequence_number.resource_id <> sequence_number.value
  ) then
    raise exception 'An assigned document sequence number cannot be changed';
  end if;

  if exists (
    select 1
    from jsonb_each(input_sequence_numbers) as sequence_number(resource_id, value)
    where exists (
      select 1
      from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as other_employee(value)
      where other_employee.value ->> 'id' <> input_employee_id
        and other_employee.value ->> 'orgId' = input_organization_id::text
        and other_employee.value -> 'sequenceNumbersByResource' -> sequence_number.resource_id = sequence_number.value
    ) or exists (
      select 1
      from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as archive(value)
      where archive.value ->> 'orgId' = input_organization_id::text
        and archive.value -> 'employee' ->> 'id' <> input_employee_id
        and archive.value -> 'employee' -> 'sequenceNumbersByResource' -> sequence_number.resource_id = sequence_number.value
    )
  ) then
    raise exception 'Document sequence number is already assigned to another employee';
  end if;

  updated_employee := employee || jsonb_build_object(
    'sequenceNumbersByResource',
    coalesce(employee -> 'sequenceNumbersByResource', '{}'::jsonb) || input_sequence_numbers
  );

  updated_workspace := jsonb_set(
    workspace,
    '{employees}',
    (
      select coalesce(
        jsonb_agg(
          case
            when item.value ->> 'id' = input_employee_id
              and item.value ->> 'orgId' = input_organization_id::text
              then updated_employee
            else item.value
          end
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    ),
    true
  );

  update public.organization_data
    set data = updated_workspace,
        updated_by = auth.uid(),
        updated_at = now()
    where organization_id = input_organization_id;

  return true;
end;
$$;

revoke all on function public.save_organization_employee_sequence_numbers(uuid, text, jsonb) from public, anon;
grant execute on function public.save_organization_employee_sequence_numbers(uuid, text, jsonb) to authenticated;
