create or replace function public.get_employee_accident_journal_tasks(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  employee_record_id text;
  workspace jsonb;
  organization_record jsonb;
  tasks jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select membership.employee_id
    into employee_record_id
    from public.organization_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.organization_id = input_organization_id
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;

  if not found then
    raise exception 'Employee invitation not found';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = input_organization_id;

  select item.value
    into organization_record
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_organization_id::text;

  select coalesce(jsonb_agg(
    entry.value || jsonb_build_object(
      'organizationId', input_organization_id,
      'organizationName', coalesce(organization_record ->> 'name', ''),
      'organizationCode', coalesce(organization_record ->> 'companyCode', '')
    )
    order by entry.ordinality
  ), '[]'::jsonb)
    into tasks
    from jsonb_array_elements(coalesce(
      organization_record -> 'resourceSettings' -> 'res-accident-incident-journal' -> 'incidentEntries',
      '[]'::jsonb
    )) with ordinality as entry(value, ordinality)
    where entry.value ->> 'assignedEmployeeId' = employee_record_id
      and jsonb_typeof(entry.value -> 'managerSignature') = 'object'
      and coalesce(jsonb_typeof(entry.value -> 'employeeSignature'), 'null') <> 'object';

  return tasks;
end;
$$;

create or replace function public.get_accident_journal_entries(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  organization_record jsonb;
begin
  if not public.is_organization_member(input_organization_id, array['manager', 'dss_specialist']) then
    raise exception 'Organization manager or assigned DSS specialist access required';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = input_organization_id;

  select item.value
    into organization_record
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_organization_id::text;

  return coalesce(
    organization_record -> 'resourceSettings' -> 'res-accident-incident-journal' -> 'incidentEntries',
    '[]'::jsonb
  );
end;
$$;

create or replace function public.sign_accident_journal_entry(
  input_organization_id uuid,
  input_entry_id text,
  input_pin text,
  input_signature_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  actor_employee_id text;
  actor_name text;
  workspace jsonb;
  organization_record jsonb;
  employee_record jsonb;
  entry_record jsonb;
  updated_entry jsonb;
  updated_entries jsonb;
  updated_organization jsonb;
  updated_organizations jsonb;
  resource_settings jsonb;
  resource_setting jsonb;
  signature_record jsonb;
  signature_role text;
  signature_key text;
  signature_time timestamptz := now();
  signature_id text := 'sig-' || extensions.gen_random_uuid()::text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(input_entry_id, '') = '' or length(input_entry_id) > 100 then
    raise exception 'Incident entry id is invalid';
  end if;
  if coalesce(input_signature_path, '') !~ ('^' || input_organization_id::text || '/[a-f0-9-]{36}\.svg$') then
    raise exception 'Signature asset path is invalid';
  end if;

  select membership.role, membership.employee_id
    into actor_role, actor_employee_id
    from public.organization_memberships as membership
    where membership.organization_id = input_organization_id
      and membership.user_id = (select auth.uid())
    limit 1;

  if not found or actor_role not in ('manager', 'dss_specialist', 'employee') then
    raise exception 'Organization access required';
  end if;
  if not public.verify_signing_pin(input_pin) then
    return null;
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = input_organization_id
    for update;
  if workspace is null then
    raise exception 'Organization workspace was not found';
  end if;

  select item.value
    into organization_record
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_organization_id::text;
  if organization_record is null then
    raise exception 'Organization record was not found';
  end if;

  resource_settings := coalesce(organization_record -> 'resourceSettings', '{}'::jsonb);
  resource_setting := coalesce(resource_settings -> 'res-accident-incident-journal', '{}'::jsonb);

  select item.value
    into entry_record
    from jsonb_array_elements(coalesce(resource_setting -> 'incidentEntries', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_entry_id;
  if entry_record is null then
    raise exception 'Incident entry was not found';
  end if;

  select item.value
    into employee_record
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = entry_record ->> 'assignedEmployeeId'
      and item.value ->> 'orgId' = input_organization_id::text;
  if employee_record is null or coalesce(employee_record ->> 'status', '') = 'Archyvuotas' then
    raise exception 'Assigned employee is not active in this organization';
  end if;

  if actor_role = 'employee' then
    if actor_employee_id is distinct from (entry_record ->> 'assignedEmployeeId') then
      raise exception 'This incident entry is assigned to another employee';
    end if;
    if coalesce(jsonb_typeof(entry_record -> 'managerSignature'), 'null') <> 'object' then
      raise exception 'Manager or DSS signature is required before employee signing';
    end if;
    if jsonb_typeof(entry_record -> 'employeeSignature') = 'object' then
      raise exception 'This incident entry is already signed by the employee';
    end if;
    signature_role := 'Darbuotojas';
    signature_key := 'employeeSignature';
    actor_name := employee_record ->> 'name';
  else
    if jsonb_typeof(entry_record -> 'managerSignature') = 'object'
      or jsonb_typeof(entry_record -> 'employeeSignature') = 'object' then
      raise exception 'This incident entry can no longer be changed or signed';
    end if;
    signature_role := case when actor_role = 'manager' then 'Vadovas' else 'DSS specialistas' end;
    signature_key := 'managerSignature';
    select nullif(profile.full_name, '')
      into actor_name
      from public.profiles as profile
      where profile.id = auth.uid();
    actor_name := coalesce(
      actor_name,
      case when actor_role = 'manager' then organization_record ->> 'manager' else 'DSS specialistas' end
    );
  end if;

  signature_record := jsonb_build_object(
    'id', signature_id,
    'orgId', input_organization_id,
    'employeeId', entry_record ->> 'assignedEmployeeId',
    'contractNumber', coalesce(employee_record ->> 'contractNumber', ''),
    'resourceId', 'res-accident-incident-journal',
    'incidentEntryId', input_entry_id,
    'signer', actor_name,
    'role', signature_role,
    'signatureMethod', 'PIN',
    'signedAt', signature_time,
    'ip', private.request_client_ip(),
    'signaturePath', input_signature_path
  );

  updated_entry := entry_record || jsonb_build_object(
    signature_key,
    jsonb_build_object(
      'id', signature_id,
      'signer', actor_name,
      'role', signature_role,
      'signedAt', signature_time,
      'ip', private.request_client_ip(),
      'signaturePath', input_signature_path
    )
  );
  if signature_key = 'managerSignature' then
    updated_entry := updated_entry || jsonb_build_object(
      'recorderName', actor_name,
      'recorderPosition', case when signature_role = 'Vadovas' then 'Įmonės vadovas' else 'DSS specialistas' end
    );
  end if;

  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = input_entry_id then updated_entry else item.value end
    order by item.ordinality
  ), '[]'::jsonb)
    into updated_entries
    from jsonb_array_elements(coalesce(resource_setting -> 'incidentEntries', '[]'::jsonb))
      with ordinality as item(value, ordinality);

  resource_setting := jsonb_set(resource_setting, '{incidentEntries}', updated_entries, true);
  resource_settings := jsonb_set(resource_settings, '{res-accident-incident-journal}', resource_setting, true);
  updated_organization := jsonb_set(organization_record, '{resourceSettings}', resource_settings, true);
  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = input_organization_id::text then updated_organization else item.value end
    order by item.ordinality
  ), '[]'::jsonb)
    into updated_organizations
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb))
      with ordinality as item(value, ordinality);

  update public.organization_data
    set data = jsonb_set(
      jsonb_set(
        workspace,
        '{organizations}',
        updated_organizations,
        true
      ),
      '{signatures}',
      coalesce(workspace -> 'signatures', '[]'::jsonb) || jsonb_build_array(signature_record),
      true
    ),
    updated_by = auth.uid(),
    updated_at = now()
    where organization_data.organization_id = input_organization_id;

  return jsonb_build_object('entry', updated_entry, 'signature', signature_record);
