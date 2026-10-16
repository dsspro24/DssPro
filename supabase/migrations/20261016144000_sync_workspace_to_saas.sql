create or replace function public.sync_creator_resources_to_saas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resource jsonb;
begin
  for resource in
    select item.value
    from jsonb_array_elements(coalesce(new.data -> 'resources', '[]'::jsonb)) as item(value)
    where coalesce(item.value ->> 'organizationId', '') = ''
  loop
    if coalesce(resource ->> 'id', '') = '' then
      continue;
    end if;

    insert into public.organization_documents (
      document_id, organization_id, document_type, title, category, active, payload, updated_at
    )
    values (
      resource ->> 'id', null, coalesce(resource ->> 'type', 'Dokumentas'),
      coalesce(nullif(resource ->> 'title', ''), resource ->> 'id'),
      coalesce(resource ->> 'category', ''), true, resource, now()
    )
    on conflict (document_id) do update
      set document_type = excluded.document_type,
          title = excluded.title,
          category = excluded.category,
          active = true,
          payload = excluded.payload,
          updated_at = now()
      where organization_documents.organization_id is null;
  end loop;
  return new;
end;
$$;

create trigger sync_creator_resources_to_saas
  after insert or update of data on public.creator_workspace_data
  for each row execute function public.sync_creator_resources_to_saas();

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
  elsif new.data -> 'signatures' is distinct from old.data -> 'signatures' then
    new.data := jsonb_set(new.data, '{signatures}', coalesce(old.data -> 'signatures', '[]'::jsonb), true);
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

create trigger protect_organization_workspace_history
  before insert or update of data on public.organization_data
  for each row execute function public.protect_organization_workspace_history();

create or replace function public.sync_organization_workspace_to_saas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb := new.data;
  organization_record jsonb;
  employee jsonb;
  archived_employee jsonb;
  resource jsonb;
  signature jsonb;
  attempt jsonb;
  batch jsonb;
  subscription jsonb;
  resource_id text;
  plan_code text;
  plan_status text;
  price_cents integer;
  end_date timestamptz;
