create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.request_client_ip()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_headers jsonb;
  candidate_ip text;
begin
  request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  candidate_ip := coalesce(
    nullif(request_headers ->> 'cf-connecting-ip', ''),
    nullif(request_headers ->> 'x-real-ip', ''),
    nullif(pg_catalog.split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1), '')
  );

  if candidate_ip is null then return 'Nenustatytas'; end if;
  return pg_catalog.host(pg_catalog.btrim(candidate_ip)::pg_catalog.inet);
exception when others then
  return 'Nenustatytas';
end;
$$;

revoke all on function private.request_client_ip() from public, anon, authenticated;

create or replace function public.append_organization_signature(
  input_organization_id uuid,
  input_employee_id text,
  input_resource_id text,
  input_signer_name text,
  input_signer_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  organization_record jsonb;
  employee jsonb;
  resource jsonb;
  required_signers jsonb;
  signature jsonb;
  signature_time timestamptz := now();
  validity_months integer;
begin
  if input_signer_role not in ('Vadovas', 'DSS specialistas', 'Komisijos narys') then
    raise exception 'Signer role is invalid';
  end if;

  select organization_data.data into workspace
    from public.organization_data
    where organization_data.organization_id = input_organization_id
    for update;
  if workspace is null then raise exception 'Organization workspace not found'; end if;

  select item.value into organization_record
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_organization_id::text;
  select item.value into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_employee_id
      and item.value ->> 'orgId' = input_organization_id::text;
  select item.value into resource
    from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_resource_id;

  if organization_record is null or employee is null or resource is null
    or not (coalesce(employee -> 'resourceIds', '[]'::jsonb) ? input_resource_id) then
    raise exception 'Employee or assigned document was not found';
  end if;

  required_signers := coalesce(employee -> 'requiredSignersByResource' -> input_resource_id, resource -> 'requiredSigners', '[]'::jsonb);
  if input_signer_role = 'Komisijos narys' then
    if not (required_signers ? 'Komisijos narys' or required_signers ? 'Komisijos nariai') then
      raise exception 'Commission signature is not required for this document';
    end if;
  elsif not (required_signers ? input_signer_role) then
    raise exception 'This signature is not required for the document';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
    where item.value ->> 'employeeId' = input_employee_id
      and item.value ->> 'resourceId' = input_resource_id
      and item.value ->> 'role' = 'Darbuotojas'
      and (item.value ->> 'validUntil' is null or (item.value ->> 'validUntil')::timestamptz >= signature_time)
  ) then
    raise exception 'Employee signature is required first';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
    where item.value ->> 'employeeId' = input_employee_id
      and item.value ->> 'resourceId' = input_resource_id
      and item.value ->> 'role' = input_signer_role
      and (input_signer_role <> 'Komisijos narys' or item.value ->> 'signer' = input_signer_name)
      and (item.value ->> 'validUntil' is null or (item.value ->> 'validUntil')::timestamptz >= signature_time)
  ) then
    raise exception 'This signer already has a current signature';
  end if;

  validity_months := case when coalesce(resource ->> 'validityMonths', '') ~ '^[0-9]{1,3}$' then (resource ->> 'validityMonths')::integer else null end;
  signature := jsonb_build_object(
    'id', 'sig-' || extensions.gen_random_uuid()::text,
    'orgId', input_organization_id,
    'employeeId', input_employee_id,
    'contractNumber', coalesce(employee ->> 'contractNumber', ''),
    'resourceId', input_resource_id,
    'signer', input_signer_name,
    'role', input_signer_role,
    'signatureMethod', 'PIN',
    'signedAt', signature_time,
    'validUntil', case when validity_months is null then null else signature_time + make_interval(months => validity_months) end,
    'ip', private.request_client_ip()
  );

  if input_resource_id = 'res-aap' then
    signature := signature || jsonb_build_object('aapSnapshot', jsonb_build_object(
      'companyName', organization_record ->> 'name',
      'companyCode', organization_record ->> 'companyCode',
      'employeeId', input_employee_id,
      'employeeName', employee ->> 'name',
      'contractNumber', coalesce(employee ->> 'contractNumber', ''),
      'position', coalesce(employee ->> 'position', 'Darbuotojas'),
      'sizes', coalesce(employee -> 'sizes', '{}'::jsonb),
      'items', coalesce(organization_record -> 'aapItems', '[]'::jsonb)
    ));
  end if;

  update public.organization_data as organization_data
    set data = jsonb_set(organization_data.data, '{signatures}',
      coalesce(organization_data.data -> 'signatures', '[]'::jsonb) || jsonb_build_array(signature), true),
      updated_at = now()
    where organization_data.organization_id = input_organization_id;
  return signature;
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
    'ip', private.request_client_ip()
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