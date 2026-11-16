update public.creator_workspace_data
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{resources}',
  coalesce(data -> 'resources', '[]'::jsonb) || case
    when exists (
      select 1
      from jsonb_array_elements(coalesce(data -> 'resources', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = 'res-fire-automation-maintenance-journal'
    ) then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'id', 'res-fire-automation-maintenance-journal',
      'title', 'Gaisrinės automatikos įrenginio techninės priežiūros ir remonto apskaitos žurnalas',
      'type', 'Žurnalas',
      'category', 'Priešgaisrinė sauga',
      'duration', '15 įrašų',
      'templateKind', 'fire-automation-maintenance-journal',
      'adminOnly', true,
      'defaultForOrganizations', true,
      'requiredSigners', '[]'::jsonb,
      'defaultSettings', jsonb_build_object(
        'rowCount', 15,
        'documentNumber', '',
        'equipmentName', '',
        'equipmentIdentifier', '',
        'equipmentLocation', '',
        'allowExternalPerformer', true,
        'signatureFieldRoles', jsonb_build_object('performer', 'Darbuotojas', 'responsible', 'Darbuotojas'),
        'maintenanceEntries', '[]'::jsonb
      ),
      'isProtocolTemplate', false
    ))
  end,
  true
),
updated_at = now()
where id = true;

do $$
begin
  execute 'alter table public.organization_data disable trigger guard_workspace_subscription_access';
  perform public.sync_creator_resource_defaults();
  execute 'alter table public.organization_data enable trigger guard_workspace_subscription_access';
end;
$$;

create or replace function public.get_employee_fire_automation_maintenance_tasks(input_organization_id uuid)
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

  select coalesce(jsonb_agg(task.value order by task.ordinality, task.stage), '[]'::jsonb)
    into tasks
    from (
      select
        entry.value || jsonb_build_object(
          'maintenanceStage', 'performer',
          'organizationId', input_organization_id,
          'organizationName', coalesce(organization_record ->> 'name', ''),
          'organizationCode', coalesce(organization_record ->> 'companyCode', '')
        ) as value,
        entry.ordinality,
        'performer' as stage
      from jsonb_array_elements(coalesce(
        organization_record -> 'resourceSettings' -> 'res-fire-automation-maintenance-journal' -> 'maintenanceEntries',
        '[]'::jsonb
      )) with ordinality as entry(value, ordinality)
      where entry.value ->> 'performerType' = 'employee'
        and entry.value ->> 'performerEmployeeId' = employee_record_id
        and coalesce(jsonb_typeof(entry.value -> 'performerSignature'), 'null') <> 'object'

      union all

      select
        entry.value || jsonb_build_object(
          'maintenanceStage', 'responsible',
          'organizationId', input_organization_id,
          'organizationName', coalesce(organization_record ->> 'name', ''),
          'organizationCode', coalesce(organization_record ->> 'companyCode', '')
        ) as value,
        entry.ordinality,
        'responsible' as stage
      from jsonb_array_elements(coalesce(
        organization_record -> 'resourceSettings' -> 'res-fire-automation-maintenance-journal' -> 'maintenanceEntries',
        '[]'::jsonb
      )) with ordinality as entry(value, ordinality)
      where entry.value ->> 'responsibleEmployeeId' = employee_record_id
        and jsonb_typeof(entry.value -> 'performerSignature') = 'object'
        and coalesce(jsonb_typeof(entry.value -> 'responsibleSignature'), 'null') <> 'object'
    ) as task;
  return tasks;
end;
$$;

create or replace function public.get_fire_automation_maintenance_journal_entries(input_organization_id uuid)
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
    organization_record -> 'resourceSettings' -> 'res-fire-automation-maintenance-journal' -> 'maintenanceEntries',
    '[]'::jsonb
  );
end;
$$;