begin
  select item.value into organization_record
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = new.organization_id::text;
  if organization_record is null then
    return new;
  end if;

  for resource in
    select item.value from jsonb_array_elements(coalesce(workspace -> 'resources', '[]'::jsonb)) as item(value)
  loop
    if coalesce(resource ->> 'id', '') = '' then continue; end if;
    if coalesce(resource ->> 'organizationId', '') = '' then
      insert into public.organization_documents (
        document_id, organization_id, document_type, title, category, active, payload, updated_at
      ) values (
        resource ->> 'id', null, coalesce(resource ->> 'type', 'Dokumentas'),
        coalesce(nullif(resource ->> 'title', ''), resource ->> 'id'),
        coalesce(resource ->> 'category', ''), true, resource, now()
      ) on conflict (document_id) do nothing;
    elsif resource ->> 'organizationId' = new.organization_id::text then
      insert into public.organization_documents (
        document_id, organization_id, document_type, title, category, active, payload, updated_at
      ) values (
        resource ->> 'id', new.organization_id, coalesce(resource ->> 'type', 'Dokumentas'),
        coalesce(nullif(resource ->> 'title', ''), resource ->> 'id'),
        coalesce(resource ->> 'category', ''), true, resource, now()
      ) on conflict (document_id) do update
        set document_type = excluded.document_type,
            title = excluded.title,
            category = excluded.category,
            active = true,
            payload = excluded.payload,
            updated_at = now()
        where organization_documents.organization_id = new.organization_id;
    end if;
  end loop;

  insert into public.organization_resource_access (organization_id, document_id, settings, added_by)
  select new.organization_id, item.value,
         coalesce(organization_record -> 'resourceSettings' -> item.value, '{}'::jsonb), new.updated_by
  from jsonb_array_elements_text(coalesce(organization_record -> 'resources', '[]'::jsonb)) as item(value)
  on conflict (organization_id, document_id) do update set settings = excluded.settings;

  delete from public.organization_resource_access as access
    where access.organization_id = new.organization_id
      and not (coalesce(organization_record -> 'resources', '[]'::jsonb) ? access.document_id);

  for employee in
    select item.value from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
  loop
    if coalesce(employee ->> 'id', '') = '' then continue; end if;
    insert into public.organization_employees (
      employee_id, organization_id, auth_user_id, full_name, email, contract_number, position,
      status, invited_at, medical_certificate_valid_until, sizes, metadata, updated_at
    ) values (
      employee ->> 'id', new.organization_id,
      (select membership.user_id from public.organization_memberships as membership
        where membership.organization_id = new.organization_id and membership.employee_id = employee ->> 'id'
          and membership.role = 'employee' limit 1),
      coalesce(employee ->> 'name', ''), lower(coalesce(employee ->> 'email', '')),
      coalesce(employee ->> 'contractNumber', ''), coalesce(employee ->> 'position', 'Darbuotojas'),
      coalesce(employee ->> 'status', 'Pakviestas'),
      case when coalesce(employee ->> 'invitedAt', '') ~ '^\d{4}-\d{2}-\d{2}' then (employee ->> 'invitedAt')::timestamptz else null end,
      case when coalesce(employee ->> 'medicalCertificateValidUntil', '') ~ '^\d{4}-\d{2}-\d{2}$' then (employee ->> 'medicalCertificateValidUntil')::date else null end,
      coalesce(employee -> 'sizes', '{}'::jsonb), employee - 'pin', now()
    ) on conflict (employee_id) do update
      set auth_user_id = coalesce(excluded.auth_user_id, organization_employees.auth_user_id),
          full_name = excluded.full_name, email = excluded.email,
          contract_number = excluded.contract_number, position = excluded.position,
          status = excluded.status, invited_at = coalesce(organization_employees.invited_at, excluded.invited_at),
          medical_certificate_valid_until = excluded.medical_certificate_valid_until,
          sizes = excluded.sizes, metadata = excluded.metadata, updated_at = now();
  end loop;

  for archived_employee in
    select item.value -> 'employee' from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as item(value)
    where jsonb_typeof(item.value -> 'employee') = 'object'
  loop
    if coalesce(archived_employee ->> 'id', '') = '' then continue; end if;
    insert into public.organization_employees (
      employee_id, organization_id, full_name, email, contract_number, position, status,
      archived_at, sizes, metadata, updated_at
    ) values (
      archived_employee ->> 'id', new.organization_id, coalesce(archived_employee ->> 'name', ''),
      lower(coalesce(archived_employee ->> 'email', '')), coalesce(archived_employee ->> 'contractNumber', ''),
      coalesce(archived_employee ->> 'position', 'Darbuotojas'), 'Archyvuotas', now(),
      coalesce(archived_employee -> 'sizes', '{}'::jsonb), archived_employee - 'pin', now()
    ) on conflict (employee_id) do update
      set status = 'Archyvuotas', archived_at = coalesce(organization_employees.archived_at, now()),
          metadata = excluded.metadata, updated_at = now();
  end loop;

  for employee in
    select item.value from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    union all
    select item.value -> 'employee' from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as item(value)
    where jsonb_typeof(item.value -> 'employee') = 'object'
  loop
    for resource_id in
      select item.value from jsonb_array_elements_text(coalesce(employee -> 'resourceIds', '[]'::jsonb)) as item(value)
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
  end loop;

  delete from public.employee_document_assignments as assignment
    where assignment.organization_id = new.organization_id
      and not exists (
        select 1
        from (
          select item.value as employee from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
          union all
          select item.value -> 'employee' from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as item(value)
          where jsonb_typeof(item.value -> 'employee') = 'object'
        ) as employee_record
        cross join lateral jsonb_array_elements_text(coalesce(employee_record.employee -> 'resourceIds', '[]'::jsonb)) as resource(value)
        where employee_record.employee ->> 'id' = assignment.employee_id and resource.value = assignment.document_id
      );

  for signature in
    select item.value from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
  loop
    if coalesce(signature ->> 'id', '') = '' or coalesce(signature ->> 'employeeId', '') = '' or coalesce(signature ->> 'resourceId', '') = '' then continue; end if;
    insert into public.document_signatures (
      signature_id, organization_id, employee_id, document_id, signer_user_id, signer_name,
      signer_role, signature_method, signed_at, valid_until, ip_address, metadata
    ) values (
      signature ->> 'id', new.organization_id, signature ->> 'employeeId', signature ->> 'resourceId',
      auth.uid(), coalesce(signature ->> 'signer', 'Nenurodytas'),
      case when signature ->> 'role' in ('Darbuotojas', 'Vadovas', 'DSS specialistas', 'Komisijos narys') then signature ->> 'role' else 'Darbuotojas' end,
      'PIN', case when coalesce(signature ->> 'signedAt', '') = '' then now() else (signature ->> 'signedAt')::timestamptz end,
      case when coalesce(signature ->> 'validUntil', '') = '' then null else (signature ->> 'validUntil')::timestamptz end,
      nullif(signature ->> 'ip', ''),
      signature - 'id' - 'orgId' - 'employeeId' - 'resourceId' - 'signer' - 'role' - 'signatureMethod' - 'signedAt' - 'validUntil' - 'ip'
    ) on conflict (signature_id) do nothing;
  end loop;

  for employee in
    select item.value from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    union all
    select item.value -> 'employee' from jsonb_array_elements(coalesce(workspace -> 'archivedEmployees', '[]'::jsonb)) as item(value)
    where jsonb_typeof(item.value -> 'employee') = 'object'
  loop
    for attempt in
      select item.value from jsonb_array_elements(coalesce(employee -> 'testResults', '[]'::jsonb)) as item(value)
    loop
      if coalesce(attempt ->> 'resourceId', '') = '' or coalesce(attempt ->> 'completedAt', '') = '' then continue; end if;
      insert into public.employee_test_attempts (
        attempt_id, organization_id, employee_id, document_id, score, passed, completed_at, metadata
      ) values (
        (employee ->> 'id') || ':' || (attempt ->> 'resourceId') || ':' || (attempt ->> 'completedAt'),
        new.organization_id, employee ->> 'id', attempt ->> 'resourceId',
        greatest(0, least(100, coalesce((attempt ->> 'score')::integer, 0))),
        coalesce((attempt ->> 'passed')::boolean, false), (attempt ->> 'completedAt')::timestamptz,
        attempt - 'resourceId' - 'score' - 'passed' - 'completedAt'
      ) on conflict (attempt_id) do nothing;
    end loop;
  end loop;

  for batch in
    select item.value from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as item(value)
  loop
    if coalesce(batch ->> 'id', '') = '' or coalesce(batch ->> 'resourceId', '') = '' then continue; end if;
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
      set document_id = excluded.document_id, cadence = excluded.cadence,
          period_start = excluded.period_start, period_end = excluded.period_end,
          protocol_date = excluded.protocol_date, batch_number = excluded.batch_number,
          payload = excluded.payload, updated_at = now();
  end loop;

  delete from public.protocol_batch_employees where organization_id = new.organization_id;
  insert into public.protocol_batch_employees (organization_id, batch_id, employee_id)
  select new.organization_id, batch.value ->> 'id', person.value
  from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as batch(value)
  cross join lateral jsonb_array_elements_text(coalesce(batch.value -> 'employeeIds', '[]'::jsonb)) as person(value)
  on conflict (batch_id, employee_id) do nothing;

  for subscription in
    select item.value from jsonb_array_elements(coalesce(workspace -> 'subscriptions', '[]'::jsonb)) as item(value)
  loop
    if coalesce(subscription ->> 'id', '') = '' then continue; end if;
    plan_code := case lower(coalesce(subscription ->> 'plan', '')) when 'pro' then 'pro' when 'standartinis' then 'standard' when 'standard' then 'standard' else null end;
    plan_status := case lower(coalesce(subscription ->> 'status', ''))
      when 'aktyvi' then 'active' when 'active' then 'active'
      when 'atšaukta' then 'canceled' when 'canceled' then 'canceled'
      when 'pasibaigusi' then 'expired' when 'expired' then 'expired'
      else 'pending' end;
    price_cents := greatest(0, round(coalesce((subscription ->> 'price')::numeric, 0) * 100)::integer);
    end_date := case when coalesce(subscription ->> 'endsAt', '') ~ '^\d{4}-\d{2}-\d{2}$' then (subscription ->> 'endsAt')::timestamptz else null end;
    insert into public.organization_subscriptions (
      subscription_id, organization_id, plan_code, plan_name, status, amount_cents,
      currency, ends_at, metadata, updated_at
    ) values (
      subscription ->> 'id', new.organization_id, plan_code,
      coalesce(subscription ->> 'plan', 'Nenurodytas'), plan_status, price_cents,
      coalesce(subscription ->> 'currency', 'EUR'), end_date,
      subscription - 'id' - 'orgId' - 'plan' - 'status' - 'price' - 'endsAt', now()
    ) on conflict (subscription_id) do update
      set plan_code = excluded.plan_code, plan_name = excluded.plan_name, status = excluded.status,
          amount_cents = excluded.amount_cents, currency = excluded.currency,
          ends_at = excluded.ends_at, metadata = excluded.metadata, updated_at = now();
  end loop;

  insert into public.audit_events (event_key, organization_id, actor_user_id, action, target_type, target_id, details, occurred_at)
  select 'signature:' || signature_id, organization_id, coalesce(auth.uid(), new.updated_by),
         'document.signed', 'document_signature', signature_id,
         jsonb_build_object('employeeId', employee_id, 'documentId', document_id, 'signerRole', signer_role), signed_at
  from public.document_signatures where organization_id = new.organization_id
  on conflict (event_key) do nothing;

  return new;
end;
$$;

create trigger sync_organization_workspace_to_saas
  after insert or update of data on public.organization_data
  for each row execute function public.sync_organization_workspace_to_saas();

insert into public.organization_commission_signers (organization_id, signer_name, pin_hash, created_by)
select workspace.organization_id, pin.key,
       extensions.crypt(pin.value, extensions.gen_salt('bf', 12)), workspace.updated_by
from public.organization_data as workspace
cross join lateral jsonb_array_elements(coalesce(workspace.data -> 'organizations', '[]'::jsonb)) as org(value)
cross join lateral jsonb_each_text(coalesce(org.value -> 'commissionPins', '{}'::jsonb)) as pin(key, value)
where org.value ->> 'id' = workspace.organization_id::text
  and pin.value ~ '^[0-9]{4}$'
on conflict (organization_id, signer_name) do nothing;

update public.organization_data set data = data;
update public.creator_workspace_data set data = data;