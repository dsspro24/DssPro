update public.creator_workspace_data
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{resources}',
  coalesce(data -> 'resources', '[]'::jsonb) || case
    when exists (
      select 1
      from jsonb_array_elements(coalesce(data -> 'resources', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = 'res-first-aid-kit-inspection-journal'
    ) then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'id', 'res-first-aid-kit-inspection-journal',
      'title', 'Pirmosios pagalbos rinkinio (vaistinėlės) patikros ir papildymo žurnalas',
      'type', 'Žurnalas',
      'category', 'Pirmoji pagalba',
      'duration', '15 įrašų',
      'templateKind', 'first-aid-kit-inspection-journal',
      'adminOnly', true,
      'defaultForOrganizations', true,
      'requiredSigners', '[]'::jsonb,
      'defaultSettings', jsonb_build_object(
        'rowCount', 15,
        'defaultLocation', '',
        'defaultInspectorEmployeeId', '',
        'inspectionEntries', '[]'::jsonb
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

create or replace function public.get_employee_first_aid_kit_inspection_tasks(input_organization_id uuid)
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
      organization_record -> 'resourceSettings' -> 'res-first-aid-kit-inspection-journal' -> 'inspectionEntries',
      '[]'::jsonb
    )) with ordinality as entry(value, ordinality)
    where entry.value ->> 'inspectorEmployeeId' = employee_record_id
      and coalesce(jsonb_typeof(entry.value -> 'signature'), 'null') <> 'object';
  return tasks;
end;
$$;

create or replace function public.get_first_aid_kit_inspection_journal_entries(input_organization_id uuid)
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
    organization_record -> 'resourceSettings' -> 'res-first-aid-kit-inspection-journal' -> 'inspectionEntries',
    '[]'::jsonb
  );
end;
$$;

