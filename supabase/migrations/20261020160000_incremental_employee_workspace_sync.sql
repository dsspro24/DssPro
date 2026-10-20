create or replace function public.sync_employee_workspace_delta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_employee_ids text[];
  changed_batch_ids text[];
  employee jsonb;
  employee_archived boolean;
  batch jsonb;
  attempt jsonb;
  resource_id text;
begin
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(new.data -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = new.organization_id::text
  ) then
    return new;
  end if;

  select coalesce(array_agg(changed.employee_id), '{}'::text[])
    into changed_employee_ids
    from (
      select coalesce(old_employee.value ->> 'id', new_employee.value ->> 'id') as employee_id
      from jsonb_array_elements(coalesce(old.data -> 'employees', '[]'::jsonb)) as old_employee(value)
      full join jsonb_array_elements(coalesce(new.data -> 'employees', '[]'::jsonb)) as new_employee(value)
        on old_employee.value ->> 'id' = new_employee.value ->> 'id'
      where old_employee.value is distinct from new_employee.value
        and coalesce(old_employee.value ->> 'id', new_employee.value ->> 'id') is not null
    ) as changed;

  select coalesce(array_agg(changed.batch_id), '{}'::text[])
    into changed_batch_ids
    from (
      select coalesce(old_batch.value ->> 'id', new_batch.value ->> 'id') as batch_id
      from jsonb_array_elements(coalesce(old.data -> 'protocolBatches', '[]'::jsonb)) as old_batch(value)
      full join jsonb_array_elements(coalesce(new.data -> 'protocolBatches', '[]'::jsonb)) as new_batch(value)
        on old_batch.value ->> 'id' = new_batch.value ->> 'id'
      where old_batch.value is distinct from new_batch.value
        and coalesce(old_batch.value ->> 'id', new_batch.value ->> 'id') is not null
    ) as changed;

  for employee, employee_archived in
    select item.value, false
    from jsonb_array_elements(coalesce(new.data -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = any(changed_employee_ids)
    union all
    select item.value -> 'employee', true
    from jsonb_array_elements(coalesce(new.data -> 'archivedEmployees', '[]'::jsonb)) as item(value)
    where jsonb_typeof(item.value -> 'employee') = 'object'
      and item.value -> 'employee' ->> 'id' = any(changed_employee_ids)
  loop
    if coalesce(employee ->> 'id', '') = '' then
      continue;
    end if;

    insert into public.organization_employees (
      employee_id, organization_id, auth_user_id, full_name, email, contract_number, position,
      status, archived_at, invited_at, medical_certificate_valid_until, sizes, metadata, updated_at
    ) values (
      employee ->> 'id', new.organization_id,
      (
        select membership.user_id
        from public.organization_memberships as membership
        where membership.organization_id = new.organization_id
          and membership.employee_id = employee ->> 'id'
          and membership.role = 'employee'
        limit 1
      ),
      coalesce(employee ->> 'name', ''), lower(coalesce(employee ->> 'email', '')),
      coalesce(employee ->> 'contractNumber', ''), coalesce(employee ->> 'position', 'Darbuotojas'),
      case when employee_archived then 'Archyvuotas' else coalesce(employee ->> 'status', 'Pakviestas') end,
      case when employee_archived then now() else null end,
      case when coalesce(employee ->> 'invitedAt', '') ~ '^\d{4}-\d{2}-\d{2}' then (employee ->> 'invitedAt')::timestamptz else null end,
      case when coalesce(employee ->> 'medicalCertificateValidUntil', '') ~ '^\d{4}-\d{2}-\d{2}$' then (employee ->> 'medicalCertificateValidUntil')::date else null end,
      coalesce(employee -> 'sizes', '{}'::jsonb), employee - 'pin', now()
    ) on conflict (employee_id) do update
      set auth_user_id = coalesce(excluded.auth_user_id, organization_employees.auth_user_id),
          full_name = excluded.full_name,
          email = excluded.email,
          contract_number = excluded.contract_number,
          position = excluded.position,
          status = excluded.status,
          archived_at = case when employee_archived then coalesce(organization_employees.archived_at, now()) else null end,
          invited_at = coalesce(organization_employees.invited_at, excluded.invited_at),
          medical_certificate_valid_until = excluded.medical_certificate_valid_until,
          sizes = excluded.sizes,
          metadata = excluded.metadata,
          updated_at = now();

    delete from public.employee_document_assignments
    where organization_id = new.organization_id
      and employee_id = employee ->> 'id';

    for resource_id in
      select item.value
      from jsonb_array_elements_text(coalesce(employee -> 'resourceIds', '[]'::jsonb)) as item(value)
    loop
      insert into public.employee_document_assignments (
        organization_id, employee_id, document_id, required_signers, assigned_by, metadata
      ) values (
        new.organization_id, employee ->> 'id', resource_id,
        coalesce(employee -> 'requiredSignersByResource' -> resource_id, '[]'::jsonb), new.updated_by,
        jsonb_build_object('progress', coalesce(employee -> 'progressByResource' -> resource_id, 'null'::jsonb))
      ) on conflict (organization_id, employee_id, document_id) do update
        set required_signers = excluded.required_signers, metadata = excluded.metadata;
    end loop;

    for attempt in
      select item.value
      from jsonb_array_elements(coalesce(employee -> 'testResults', '[]'::jsonb)) as item(value)
    loop
      if coalesce(attempt ->> 'resourceId', '') = '' or coalesce(attempt ->> 'completedAt', '') = '' then
        continue;
      end if;

      insert into public.employee_test_attempts (
        attempt_id, organization_id, employee_id, document_id, score, passed, completed_at, metadata
      ) values (
        (employee ->> 'id') || ':' || (attempt ->> 'resourceId') || ':' || (attempt ->> 'completedAt'),
        new.organization_id, employee ->> 'id', attempt ->> 'resourceId',
        greatest(0, least(100, coalesce((attempt ->> 'score')::integer, 0))),
        coalesce((attempt ->> 'passed')::boolean, false), (attempt ->> 'completedAt')::timestamptz,
        attempt - 'resourceId' - 'score' - 'passed' - 'completedAt'
      ) on conflict (attempt_id) do update
        set score = excluded.score,
            passed = excluded.passed,
            metadata = excluded.metadata;
    end loop;
  end loop;

  delete from public.employee_document_assignments as assignment
  where assignment.organization_id = new.organization_id
    and assignment.employee_id = any(changed_employee_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.data -> 'employees', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = assignment.employee_id
        and coalesce(item.value -> 'resourceIds', '[]'::jsonb) ? assignment.document_id
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.data -> 'archivedEmployees', '[]'::jsonb)) as item(value)
      where item.value -> 'employee' ->> 'id' = assignment.employee_id
        and coalesce(item.value -> 'employee' -> 'resourceIds', '[]'::jsonb) ? assignment.document_id
    );

  for batch in
    select item.value
    from jsonb_array_elements(coalesce(new.data -> 'protocolBatches', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = any(changed_batch_ids)
  loop
    if coalesce(batch ->> 'id', '') = '' or coalesce(batch ->> 'resourceId', '') = '' then
      continue;
    end if;

    insert into public.protocol_batches (
      batch_id, organization_id, document_id, cadence, period_start, period_end,
      protocol_date, batch_number, payload, updated_at
    ) values (
      batch ->> 'id', new.organization_id, batch ->> 'resourceId', coalesce(batch ->> 'cadence', ''),
      case when coalesce(batch ->> 'periodStart', '') ~ '^\d{4}-\d{2}-\d{2}$' then (batch ->> 'periodStart')::date else null end,
      case when coalesce(batch ->> 'periodEnd', '') ~ '^\d{4}-\d{2}-\d{2}$' then (batch ->> 'periodEnd')::date else null end,
      case when coalesce(batch ->> 'protocolDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then (batch ->> 'protocolDate')::date else null end,
      greatest(1, coalesce((batch ->> 'number')::integer, 1)), batch, now()
    ) on conflict (batch_id) do update
      set document_id = excluded.document_id,
          cadence = excluded.cadence,
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          protocol_date = excluded.protocol_date,
          batch_number = excluded.batch_number,
          payload = excluded.payload,
          updated_at = now();
  end loop;

  delete from public.protocol_batches as protocol_batch
  where protocol_batch.organization_id = new.organization_id
    and protocol_batch.batch_id = any(changed_batch_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.data -> 'protocolBatches', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = protocol_batch.batch_id
    );

  delete from public.protocol_batch_employees
  where organization_id = new.organization_id
    and (
      batch_id = any(changed_batch_ids)
      or employee_id = any(changed_employee_ids)
    );

  insert into public.protocol_batch_employees (organization_id, batch_id, employee_id)
  select new.organization_id, batch.value ->> 'id', person.value
  from jsonb_array_elements(coalesce(new.data -> 'protocolBatches', '[]'::jsonb)) as batch(value)
  cross join lateral jsonb_array_elements_text(coalesce(batch.value -> 'employeeIds', '[]'::jsonb)) as person(value)
  where batch.value ->> 'id' = any(changed_batch_ids)
     or person.value = any(changed_employee_ids)
  on conflict (batch_id, employee_id) do nothing;

  delete from public.organization_memberships as membership
  where membership.organization_id = new.organization_id
    and membership.role = 'employee'
    and membership.employee_id = any(changed_employee_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.data -> 'employees', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = membership.employee_id
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.data -> 'archivedEmployees', '[]'::jsonb)) as item(value)
      where item.value -> 'employee' ->> 'id' = membership.employee_id
    );

  delete from public.organization_employees as employee_row
  where employee_row.organization_id = new.organization_id
    and employee_row.employee_id = any(changed_employee_ids)
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.data -> 'employees', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = employee_row.employee_id
    )
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.data -> 'archivedEmployees', '[]'::jsonb)) as item(value)
      where item.value -> 'employee' ->> 'id' = employee_row.employee_id
    )
    and not exists (
      select 1
      from public.document_signatures as signature
      where signature.organization_id = new.organization_id
        and signature.employee_id = employee_row.employee_id
    );

  return new;
end;
$$;

drop trigger if exists sync_organization_workspace_to_saas on public.organization_data;

create trigger sync_organization_workspace_to_saas_insert
  after insert on public.organization_data
  for each row execute function public.sync_organization_workspace_to_saas();

create trigger sync_organization_workspace_to_saas_full_update
  after update of data on public.organization_data
  for each row
  when (
    new.data is distinct from old.data
    and (
      (new.data - 'employees' - 'protocolBatches') is distinct from (old.data - 'employees' - 'protocolBatches')
      or (
        (new.data -> 'employees') is not distinct from (old.data -> 'employees')
        and (new.data -> 'protocolBatches') is not distinct from (old.data -> 'protocolBatches')
      )
    )
  )
  execute function public.sync_organization_workspace_to_saas();

create trigger sync_organization_workspace_to_saas_employee_delta
  after update of data on public.organization_data
  for each row
  when (
    (new.data - 'employees' - 'protocolBatches') is not distinct from (old.data - 'employees' - 'protocolBatches')
    and (
      (new.data -> 'employees') is distinct from (old.data -> 'employees')
      or (new.data -> 'protocolBatches') is distinct from (old.data -> 'protocolBatches')
    )
  )
  execute function public.sync_employee_workspace_delta();
