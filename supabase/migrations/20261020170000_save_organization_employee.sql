create or replace function public.save_organization_employee(
  input_organization_id uuid,
  input_employee_id text,
  input_position text,
  input_resource_ids jsonb,
  input_required_signers jsonb,
  input_protocol_batches jsonb default '[]'::jsonb
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
  updated_protocol_batches jsonb;
  updated_batch jsonb;
  protocol_batch jsonb;
  existing_batch jsonb;
  normalized_position text := btrim(coalesce(input_position, ''));
  resource_count integer;
  employee_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  if coalesce(input_employee_id, '') = '' or length(input_employee_id) > 200 then
    raise exception 'Employee ID is required';
  end if;

  if normalized_position = '' or length(normalized_position) > 120 then
    raise exception 'Employee position is invalid';
  end if;

  if input_resource_ids is null or jsonb_typeof(input_resource_ids) <> 'array' then
    raise exception 'Employee document assignments are invalid';
  end if;

  if jsonb_array_length(input_resource_ids) > 1000 then
    raise exception 'Employee document assignments are invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(input_resource_ids) as assigned(value)
    where jsonb_typeof(assigned.value) <> 'string'
      or length(assigned.value #>> '{}') > 200
  ) then
    raise exception 'Employee document assignments must contain document IDs';
  end if;

  select count(distinct assigned.value)
    into resource_count
    from jsonb_array_elements_text(input_resource_ids) as assigned(value);

  if resource_count <> jsonb_array_length(input_resource_ids) then
    raise exception 'Employee document assignments contain duplicates';
  end if;

  if input_required_signers is null or jsonb_typeof(input_required_signers) <> 'object' then
    raise exception 'Required signers are invalid';
  end if;

  if input_protocol_batches is null or jsonb_typeof(input_protocol_batches) <> 'array' then
    raise exception 'Protocol batch changes are invalid';
  end if;

  if jsonb_array_length(input_protocol_batches) > 1000 then
    raise exception 'Protocol batch changes are invalid';
  end if;

  if exists (
    select 1
    from jsonb_each(input_required_signers) as signer_assignment(document_id, signers)
    where not (input_resource_ids ? signer_assignment.document_id)
      or jsonb_typeof(signer_assignment.signers) <> 'array'
      or exists (
        select 1
        from jsonb_array_elements(signer_assignment.signers) as signer(value)
        where jsonb_typeof(signer.value) <> 'string'
          or signer.value #>> '{}' not in ('Darbuotojas', 'Vadovas', 'DSS specialistas', 'Komisijos narys')
      )
  ) then
    raise exception 'Required signers contain invalid document or role values';
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

  select count(*)
    into employee_count
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_employee_id
      and item.value ->> 'orgId' = input_organization_id::text;

  if employee_count <> 1 then
    raise exception 'Employee record is missing or ambiguous';
  end if;

  if employee is null then
    raise exception 'Employee record not found';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(input_resource_ids) as assigned(value)
    where not (coalesce(organization -> 'resources', '[]'::jsonb) ? assigned.value)
      or not exists (
        select 1
        from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as resource(value)
        where resource.value ->> 'id' = assigned.value
      )
  ) then
    raise exception 'Document assignment is not available to this organization';
  end if;

  updated_employee := employee || jsonb_build_object(
    'position', normalized_position,
    'resourceIds', input_resource_ids,
    'requiredSignersByResource', input_required_signers
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

  updated_protocol_batches := coalesce(updated_workspace -> 'protocolBatches', '[]'::jsonb);

  for protocol_batch in
    select item.value
    from jsonb_array_elements(input_protocol_batches) as item(value)
  loop
    if jsonb_typeof(protocol_batch) <> 'object'
      or coalesce(protocol_batch ->> 'id', '') = ''
      or length(protocol_batch ->> 'id') > 200
      or jsonb_typeof(protocol_batch -> 'id') <> 'string'
      or coalesce(protocol_batch ->> 'orgId', '') <> input_organization_id::text
      or jsonb_typeof(protocol_batch -> 'orgId') <> 'string'
      or coalesce(protocol_batch ->> 'resourceId', '') = ''
      or jsonb_typeof(protocol_batch -> 'resourceId') <> 'string'
      or not (coalesce(organization -> 'resources', '[]'::jsonb) ? (protocol_batch ->> 'resourceId'))
      or jsonb_typeof(coalesce(protocol_batch -> 'employeeIds', '[]'::jsonb)) <> 'array'
      or not (coalesce(protocol_batch -> 'employeeIds', '[]'::jsonb) ? input_employee_id)
      or jsonb_typeof(protocol_batch -> 'cadence') <> 'string'
      or jsonb_typeof(protocol_batch -> 'periodStart') <> 'string'
      or jsonb_typeof(protocol_batch -> 'periodEnd') <> 'string'
      or jsonb_typeof(protocol_batch -> 'protocolDate') <> 'string'
      or jsonb_typeof(protocol_batch -> 'number') <> 'number'
      or jsonb_typeof(protocol_batch -> 'createdAt') <> 'string'
    then
      raise exception 'Protocol batch change is invalid for this employee';
    end if;

    if exists (
      select 1
      from unnest(array[
        coalesce(protocol_batch ->> 'periodStart', ''),
        coalesce(protocol_batch ->> 'periodEnd', ''),
        coalesce(protocol_batch ->> 'protocolDate', '')
      ]) as batch_date(value)
      where batch_date.value <> ''
        and (
          batch_date.value !~ '^\d{4}-\d{2}-\d{2}$'
          or case
            when batch_date.value ~ '^\d{4}-\d{2}-\d{2}$'
              then to_char(to_date(batch_date.value, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> batch_date.value
            else false
          end
        )
    ) then
      raise exception 'Protocol batch dates are invalid';
    end if;

    select item.value
      into existing_batch
      from jsonb_array_elements(updated_protocol_batches) as item(value)
      where item.value ->> 'id' = protocol_batch ->> 'id';

    if existing_batch is not null then
      if coalesce(existing_batch ->> 'orgId', '') <> input_organization_id::text
        or coalesce(existing_batch ->> 'resourceId', '') <> protocol_batch ->> 'resourceId'
      then
        raise exception 'Protocol batch does not belong to this organization';
      end if;

      if not (coalesce(existing_batch -> 'employeeIds', '[]'::jsonb) ? input_employee_id) then
        updated_batch := jsonb_set(
          existing_batch,
          '{employeeIds}',
          coalesce(existing_batch -> 'employeeIds', '[]'::jsonb) || jsonb_build_array(input_employee_id),
          true
        );
      else
        updated_batch := existing_batch;
      end if;

      if protocol_batch ->> 'periodEnd' is distinct from existing_batch ->> 'periodEnd' then
        updated_batch := jsonb_set(updated_batch, '{periodEnd}', to_jsonb(coalesce(protocol_batch ->> 'periodEnd', '')), true);
      end if;
      if protocol_batch ->> 'protocolDate' is distinct from existing_batch ->> 'protocolDate' then
        updated_batch := jsonb_set(updated_batch, '{protocolDate}', to_jsonb(coalesce(protocol_batch ->> 'protocolDate', '')), true);
      end if;

      updated_protocol_batches := (
        select jsonb_agg(
          case when item.value ->> 'id' = protocol_batch ->> 'id' then updated_batch else item.value end
        )
        from jsonb_array_elements(updated_protocol_batches) as item(value)
      );
    else
      if exists (
        select 1
        from jsonb_array_elements(coalesce(updated_protocol_batches, '[]'::jsonb)) as batch(value)
        where batch.value ->> 'id' = protocol_batch ->> 'id'
      ) then
        raise exception 'Protocol batch ID is already in use';
      end if;

      if coalesce(protocol_batch ->> 'cadence', '') = ''
        or length(protocol_batch ->> 'cadence') > 40
        or coalesce(protocol_batch ->> 'number', '1') !~ '^\d+$'
      then
        raise exception 'New protocol batch metadata is invalid';
      end if;

      if (coalesce(protocol_batch ->> 'number', '1'))::numeric < 1
        or (coalesce(protocol_batch ->> 'number', '1'))::numeric > 2147483647
      then
        raise exception 'New protocol batch metadata is invalid';
      end if;

      updated_protocol_batches := coalesce(updated_protocol_batches, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'id', protocol_batch ->> 'id',
          'orgId', input_organization_id::text,
          'resourceId', protocol_batch ->> 'resourceId',
          'cadence', coalesce(protocol_batch ->> 'cadence', ''),
          'periodStart', coalesce(protocol_batch ->> 'periodStart', ''),
          'periodEnd', coalesce(protocol_batch ->> 'periodEnd', ''),
          'protocolDate', coalesce(protocol_batch ->> 'protocolDate', ''),
          'number', coalesce(protocol_batch -> 'number', '1'::jsonb),
          'employeeIds', jsonb_build_array(input_employee_id),
          'createdAt', coalesce(protocol_batch ->> 'createdAt', now()::text)
        )
      );
    end if;
  end loop;

  updated_workspace := jsonb_set(updated_workspace, '{protocolBatches}', updated_protocol_batches, true);

  update public.organization_data
    set data = updated_workspace,
        updated_by = auth.uid(),
        updated_at = now()
    where organization_id = input_organization_id;

  return true;
end;
$$;

revoke all on function public.save_organization_employee(uuid, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_organization_employee(uuid, text, text, jsonb, jsonb, jsonb) to authenticated;
