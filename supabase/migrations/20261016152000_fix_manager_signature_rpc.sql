create or replace function public.record_manager_signature(input_employee_id text, input_resource_id text, input_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  workspace jsonb;
  organization_record jsonb;
  signer_name text;
begin
  select employee_record.organization_id into target_organization_id
    from public.organization_employees as employee_record
    where employee_record.employee_id = input_employee_id;
  if not found or not public.is_organization_member(target_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;
  if not public.verify_signing_pin(input_pin) then return null; end if;

  select organization_data.data into workspace
    from public.organization_data
    where organization_data.organization_id = target_organization_id;
  select item.value into organization_record
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = target_organization_id::text;
  select profile.full_name into signer_name
    from public.profiles as profile where profile.id = auth.uid();

  return public.append_organization_signature(
    target_organization_id,
    input_employee_id,
    input_resource_id,
    coalesce(nullif(signer_name, ''), organization_record ->> 'manager', 'Įmonės vadovas'),
    'Vadovas'
  );
end;
$$;

revoke all on function public.record_manager_signature(text, text, text) from public, anon;
grant execute on function public.record_manager_signature(text, text, text) to authenticated;