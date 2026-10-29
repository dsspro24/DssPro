create or replace function public.create_manager_aap_issuance(input_issuance jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  issuance_organization_id uuid;
  employee_id text;
  workspace jsonb;
  employee jsonb;
  issuance jsonb;
  existing_issuances jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(input_issuance) <> 'object'
    or coalesce(input_issuance ->> 'orgId', '') !~* '^[0-9a-f-]{36}$' then
    raise exception 'AAP issuance data is invalid';
  end if;

  issuance_organization_id := (input_issuance ->> 'orgId')::uuid;
  employee_id := coalesce(input_issuance ->> 'employeeId', '');
  if not public.can_manage_organization(issuance_organization_id) then
    raise exception 'Organization management access required';
  end if;
  if coalesce(input_issuance ->> 'id', '') = ''
    or employee_id = ''
    or coalesce(input_issuance ->> 'issuedAt', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(btrim(input_issuance ->> 'issuedBy'), '') = ''
    or coalesce(jsonb_typeof(input_issuance -> 'items'), '') <> 'array'
    or jsonb_array_length(coalesce(input_issuance -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'AAP issuance data is incomplete';
  end if;

  select organization_data.data
    into workspace
    from public.organization_data
    where organization_data.organization_id = issuance_organization_id
    for update;
  if workspace is null then
    raise exception 'Organization workspace was not found';
  end if;

  select item.value
    into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_id
      and item.value ->> 'orgId' = issuance_organization_id::text
      and coalesce(item.value -> 'resourceIds', '[]'::jsonb) ? 'res-aap';
  if employee is null then
    raise exception 'AAP card is not assigned to this employee';
  end if;

  existing_issuances := coalesce(workspace -> 'aapIssuances', '[]'::jsonb);
  if exists (
    select 1
      from jsonb_array_elements(existing_issuances) as item(value)
      where item.value ->> 'id' = input_issuance ->> 'id'
  ) then
    raise exception 'AAP issuance already exists';
  end if;

  issuance := (input_issuance - array[
      'status', 'signer', 'signatureMethod', 'signatureImage',
      'signaturePath', 'signedAt', 'ip'
    ]) || jsonb_build_object(
      'orgId', issuance_organization_id,
      'employeeId', employee_id,
      'employeeName', coalesce(employee ->> 'name', ''),
      'issuedByUserId', auth.uid(),
      'status', 'pending',
      'createdAt', now()
    );

  update public.organization_data
    set data = jsonb_set(
      workspace,
      '{aapIssuances}',
      existing_issuances || jsonb_build_array(issuance),
      true
    ),
    updated_by = auth.uid(),
    updated_at = now()
    where organization_id = issuance_organization_id;

  return issuance;
end;
$$;

revoke all on function public.create_manager_aap_issuance(jsonb) from public, anon;
grant execute on function public.create_manager_aap_issuance(jsonb) to authenticated;
