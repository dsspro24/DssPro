create or replace function private.attach_signature_image(
  input_signature jsonb,
  input_signature_image text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  workspace jsonb;
  signature_role text := input_signature ->> 'role';
  saved_signature jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(input_signature ->> 'id', '') = ''
    or coalesce(input_signature ->> 'employeeId', '') = '' then
    raise exception 'Signature record is invalid';
  end if;
  if coalesce(input_signature_image, '') !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
    or length(input_signature_image) > 1000000 then
    raise exception 'Signature image must be a PNG smaller than 1 MB';
  end if;

  select employee.organization_id into target_organization_id
    from public.organization_employees as employee
    where employee.employee_id = input_signature ->> 'employeeId';
  if not found then raise exception 'Signature employee was not found'; end if;

  if signature_role = 'Darbuotojas' then
    if not public.is_organization_member(target_organization_id, array['employee']) then raise exception 'Employee access required'; end if;
  elsif signature_role = 'DSS specialistas' then
    if not public.is_organization_member(target_organization_id, array['dss_specialist']) then raise exception 'DSS specialist access required'; end if;
  elsif signature_role in ('Vadovas', 'Komisijos narys') then
    if not public.is_organization_member(target_organization_id, array['manager']) then raise exception 'Organization manager access required'; end if;
  else
    raise exception 'Signer role is invalid';
  end if;

  select workspace_row.data into workspace
    from public.organization_data as workspace_row
    where workspace_row.organization_id = target_organization_id
    for update;
  if workspace is null then raise exception 'Organization workspace was not found'; end if;

  saved_signature := input_signature || jsonb_build_object('signatureImage', input_signature_image);
  if not exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_signature ->> 'id'
  ) then
    raise exception 'Signed record was not found';
  end if;

  update public.organization_data as workspace_row
    set data = jsonb_set(
      workspace,
      '{signatures}',
      (
        select coalesce(jsonb_agg(case when item.value ->> 'id' = input_signature ->> 'id' then saved_signature else item.value end), '[]'::jsonb)
        from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
      ),
      true
    ),
    updated_by = auth.uid(),
    updated_at = now()
    where workspace_row.organization_id = target_organization_id;

  update public.document_signatures as document_signature
    set metadata = document_signature.metadata || jsonb_build_object('signatureImage', input_signature_image)
    where document_signature.signature_id = input_signature ->> 'id';

  return saved_signature;
end;
$$;