create or replace function public.sign_first_aid_kit_inspection_journal_entry(
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
  actor_employee_id text;
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
  if coalesce(input_entry_id, '') = '' or length(input_entry_id) > 100 then
    raise exception 'First-aid inspection entry id is invalid';
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
  resource_setting := coalesce(resource_settings -> 'res-first-aid-kit-inspection-journal', '{}'::jsonb);
  select item.value
    into entry_record
    from jsonb_array_elements(coalesce(resource_setting -> 'inspectionEntries', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_entry_id;
  if entry_record is null then
    raise exception 'First-aid inspection entry was not found';
  end if;
  if entry_record ->> 'inspectorEmployeeId' is distinct from actor_employee_id
    or jsonb_typeof(entry_record -> 'signature') = 'object' then
    raise exception 'This employee cannot sign the first-aid inspection entry';
  end if;

  select item.value
    into employee_record
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = actor_employee_id
      and item.value ->> 'orgId' = input_organization_id::text
      and coalesce(item.value ->> 'status', '') not in ('archived', 'Archyvuotas');
  if employee_record is null then
    raise exception 'Active assigned employee was not found';
  end if;

  signature_record := jsonb_build_object(
    'id', signature_id,
    'orgId', input_organization_id,
    'employeeId', actor_employee_id,
    'contractNumber', coalesce(employee_record ->> 'contractNumber', ''),
    'resourceId', 'res-first-aid-kit-inspection-journal',
    'firstAidInspectionEntryId', input_entry_id,
    'signer', coalesce(nullif(employee_record ->> 'name', ''), 'Darbuotojas'),
    'role', 'Darbuotojas',
    'signatureMethod', 'PIN',
    'signedAt', signature_time,
    'ip', client_ip,
    'signaturePath', input_signature_path
  );
  updated_entry := entry_record || jsonb_build_object(
    'signature',
    jsonb_build_object(
      'id', signature_id,
      'signer', coalesce(nullif(employee_record ->> 'name', ''), 'Darbuotojas'),
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
    from jsonb_array_elements(coalesce(resource_setting -> 'inspectionEntries', '[]'::jsonb))
      with ordinality as item(value, ordinality);

  resource_setting := jsonb_set(resource_setting, '{inspectionEntries}', updated_entries, true);
  resource_settings := jsonb_set(resource_settings, '{res-first-aid-kit-inspection-journal}', resource_setting, true);
  updated_organization := jsonb_set(organization_record, '{resourceSettings}', resource_settings, true);
  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = input_organization_id::text then updated_organization else item.value end
    order by item.ordinality
  ), '[]'::jsonb)
    into updated_organizations
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb))
      with ordinality as item(value, ordinality);

  perform set_config('app.allow_first_aid_kit_inspection_signing', 'true', true);
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

create or replace function private.preserve_first_aid_kit_inspection_signatures()
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
  allow_signature boolean := coalesce(current_setting('app.allow_first_aid_kit_inspection_signing', true), '') = 'true';
begin
  for old_organization in
    select item.value
    from jsonb_array_elements(coalesce(old.data -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value -> 'resourceSettings' -> 'res-first-aid-kit-inspection-journal' -> 'inspectionEntries' is not null
  loop
    select item.value
      into new_organization
      from jsonb_array_elements(new_organizations) as item(value)
      where item.value ->> 'id' = old_organization ->> 'id';
    if new_organization is null then
      continue;
    end if;

    old_entries := coalesce(
      old_organization -> 'resourceSettings' -> 'res-first-aid-kit-inspection-journal' -> 'inspectionEntries',
      '[]'::jsonb
    );
    resource_settings := coalesce(new_organization -> 'resourceSettings', '{}'::jsonb);
    resource_setting := coalesce(resource_settings -> 'res-first-aid-kit-inspection-journal', '{}'::jsonb);
    new_entries := coalesce(resource_setting -> 'inspectionEntries', '[]'::jsonb);

    for old_entry in select item.value from jsonb_array_elements(old_entries) as item(value)
    loop
      if coalesce(jsonb_typeof(old_entry -> 'signature'), 'null') <> 'object' then
        continue;
      end if;
      select item.value
        into new_entry
        from jsonb_array_elements(new_entries) as item(value)
        where item.value ->> 'id' = old_entry ->> 'id';
      if new_entry is null then
        new_entries := new_entries || jsonb_build_array(old_entry);
      elsif allow_signature then
        new_entry := old_entry || jsonb_build_object(
          'signature', coalesce(new_entry -> 'signature', old_entry -> 'signature')
        );
        select coalesce(jsonb_agg(
          case when item.value ->> 'id' = old_entry ->> 'id' then new_entry else item.value end
          order by item.ordinality
        ), '[]'::jsonb)
          into new_entries
          from jsonb_array_elements(new_entries) with ordinality as item(value, ordinality);
      else
        select coalesce(jsonb_agg(
          case when item.value ->> 'id' = old_entry ->> 'id' then old_entry else item.value end
          order by item.ordinality
        ), '[]'::jsonb)
          into new_entries
          from jsonb_array_elements(new_entries) with ordinality as item(value, ordinality);
      end if;

      for old_signature in
        select item.value
        from jsonb_array_elements(coalesce(old.data -> 'signatures', '[]'::jsonb)) as item(value)
        where item.value ->> 'resourceId' = 'res-first-aid-kit-inspection-journal'
          and item.value ->> 'orgId' = old_organization ->> 'id'
          and item.value ->> 'firstAidInspectionEntryId' = old_entry ->> 'id'
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
        where jsonb_typeof(item.value -> 'signature') = 'object'
      loop
        select item.value
          into old_entry
          from jsonb_array_elements(old_entries) as item(value)
          where item.value ->> 'id' = new_entry ->> 'id';
        if coalesce(jsonb_typeof(old_entry -> 'signature'), 'null') <> 'object' then
          new_entry := new_entry - 'signature';
          select coalesce(jsonb_agg(
            case when item.value ->> 'id' = new_entry ->> 'id' then new_entry else item.value end
            order by item.ordinality
          ), '[]'::jsonb)
            into new_entries
            from jsonb_array_elements(new_entries) with ordinality as item(value, ordinality);
        end if;
        old_entry := null;
      end loop;
      select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
        into signatures
        from jsonb_array_elements(signatures) with ordinality as item(value, ordinality)
        where coalesce(item.value ->> 'resourceId', '') <> 'res-first-aid-kit-inspection-journal'
          or exists (
            select 1
            from jsonb_array_elements(coalesce(old.data -> 'signatures', '[]'::jsonb)) as old_item(value)
            where old_item.value ->> 'id' = item.value ->> 'id'
              and old_item.value ->> 'resourceId' = 'res-first-aid-kit-inspection-journal'
          );
    end if;

    resource_setting := jsonb_set(resource_setting, '{inspectionEntries}', new_entries, true);
    resource_settings := jsonb_set(resource_settings, '{res-first-aid-kit-inspection-journal}', resource_setting, true);
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

drop trigger if exists preserve_first_aid_kit_inspection_signatures on public.organization_data;
create trigger preserve_first_aid_kit_inspection_signatures
before update of data on public.organization_data
for each row execute function private.preserve_first_aid_kit_inspection_signatures();

revoke all on function private.preserve_first_aid_kit_inspection_signatures() from public, anon, authenticated;
revoke all on function public.get_employee_first_aid_kit_inspection_tasks(uuid) from public, anon;
revoke all on function public.get_first_aid_kit_inspection_journal_entries(uuid) from public, anon;
revoke all on function public.sign_first_aid_kit_inspection_journal_entry(uuid, text, text, text) from public, anon;
grant execute on function public.get_employee_first_aid_kit_inspection_tasks(uuid) to authenticated;
grant execute on function public.get_first_aid_kit_inspection_journal_entries(uuid) to authenticated;
grant execute on function public.sign_first_aid_kit_inspection_journal_entry(uuid, text, text, text) to authenticated;