create or replace function public.sign_fire_automation_maintenance_journal_entry(
  input_organization_id uuid,
  input_entry_id text,
  input_stage text,
  input_pin text,
  input_signature_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_employee_id text;
  actor_name text;
  workspace jsonb;
  organization_record jsonb;
  employee_record jsonb;
  resource_settings jsonb;
  resource_setting jsonb;
  entry_record jsonb;
  updated_entry jsonb;
  updated_entries jsonb;
  updated_organization jsonb;
  updated_organizations jsonb;
  signature_record jsonb;
  signature_key text;
  signature_time timestamptz := now();
  signature_id text := 'sig-' || extensions.gen_random_uuid()::text;
  client_ip text := private.request_client_ip();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(input_entry_id, '') = '' or length(input_entry_id) > 100 then
    raise exception 'Maintenance entry id is invalid';
  end if;
  if coalesce(input_stage, '') not in ('performer', 'responsible') then
    raise exception 'Maintenance signing stage is invalid';
  end if;
  if coalesce(input_signature_path, '') !~ ('^' || input_organization_id::text || '/[a-f0-9-]{36}\.svg$') then
    raise exception 'Signature asset path is invalid';
  end if;

  select membership.employee_id
    into actor_employee_id
    from public.organization_memberships as membership
    where membership.organization_id = input_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and membership.employee_id is not null
    limit 1;
  if not found then
    raise exception 'Employee organization access required';
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
  resource_setting := coalesce(resource_settings -> 'res-fire-automation-maintenance-journal', '{}'::jsonb);
  select item.value
    into entry_record
    from jsonb_array_elements(coalesce(resource_setting -> 'maintenanceEntries', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_entry_id;
  if entry_record is null then
    raise exception 'Maintenance entry was not found';
  end if;
  select item.value
    into employee_record
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = actor_employee_id
      and item.value ->> 'orgId' = input_organization_id::text;
  if employee_record is null then
    raise exception 'Employee record was not found';
  end if;

  if input_stage = 'performer' then
    if entry_record ->> 'performerType' is distinct from 'employee'
      or entry_record ->> 'performerEmployeeId' is distinct from actor_employee_id
      or jsonb_typeof(entry_record -> 'performerSignature') = 'object' then
      raise exception 'This employee cannot sign the maintenance performer field';
    end if;
    signature_key := 'performerSignature';
  else
    if entry_record ->> 'responsibleEmployeeId' is distinct from actor_employee_id
      or coalesce(jsonb_typeof(entry_record -> 'performerSignature'), 'null') <> 'object'
      or jsonb_typeof(entry_record -> 'responsibleSignature') = 'object' then
      raise exception 'This employee cannot sign the maintenance responsible field';
    end if;
    signature_key := 'responsibleSignature';
  end if;
  actor_name := coalesce(nullif(employee_record ->> 'name', ''), 'Darbuotojas');
  signature_record := jsonb_build_object(
    'id', signature_id,
    'orgId', input_organization_id,
    'employeeId', actor_employee_id,
    'contractNumber', coalesce(employee_record ->> 'contractNumber', ''),
    'resourceId', 'res-fire-automation-maintenance-journal',
    'maintenanceEntryId', input_entry_id,
    'signer', actor_name,
    'role', 'Darbuotojas',
    'signatureMethod', 'PIN',
    'signedAt', signature_time,
    'ip', client_ip,
    'signaturePath', input_signature_path
  );
  updated_entry := entry_record || jsonb_build_object(
    signature_key,
    jsonb_build_object(
      'id', signature_id,
      'signer', actor_name,
      'role', 'Darbuotojas',
      'signatureMethod', 'PIN',
      'signedAt', signature_time,
      'ip', client_ip,
      'signaturePath', input_signature_path
    )
  );
  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = input_entry_id then updated_entry else item.value end
    order by item.ordinality
  ), '[]'::jsonb)
    into updated_entries
    from jsonb_array_elements(coalesce(resource_setting -> 'maintenanceEntries', '[]'::jsonb))
      with ordinality as item(value, ordinality);
  resource_setting := jsonb_set(resource_setting, '{maintenanceEntries}', updated_entries, true);
  resource_settings := jsonb_set(resource_settings, '{res-fire-automation-maintenance-journal}', resource_setting, true);
  updated_organization := jsonb_set(organization_record, '{resourceSettings}', resource_settings, true);
  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = input_organization_id::text then updated_organization else item.value end
    order by item.ordinality
  ), '[]'::jsonb)
    into updated_organizations
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb))
      with ordinality as item(value, ordinality);
  perform set_config('app.allow_fire_automation_maintenance_signing', 'true', true);
  update public.organization_data
    set data = jsonb_set(
      jsonb_set(workspace, '{organizations}', updated_organizations, true),
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

create or replace function public.record_external_fire_automation_maintenance_signature(
  input_organization_id uuid,
  input_entry_id text,
  input_signer_name text,
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
  resource_settings jsonb;
  resource_setting jsonb;
  entry_record jsonb;
  updated_entry jsonb;
  updated_entries jsonb;
  updated_organization jsonb;
  updated_organizations jsonb;
  signature_record jsonb;
  signature_time timestamptz := now();
  signature_id text := 'sig-' || extensions.gen_random_uuid()::text;
  client_ip text := private.request_client_ip();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(input_entry_id, '') = '' or length(input_entry_id) > 100
    or coalesce(trim(input_signer_name), '') = '' or length(trim(input_signer_name)) > 150 then
    raise exception 'External performer details are invalid';
  end if;
  if coalesce(input_signature_path, '') !~ ('^' || input_organization_id::text || '/[a-f0-9-]{36}\.svg$') then
    raise exception 'Signature asset path is invalid';
  end if;
  select membership.role
    into actor_role
    from public.organization_memberships as membership
    where membership.organization_id = input_organization_id
      and membership.user_id = (select auth.uid())
    limit 1;
  if not found or actor_role not in ('manager', 'dss_specialist') then
    raise exception 'Organization manager or assigned DSS specialist access required';
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
  resource_setting := coalesce(resource_settings -> 'res-fire-automation-maintenance-journal', '{}'::jsonb);
  if coalesce((resource_setting ->> 'allowExternalPerformer')::boolean, true) is not true then
    raise exception 'External performer signing is disabled for this journal';
  end if;
  select item.value
    into entry_record
    from jsonb_array_elements(coalesce(resource_setting -> 'maintenanceEntries', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_entry_id;
  if entry_record is null
    or entry_record ->> 'performerType' is distinct from 'external'
    or coalesce(entry_record ->> 'responsibleEmployeeId', '') = ''
    or jsonb_typeof(entry_record -> 'performerSignature') = 'object' then
    raise exception 'External performer field is not available for signing';
  end if;
  select item.value
    into employee_record
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = entry_record ->> 'responsibleEmployeeId'
      and item.value ->> 'orgId' = input_organization_id::text;
  if employee_record is null then
    raise exception 'Responsible employee was not found';
  end if;
  select nullif(profile.full_name, '')
    into actor_name
    from public.profiles as profile
    where profile.id = auth.uid();
  actor_name := coalesce(
    actor_name,
    case when actor_role = 'manager' then organization_record ->> 'manager' else 'DSS specialistas' end
  );
  signature_record := jsonb_build_object(
    'id', signature_id,
    'orgId', input_organization_id,
    'employeeId', entry_record ->> 'responsibleEmployeeId',
    'contractNumber', coalesce(employee_record ->> 'contractNumber', ''),
    'resourceId', 'res-fire-automation-maintenance-journal',
    'maintenanceEntryId', input_entry_id,
    'signer', trim(input_signer_name),
    'role', 'Išorinis rangovas',
    'signatureMethod', 'Onsite · tapatybė nepatvirtinta',
    'identityVerified', false,
    'recordedBy', actor_name,
    'signedAt', signature_time,
    'ip', client_ip,
    'signaturePath', input_signature_path
  );
  updated_entry := entry_record || jsonb_build_object(
    'externalPerformerName', trim(input_signer_name),
    'performerSignature', jsonb_build_object(
      'id', signature_id,
      'signer', trim(input_signer_name),
      'role', 'Išorinis rangovas',
      'signatureMethod', 'Onsite · tapatybė nepatvirtinta',
      'identityVerified', false,
      'recordedBy', actor_name,
      'signedAt', signature_time,
      'ip', client_ip,
      'signaturePath', input_signature_path
    )
  );
  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = input_entry_id then updated_entry else item.value end
    order by item.ordinality
  ), '[]'::jsonb)
    into updated_entries
    from jsonb_array_elements(coalesce(resource_setting -> 'maintenanceEntries', '[]'::jsonb))
      with ordinality as item(value, ordinality);
  resource_setting := jsonb_set(resource_setting, '{maintenanceEntries}', updated_entries, true);
  resource_settings := jsonb_set(resource_settings, '{res-fire-automation-maintenance-journal}', resource_setting, true);
  updated_organization := jsonb_set(organization_record, '{resourceSettings}', resource_settings, true);
  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = input_organization_id::text then updated_organization else item.value end
    order by item.ordinality
  ), '[]'::jsonb)
    into updated_organizations
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb))
      with ordinality as item(value, ordinality);
  perform set_config('app.allow_fire_automation_maintenance_signing', 'true', true);
  update public.organization_data
    set data = jsonb_set(
      jsonb_set(workspace, '{organizations}', updated_organizations, true),
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

create or replace function private.preserve_fire_automation_maintenance_signatures()
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
  new_organizations jsonb := coalesce(new.data -> 'organizations', '[]'::jsonb);
  old_entries jsonb;
  new_entries jsonb;
  signatures jsonb := coalesce(new.data -> 'signatures', '[]'::jsonb);
  resource_settings jsonb;
  resource_setting jsonb;
  old_signature jsonb;
  has_existing_signature boolean;
  allow_signature boolean := coalesce(current_setting('app.allow_fire_automation_maintenance_signing', true), '') = 'true';
begin
  for old_organization in
    select item.value
    from jsonb_array_elements(coalesce(old.data -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value -> 'resourceSettings' -> 'res-fire-automation-maintenance-journal' -> 'maintenanceEntries' is not null
  loop
    select item.value
      into new_organization
      from jsonb_array_elements(new_organizations) as item(value)
      where item.value ->> 'id' = old_organization ->> 'id';
    if new_organization is null then
      continue;
    end if;
    old_entries := coalesce(
      old_organization -> 'resourceSettings' -> 'res-fire-automation-maintenance-journal' -> 'maintenanceEntries',
      '[]'::jsonb
    );
    resource_settings := coalesce(new_organization -> 'resourceSettings', '{}'::jsonb);
    resource_setting := coalesce(resource_settings -> 'res-fire-automation-maintenance-journal', '{}'::jsonb);
    new_entries := coalesce(resource_setting -> 'maintenanceEntries', '[]'::jsonb);

    for old_entry in select item.value from jsonb_array_elements(old_entries) as item(value)
    loop
      if coalesce(jsonb_typeof(old_entry -> 'performerSignature'), 'null') <> 'object'
        and coalesce(jsonb_typeof(old_entry -> 'responsibleSignature'), 'null') <> 'object' then
        continue;
      end if;
      select item.value
        into new_entry
        from jsonb_array_elements(new_entries) as item(value)
        where item.value ->> 'id' = old_entry ->> 'id';
      if new_entry is null then
        new_entries := new_entries || jsonb_build_array(old_entry);
      else
        if allow_signature then
          new_entry := old_entry || jsonb_build_object(
            'performerSignature', coalesce(new_entry -> 'performerSignature', old_entry -> 'performerSignature'),
            'responsibleSignature', coalesce(new_entry -> 'responsibleSignature', old_entry -> 'responsibleSignature')
          );
        else
          new_entry := old_entry;
        end if;
        select coalesce(jsonb_agg(
          case when item.value ->> 'id' = old_entry ->> 'id' then new_entry else item.value end
          order by item.ordinality
        ), '[]'::jsonb)
          into new_entries
          from jsonb_array_elements(new_entries) with ordinality as item(value, ordinality);
      end if;
      for old_signature in
        select item.value
        from jsonb_array_elements(coalesce(old.data -> 'signatures', '[]'::jsonb)) as item(value)
        where item.value ->> 'resourceId' = 'res-fire-automation-maintenance-journal'
          and item.value ->> 'orgId' = old_organization ->> 'id'
          and item.value ->> 'maintenanceEntryId' = old_entry ->> 'id'
      loop
        select exists (
          select 1 from jsonb_array_elements(signatures) as item(value)
          where item.value ->> 'id' = old_signature ->> 'id'
        ) into has_existing_signature;
        if not has_existing_signature then
          signatures := signatures || jsonb_build_array(old_signature);
        end if;
      end loop;
      new_entry := null;
    end loop;
    if not allow_signature then
      for new_entry in
        select item.value
        from jsonb_array_elements(new_entries) as item(value)
        where jsonb_typeof(item.value -> 'performerSignature') = 'object'
          or jsonb_typeof(item.value -> 'responsibleSignature') = 'object'
      loop
        select item.value
          into old_entry
          from jsonb_array_elements(old_entries) as item(value)
          where item.value ->> 'id' = new_entry ->> 'id';
        if coalesce(jsonb_typeof(old_entry -> 'performerSignature'), 'null') <> 'object'
          and coalesce(jsonb_typeof(old_entry -> 'responsibleSignature'), 'null') <> 'object' then
          new_entry := new_entry - 'performerSignature' - 'responsibleSignature';
          select coalesce(jsonb_agg(
            case when item.value ->> 'id' = new_entry ->> 'id' then new_entry else item.value end
            order by item.ordinality
          ), '[]'::jsonb)
            into new_entries
            from jsonb_array_elements(new_entries) with ordinality as item(value, ordinality);
        end if;
        old_entry := null;
      end loop;
    end if;
    if not allow_signature then
      select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
        into signatures
        from jsonb_array_elements(signatures) with ordinality as item(value, ordinality)
        where coalesce(item.value ->> 'resourceId', '') <> 'res-fire-automation-maintenance-journal'
          or exists (
            select 1
            from jsonb_array_elements(coalesce(old.data -> 'signatures', '[]'::jsonb)) as old_item(value)
            where old_item.value ->> 'id' = item.value ->> 'id'
              and old_item.value ->> 'resourceId' = 'res-fire-automation-maintenance-journal'
          );
    end if;
    resource_setting := jsonb_set(resource_setting, '{maintenanceEntries}', new_entries, true);
    resource_settings := jsonb_set(resource_settings, '{res-fire-automation-maintenance-journal}', resource_setting, true);
    new_organization := jsonb_set(new_organization, '{resourceSettings}', resource_settings, true);
    select coalesce(jsonb_agg(
      case when item.value ->> 'id' = old_organization ->> 'id' then new_organization else item.value end
      order by item.ordinality
    ), '[]'::jsonb)
      into new_organizations
      from jsonb_array_elements(new_organizations) with ordinality as item(value, ordinality);
    new_organization := null;
  end loop;
  new.data := jsonb_set(new.data, '{organizations}', new_organizations, true);
  new.data := jsonb_set(new.data, '{signatures}', signatures, true);
  return new;
end;
$$;

drop trigger if exists preserve_fire_automation_maintenance_signatures on public.organization_data;
create trigger preserve_fire_automation_maintenance_signatures
  before update of data on public.organization_data
  for each row execute function private.preserve_fire_automation_maintenance_signatures();

revoke all on function private.preserve_fire_automation_maintenance_signatures() from public, anon, authenticated;
revoke all on function public.get_employee_fire_automation_maintenance_tasks(uuid) from public, anon;
revoke all on function public.get_fire_automation_maintenance_journal_entries(uuid) from public, anon;
revoke all on function public.sign_fire_automation_maintenance_journal_entry(uuid, text, text, text, text) from public, anon;
revoke all on function public.record_external_fire_automation_maintenance_signature(uuid, text, text, text) from public, anon;
grant execute on function public.get_employee_fire_automation_maintenance_tasks(uuid) to authenticated;
grant execute on function public.get_fire_automation_maintenance_journal_entries(uuid) to authenticated;
grant execute on function public.sign_fire_automation_maintenance_journal_entry(uuid, text, text, text, text) to authenticated;
grant execute on function public.record_external_fire_automation_maintenance_signature(uuid, text, text, text) to authenticated;