end;
$$;

create or replace function private.preserve_accident_journal_signatures()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_organization jsonb;
  new_organization jsonb;
  old_entry jsonb;
  new_entry jsonb;
  merged_entry jsonb;
  old_signature jsonb;
  has_existing_signature boolean;
  organization_has_signed_entries boolean;
  new_entries jsonb;
  new_organizations jsonb := coalesce(new.data -> 'organizations', '[]'::jsonb);
  resource_settings jsonb;
  resource_setting jsonb;
  incident_entry_ids text[] := array[]::text[];
  signatures jsonb := coalesce(new.data -> 'signatures', '[]'::jsonb);
begin
  for old_organization in
    select item.value from jsonb_array_elements(coalesce(old.data -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value -> 'resourceSettings' -> 'res-accident-incident-journal' -> 'incidentEntries' is not null
  loop
    organization_has_signed_entries := false;
    select item.value into new_organization
      from jsonb_array_elements(new_organizations) as item(value)
      where item.value ->> 'id' = old_organization ->> 'id';
    if new_organization is null then
      continue;
    end if;

    resource_settings := coalesce(new_organization -> 'resourceSettings', '{}'::jsonb);
    resource_setting := coalesce(resource_settings -> 'res-accident-incident-journal', '{}'::jsonb);
    new_entries := coalesce(resource_setting -> 'incidentEntries', '[]'::jsonb);

    for old_entry in
      select item.value
        from jsonb_array_elements(coalesce(
          old_organization -> 'resourceSettings' -> 'res-accident-incident-journal' -> 'incidentEntries',
          '[]'::jsonb
        )) as item(value)
      where jsonb_typeof(item.value -> 'managerSignature') = 'object'
        or jsonb_typeof(item.value -> 'employeeSignature') = 'object'
    loop
      organization_has_signed_entries := true;
      incident_entry_ids := array_append(incident_entry_ids, old_entry ->> 'id');
      select item.value into new_entry
        from jsonb_array_elements(new_entries) as item(value)
        where item.value ->> 'id' = old_entry ->> 'id';

      if new_entry is null then
        new_entries := new_entries || jsonb_build_array(old_entry);
      else
        merged_entry := old_entry;
        if coalesce(jsonb_typeof(old_entry -> 'employeeSignature'), 'null') <> 'object'
          and jsonb_typeof(new_entry -> 'employeeSignature') = 'object' then
          merged_entry := merged_entry || jsonb_build_object('employeeSignature', new_entry -> 'employeeSignature');
        end if;
        select coalesce(jsonb_agg(
          case when item.value ->> 'id' = old_entry ->> 'id' then merged_entry else item.value end
          order by item.ordinality
        ), '[]'::jsonb)
          into new_entries
          from jsonb_array_elements(new_entries) with ordinality as item(value, ordinality);
      end if;
    end loop;

    if organization_has_signed_entries then
      resource_setting := jsonb_set(resource_setting, '{incidentEntries}', new_entries, true);
      resource_settings := jsonb_set(resource_settings, '{res-accident-incident-journal}', resource_setting, true);
      new_organization := jsonb_set(new_organization, '{resourceSettings}', resource_settings, true);
      select coalesce(jsonb_agg(
        case when item.value ->> 'id' = new_organization ->> 'id' then new_organization else item.value end
        order by item.ordinality
      ), '[]'::jsonb)
        into new_organizations
        from jsonb_array_elements(new_organizations) with ordinality as item(value, ordinality);
    end if;
  end loop;

  if cardinality(incident_entry_ids) > 0 then
    for old_signature in
      select item.value
        from jsonb_array_elements(coalesce(old.data -> 'signatures', '[]'::jsonb)) as item(value)
      where item.value ->> 'incidentEntryId' = any(incident_entry_ids)
    loop
      select exists (
        select 1 from jsonb_array_elements(signatures) as item(value)
        where item.value ->> 'id' = old_signature ->> 'id'
      ) into has_existing_signature;
      if has_existing_signature then
        select coalesce(jsonb_agg(
          case when item.value ->> 'id' = old_signature ->> 'id' then old_signature else item.value end
        ), '[]'::jsonb)
          into signatures
          from jsonb_array_elements(signatures) as item(value);
      else
        signatures := signatures || jsonb_build_array(old_signature);
      end if;
    end loop;
    new.data := jsonb_set(new.data, '{organizations}', new_organizations, true);
    new.data := jsonb_set(new.data, '{signatures}', signatures, true);
  end if;

  return new;
end;
$$;

drop trigger if exists preserve_accident_journal_signatures on public.organization_data;
create trigger preserve_accident_journal_signatures
  before update of data on public.organization_data
  for each row execute function private.preserve_accident_journal_signatures();

revoke all on function private.preserve_accident_journal_signatures() from public, anon, authenticated;
revoke all on function public.get_employee_accident_journal_tasks(uuid) from public, anon;
revoke all on function public.get_accident_journal_entries(uuid) from public, anon;
revoke all on function public.sign_accident_journal_entry(uuid, text, text, text) from public, anon;
grant execute on function public.get_employee_accident_journal_tasks(uuid) to authenticated;
grant execute on function public.get_accident_journal_entries(uuid) to authenticated;
grant execute on function public.sign_accident_journal_entry(uuid, text, text, text) to authenticated;
