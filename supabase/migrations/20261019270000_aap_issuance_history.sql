create or replace function public.get_employee_aap_issuances()
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

  return (
    select coalesce(jsonb_agg(issuance.value order by issuance.value ->> 'issuedAt', issuance.value ->> 'createdAt'), '[]'::jsonb)
      from jsonb_array_elements(coalesce(workspace -> 'aapIssuances', '[]'::jsonb)) as issuance(value)
      where issuance.value ->> 'employeeId' = employee_id
        and issuance.value ->> 'orgId' = employee_organization_id::text
  );
end;
$$;

revoke all on function public.get_employee_aap_issuances() from public, anon;
grant execute on function public.get_employee_aap_issuances() to authenticated;

create or replace function public.record_employee_aap_issuance_signature(
  input_issuance_id text,
  input_pin text,
  input_signature_path text
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
  issuance jsonb;
  employee jsonb;
  signed_issuance jsonb;
  signed_at timestamptz := now();
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

  if coalesce(input_signature_path, '') !~ ('^' || employee_organization_id::text || '/[0-9a-f-]{36}\.png$') then
    raise exception 'Signature storage path is invalid';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = employee_organization_id
    for update;
  if workspace is null then
    raise exception 'Organization workspace was not found';
  end if;

  select item.value
    into issuance
    from jsonb_array_elements(coalesce(workspace -> 'aapIssuances', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_issuance_id
      and item.value ->> 'employeeId' = employee_id
      and item.value ->> 'orgId' = employee_organization_id::text;
  if issuance is null then
    raise exception 'AAP issuance was not found for this employee';
  end if;
  if coalesce(issuance ->> 'status', '') <> 'pending'
    or coalesce(issuance ->> 'signaturePath', '') <> ''
    or coalesce(issuance ->> 'signedAt', '') <> '' then
    raise exception 'AAP issuance is already signed or is not pending';
  end if;

  select item.value
    into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_id
      and coalesce(item.value -> 'resourceIds', '[]'::jsonb) ? 'res-aap';
  if employee is null then
    raise exception 'AAP card is not assigned to this employee';
  end if;

  if not public.verify_signing_pin(input_pin) then
    return null;
  end if;

  signed_issuance := issuance || jsonb_build_object(
    'status', 'signed',
    'signer', coalesce(employee ->> 'name', ''),
    'signatureMethod', 'PIN',
    'signedAt', signed_at,
    'signaturePath', input_signature_path,
    'ip', private.request_client_ip()
  );

  update public.organization_data
    set data = jsonb_set(
      workspace,
      '{aapIssuances}',
      (
        select coalesce(jsonb_agg(case when item.value ->> 'id' = input_issuance_id
          then signed_issuance else item.value end), '[]'::jsonb)
          from jsonb_array_elements(coalesce(workspace -> 'aapIssuances', '[]'::jsonb)) as item(value)
      ),
      true
    ),
    updated_at = now()
    where organization_id = employee_organization_id;

  return signed_issuance;
end;
$$;

revoke all on function public.record_employee_aap_issuance_signature(text, text, text) from public, anon;
grant execute on function public.record_employee_aap_issuance_signature(text, text, text) to authenticated;

create or replace function private.protect_aap_issuance_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_issuances jsonb;
  old_issuance jsonb;
  new_issuance jsonb;
begin
  if tg_op = 'INSERT' then
    previous_issuances := '[]'::jsonb;
  else
    previous_issuances := coalesce(old.data -> 'aapIssuances', '[]'::jsonb);
  end if;

  if tg_op = 'UPDATE' then
    for old_issuance in
      select item.value from jsonb_array_elements(previous_issuances) as item(value)
    loop
      select item.value
        into new_issuance
        from jsonb_array_elements(coalesce(new.data -> 'aapIssuances', '[]'::jsonb)) as item(value)
        where item.value ->> 'id' = old_issuance ->> 'id';
      if not found then
        raise exception 'AAP issuance history is append-only; existing records cannot be removed';
      end if;
      if old_issuance = new_issuance then
        continue;
      end if;

      if coalesce(old_issuance ->> 'status', '') = 'pending'
        and coalesce(new_issuance ->> 'status', '') = 'signed'
        and (old_issuance - array['status', 'signer', 'signatureMethod', 'signedAt', 'signaturePath', 'ip'])
          = (new_issuance - array['status', 'signer', 'signatureMethod', 'signedAt', 'signaturePath', 'ip'])
        and new_issuance ->> 'signatureMethod' = 'PIN'
        and coalesce(new_issuance ->> 'signer', '') <> ''
        and coalesce(new_issuance ->> 'signedAt', '') <> ''
        and coalesce(new_issuance ->> 'signaturePath', '') ~ ('^' || new.organization_id::text || '/[0-9a-f-]{36}\.png$')
        and exists (
          select 1
            from public.organization_memberships as membership
            where membership.user_id = (select auth.uid())
              and membership.organization_id = new.organization_id
              and membership.role = 'employee'
              and membership.employee_id = old_issuance ->> 'employeeId'
        ) then
        continue;
      end if;

      raise exception 'AAP issuance records are immutable; create a new record for a correction';
    end loop;
  end if;

  for new_issuance in
    select item.value
      from jsonb_array_elements(coalesce(new.data -> 'aapIssuances', '[]'::jsonb)) as item(value)
      where not exists (
        select 1
          from jsonb_array_elements(previous_issuances) as old_item(value)
          where old_item.value ->> 'id' = item.value ->> 'id'
      )
  loop
    if coalesce(new_issuance ->> 'id', '') = ''
      or coalesce(new_issuance ->> 'orgId', '') <> new.organization_id::text
      or coalesce(new_issuance ->> 'employeeId', '') = ''
      or coalesce(new_issuance ->> 'status', '') <> 'pending'
      or coalesce(new_issuance ->> 'signaturePath', '') <> ''
      or coalesce(new_issuance ->> 'signedAt', '') <> '' then
      raise exception 'New AAP issuance records must be pending and unsigned';
    end if;
    if not exists (
      select 1
        from jsonb_array_elements(coalesce(new.data -> 'employees', '[]'::jsonb)) as employee(value)
        where employee.value ->> 'id' = new_issuance ->> 'employeeId'
          and coalesce(employee.value -> 'resourceIds', '[]'::jsonb) ? 'res-aap'
    ) then
      raise exception 'AAP card must be assigned before recording a new issuance';
    end if;
    if coalesce(jsonb_typeof(new_issuance -> 'items'), '') <> 'array' then
      raise exception 'AAP issuance must contain at least one item';
    end if;
    if jsonb_array_length(new_issuance -> 'items') = 0 then
      raise exception 'AAP issuance must contain at least one item';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.protect_aap_issuance_history() from public, anon, authenticated;

drop trigger if exists protect_aap_issuance_history on public.organization_data;
create trigger protect_aap_issuance_history
  before insert or update on public.organization_data
  for each row
  execute function private.protect_aap_issuance_history();
