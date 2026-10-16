alter table public.organization_memberships
  add column if not exists employee_id text;

create unique index if not exists organization_memberships_employee_id_unique
  on public.organization_memberships (organization_id, employee_id)
  where role = 'employee' and employee_id is not null;

create or replace function public.get_employee_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  employee_organization_id uuid;
  employee_id text;
  workspace jsonb;
  employee jsonb;
  organization jsonb;
  assigned_resources jsonb;
  assigned_specialists jsonb;
  assigned_signatures jsonb;
  assigned_batches jsonb;
  organization_name text;
  organization_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select membership.organization_id, membership.employee_id
    into employee_organization_id, employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;

  if not found then
    raise exception 'Employee invitation not found';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = employee_organization_id;

  if not found then
    raise exception 'Organization workspace not found';
  end if;

  select item.value
    into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_id
      and item.value ->> 'orgId' = employee_organization_id::text;

  if employee is null then
    raise exception 'Employee record not found';
  end if;

  select item.value
    into organization
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_organization_id::text;

  if organization is null then
    raise exception 'Organization record not found';
  end if;

  select company.name, company.company_code
    into organization_name, organization_code
    from public.organizations as company
    where company.id = employee_organization_id;

  employee := (employee - 'pin') || jsonb_build_object('status', 'Aktyvus');
  organization := organization || jsonb_build_object(
    'name', organization_name,
    'companyCode', coalesce(organization_code, ''),
    'resources', coalesce(employee -> 'resourceIds', '[]'::jsonb),
    'resourceSettings', coalesce((
      select jsonb_object_agg(setting.key, setting.value)
      from jsonb_each(coalesce(organization -> 'resourceSettings', '{}'::jsonb)) as setting(key, value)
      where coalesce(employee -> 'resourceIds', '[]'::jsonb) ? setting.key
    ), '{}'::jsonb)
  );

  select coalesce(jsonb_agg(item.value), '[]'::jsonb)
    into assigned_resources
    from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
    where coalesce(employee -> 'resourceIds', '[]'::jsonb) ? (item.value ->> 'id');

  select coalesce(jsonb_agg(item.value), '[]'::jsonb)
    into assigned_specialists
    from jsonb_array_elements(coalesce(workspace -> 'specialists', '[]'::jsonb)) as item(value)
    where coalesce(organization -> 'dss', '[]'::jsonb) ? (item.value ->> 'id');

  select coalesce(jsonb_agg(item.value), '[]'::jsonb)
    into assigned_signatures
    from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
    where item.value ->> 'employeeId' = employee_id
      and item.value ->> 'orgId' = employee_organization_id::text;

  select coalesce(jsonb_agg(item.value || jsonb_build_object('employeeIds', jsonb_build_array(employee_id))), '[]'::jsonb)
    into assigned_batches
    from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as item(value)
    where item.value ->> 'orgId' = employee_organization_id::text
      and coalesce(item.value -> 'employeeIds', '[]'::jsonb) ? employee_id;

  return jsonb_build_object(
    'organization', jsonb_build_object(
      'id', employee_organization_id,
      'name', organization_name,
      'company_code', organization_code
    ),
    'data', jsonb_build_object(
      'organizations', jsonb_build_array(organization),
      'employees', jsonb_build_array(employee),
      'resources', assigned_resources,
      'resourceTypes', coalesce(workspace -> 'resourceTypes', '[]'::jsonb),
      'specialists', assigned_specialists,
      'signatures', assigned_signatures,
      'protocolBatches', assigned_batches,
      'archivedEmployees', '[]'::jsonb,
      'subscriptions', '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.save_employee_workspace(
  input_sizes jsonb,
  input_progress jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_organization_id uuid;
  employee_id text;
  workspace jsonb;
  employee jsonb;
  updated_employee jsonb;
  sizes_complete boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(input_sizes) <> 'object' or jsonb_typeof(input_progress) <> 'object' then
    raise exception 'Employee data is invalid';
  end if;

  select membership.organization_id, membership.employee_id
    into employee_organization_id, employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;

  if not found then
    raise exception 'Employee invitation not found';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = employee_organization_id
    for update;

  select item.value
    into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_id;

  if employee is null then
    raise exception 'Employee record not found';
  end if;

  if exists (
    select 1
    from jsonb_each(input_progress) as progress(key, value)
    where not (coalesce(employee -> 'resourceIds', '[]'::jsonb) ? progress.key)
      or progress.value #>> '{}' not in ('started', 'completed')
  ) then
    raise exception 'Progress contains an unassigned document or invalid status';
  end if;

  if exists (
    select 1
    from jsonb_each(input_sizes) as size(key, value)
    where jsonb_typeof(size.value) <> 'string'
      or length(size.value #>> '{}') > 32
  ) then
    raise exception 'Employee size values are invalid';
  end if;

  sizes_complete := coalesce(input_sizes ->> 'shoes', '') <> ''
    and coalesce(input_sizes ->> 'clothes', '') <> ''
    and coalesce(input_sizes ->> 'pants', '') <> ''
    and coalesce(input_sizes ->> 'jacket', '') <> '';

  updated_employee := employee || jsonb_build_object(
    'sizes', input_sizes,
    'progressByResource', coalesce(employee -> 'progressByResource', '{}'::jsonb) || input_progress,
    'aapCompleted', coalesce((employee ->> 'aapCompleted')::boolean, false) or sizes_complete,
    'status', 'Aktyvus'
  );

  update public.organization_data as organization_data
    set data = jsonb_set(
      organization_data.data,
      '{employees}',
      (
        select coalesce(jsonb_agg(case when item.value ->> 'id' = employee_id then updated_employee else item.value end), '[]'::jsonb)
        from jsonb_array_elements(coalesce(organization_data.data -> 'employees', '[]'::jsonb)) as item(value)
      ),
      true
    ),
    updated_at = now()
    where organization_data.organization_id = employee_organization_id;

  return true;
end;
$$;

create or replace function public.submit_employee_test(
  input_resource_id text,
  input_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_organization_id uuid;
  employee_id text;
  workspace jsonb;
  employee jsonb;
  organization jsonb;
  resource jsonb;
  question record;
  answer jsonb;
  expected jsonb;
  expected_answer jsonb;
  correct_count integer := 0;
  question_count integer := 0;
  score integer := 0;
  answer_is_correct boolean;
  completed_at timestamptz := now();
  test_result jsonb;
  updated_employee jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(input_answers) <> 'array' then
    raise exception 'Test answers are invalid';
  end if;

  select membership.organization_id, membership.employee_id
    into employee_organization_id, employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;

  if not found then
    raise exception 'Employee invitation not found';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = employee_organization_id
    for update;

  select item.value
    into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_id;

  select item.value
    into resource
    from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_resource_id;

  if employee is null or resource is null
    or not (coalesce(employee -> 'resourceIds', '[]'::jsonb) ? input_resource_id)
    or resource ->> 'type' <> 'Testas' then
    raise exception 'Test is not assigned to this employee';
  end if;

  select item.value
    into organization
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_organization_id::text;

  for question in
    select item.value, item.ordinality
    from jsonb_array_elements(coalesce(resource -> 'questions', '[]'::jsonb)) with ordinality as item(value, ordinality)
  loop
    question_count := question_count + 1;
    answer := input_answers -> (question.ordinality - 1)::integer;
    expected := question.value -> 'correctIndices';
    answer_is_correct := false;

    if jsonb_typeof(expected) = 'array' and jsonb_typeof(answer) = 'array'
      and jsonb_array_length(expected) = jsonb_array_length(answer) then
      answer_is_correct := true;
      for expected_answer in select item.value from jsonb_array_elements(expected) as item(value)
      loop
        if not exists (
          select 1
          from jsonb_array_elements(answer) as selected(value)
          where selected.value #>> '{}' = expected_answer #>> '{}'
        ) then
          answer_is_correct := false;
          exit;
        end if;
      end loop;
    elsif question.value ? 'correctIndex' and jsonb_typeof(answer) = 'string' then
      answer_is_correct := answer #>> '{}' = question.value ->> 'correctIndex';
    end if;

    if answer_is_correct then
      correct_count := correct_count + 1;
    end if;
  end loop;

  if question_count > 0 then
    score := round((correct_count::numeric * 100) / question_count)::integer;
  end if;

  test_result := jsonb_build_object(
    'resourceId', input_resource_id,
    'score', score,
    'passed', score >= 80,
    'completedAt', completed_at,
    'ip', 'Server verified'
  );

  updated_employee := employee || jsonb_build_object(
    'testResults', coalesce(employee -> 'testResults', '[]'::jsonb) || jsonb_build_array(test_result),
    'progressByResource', case when score >= 80
      then coalesce(employee -> 'progressByResource', '{}'::jsonb) || jsonb_build_object(input_resource_id, 'completed')
      else coalesce(employee -> 'progressByResource', '{}'::jsonb)
    end,
    'resourceIds', case when score >= 80 then (
      select coalesce(jsonb_agg(to_jsonb(assigned.resource_id)), '[]'::jsonb)
      from (
        select distinct existing.value as resource_id
        from jsonb_array_elements_text(coalesce(employee -> 'resourceIds', '[]'::jsonb)) as existing(value)
        union
        select candidate.value ->> 'id' as resource_id
        from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as candidate(value)
        where candidate.value ->> 'relatedTestId' = input_resource_id
          and coalesce(organization -> 'resources', '[]'::jsonb) ? (candidate.value ->> 'id')
      ) as assigned
    ) else employee -> 'resourceIds' end
  );

  update public.organization_data as organization_data
    set data = jsonb_set(
      organization_data.data,
      '{employees}',
      (
        select coalesce(jsonb_agg(case when item.value ->> 'id' = employee_id then updated_employee else item.value end), '[]'::jsonb)
        from jsonb_array_elements(coalesce(organization_data.data -> 'employees', '[]'::jsonb)) as item(value)
      ),
      true
    ),
    updated_at = now()
    where organization_data.organization_id = employee_organization_id;

  return test_result;
end;
$$;

create or replace function public.record_employee_signature(
  input_resource_id text,
  input_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_organization_id uuid;
  employee_id text;
  workspace jsonb;
  employee jsonb;
  organization jsonb;
  resource jsonb;
  signature jsonb;
  signature_time timestamptz := now();
  validity_months integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.verify_signing_pin(input_pin) then
    return null;
  end if;

  select membership.organization_id, membership.employee_id
    into employee_organization_id, employee_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;

  if not found then
    raise exception 'Employee invitation not found';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = employee_organization_id
    for update;

  select item.value
    into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_id;

  select item.value
    into resource
    from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_resource_id;

  select item.value
    into organization
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_organization_id::text;

  if employee is null or resource is null
    or not (coalesce(employee -> 'resourceIds', '[]'::jsonb) ? input_resource_id) then
    raise exception 'Document is not assigned to this employee';
  end if;

  if coalesce(resource ->> 'relatedTestId', '') <> '' and not exists (
    select 1
    from jsonb_array_elements(coalesce(employee -> 'testResults', '[]'::jsonb)) as result(value)
    where result.value ->> 'resourceId' = resource ->> 'relatedTestId'
      and coalesce((result.value ->> 'passed')::boolean, false)
  ) then
    raise exception 'Complete the required test before signing this document';
  end if;

  if resource ->> 'type' = 'Testas' and not exists (
    select 1
    from jsonb_array_elements(coalesce(employee -> 'testResults', '[]'::jsonb)) as result(value)
    where result.value ->> 'resourceId' = input_resource_id
      and coalesce((result.value ->> 'passed')::boolean, false)
  ) then
    raise exception 'Pass the test before signing it';
  end if;

  if resource ->> 'type' <> 'Testas'
    and coalesce(employee -> 'progressByResource' ->> input_resource_id, '') <> 'completed' then
    raise exception 'Complete the document before signing it';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as existing(value)
    where existing.value ->> 'employeeId' = employee_id
      and existing.value ->> 'resourceId' = input_resource_id
      and existing.value ->> 'role' = 'Darbuotojas'
      and (existing.value ->> 'validUntil' is null or (existing.value ->> 'validUntil')::timestamptz >= signature_time)
  ) then
    raise exception 'This document is already signed';
  end if;

  validity_months := case
    when coalesce(resource ->> 'validityMonths', '') ~ '^[0-9]{1,3}$' then (resource ->> 'validityMonths')::integer
    else null
  end;

  signature := jsonb_build_object(
    'id', 'sig-' || extensions.gen_random_uuid()::text,
    'orgId', employee_organization_id,
    'employeeId', employee_id,
    'contractNumber', coalesce(employee ->> 'contractNumber', ''),
    'resourceId', input_resource_id,
    'signer', employee ->> 'name',
    'role', 'Darbuotojas',
    'signatureMethod', 'PIN',
    'signedAt', signature_time,
    'validUntil', case when validity_months is null then null else signature_time + make_interval(months => validity_months) end,
    'ip', 'Server verified'
  );

  if input_resource_id = 'res-aap' then
    signature := signature || jsonb_build_object('aapSnapshot', jsonb_build_object(
      'companyName', organization ->> 'name',
      'companyCode', organization ->> 'companyCode',
      'employeeId', employee_id,
      'employeeName', employee ->> 'name',
      'contractNumber', coalesce(employee ->> 'contractNumber', ''),
      'department', coalesce(employee ->> 'department', ''),
      'position', coalesce(employee ->> 'position', 'Darbuotojas'),
      'sizes', coalesce(employee -> 'sizes', '{}'::jsonb),
      'items', coalesce(organization -> 'aapItems', '[]'::jsonb)
    ));
  end if;

  update public.organization_data as organization_data
    set data = jsonb_set(
      organization_data.data,
      '{signatures}',
      coalesce(organization_data.data -> 'signatures', '[]'::jsonb) || jsonb_build_array(signature),
      true
    ),
    updated_at = now()
    where organization_data.organization_id = employee_organization_id;

  return signature;
end;
$$;

revoke all on function public.get_employee_workspace() from public, anon;
revoke all on function public.save_employee_workspace(jsonb, jsonb) from public, anon;
revoke all on function public.submit_employee_test(text, jsonb) from public, anon;
revoke all on function public.record_employee_signature(text, text) from public, anon;
grant execute on function public.get_employee_workspace() to authenticated;
grant execute on function public.save_employee_workspace(jsonb, jsonb) to authenticated;
grant execute on function public.submit_employee_test(text, jsonb) to authenticated;
grant execute on function public.record_employee_signature(text, text) to authenticated;