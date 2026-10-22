create function public.record_employee_aap_card_signature_with_image(
  input_pin text,
  input_signature_path text,
  input_both_pages_confirmed boolean
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
  signature jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not coalesce(input_both_pages_confirmed, false) then
    raise exception 'Both AAP document pages must be confirmed';
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
    where organization_data.organization_id = employee_organization_id;
  if workspace is null then raise exception 'Organization workspace was not found'; end if;
  select item.value
    into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = employee_id
      and coalesce(item.value -> 'resourceIds', '[]'::jsonb) ? 'res-aap';
  if employee is null then
    raise exception 'AAP card is not assigned to this employee';
  end if;

  signature := public.record_employee_signature('res-aap', input_pin);
  if signature is null then return null; end if;
  return private.attach_signature_image(
    signature || jsonb_build_object('bothPagesConfirmed', true),
    input_signature_path
  );
end;
$$;

revoke all on function public.record_employee_aap_card_signature_with_image(text, text, boolean) from public, anon;
grant execute on function public.record_employee_aap_card_signature_with_image(text, text, boolean) to authenticated;