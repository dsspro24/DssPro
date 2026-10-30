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
  v_organization_id uuid;
  workspace jsonb;
  employee jsonb;
  signature_role text := input_signature ->> 'role';
  saved_signature jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(input_signature ->> 'id', '') = ''
    or coalesce(input_signature ->> 'employeeId', '') = '' then
    raise exception 'Signature record is invalid';
  end if;

  select employee_record.organization_id into v_organization_id
    from public.organization_employees as employee_record
    where employee_record.employee_id = input_signature ->> 'employeeId';
  if not found then raise exception 'Signature employee was not found'; end if;

  if coalesce(input_signature_image, '') !~ ('^' || v_organization_id::text || '/[0-9a-f-]{36}\.(png|svg)$') then
    raise exception 'Signature storage path is invalid';
  end if;

  if signature_role = 'Darbuotojas' then
    if not public.is_organization_member(v_organization_id, array['employee']) then raise exception 'Employee access required'; end if;
  elsif signature_role = 'DSS specialistas' then
    if not public.is_organization_member(v_organization_id, array['dss_specialist']) then raise exception 'DSS specialist access required'; end if;
  elsif signature_role in ('Vadovas', 'Komisijos narys') then
    if not public.is_organization_member(v_organization_id, array['manager']) then raise exception 'Organization manager access required'; end if;
  else
    raise exception 'Signer role is invalid';
  end if;

  select organization_data.data into workspace
    from public.organization_data
    where organization_data.organization_id = v_organization_id
    for update;
  if workspace is null then raise exception 'Organization workspace was not found'; end if;

  select item.value into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_signature ->> 'employeeId';
  if employee is null then raise exception 'Signature employee was not found in the workspace'; end if;

  saved_signature := (input_signature - 'signatureImage') || jsonb_build_object(
    'signaturePath', input_signature_image,
    'positionSnapshot', coalesce(
      nullif(input_signature ->> 'positionSnapshot', ''),
      nullif(input_signature #>> '{aapSnapshot,position}', ''),
      nullif(employee ->> 'position', ''),
      'Darbuotojas'
    )
  );
  if not exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_signature ->> 'id'
  ) then
    raise exception 'Signed record was not found';
  end if;

  update public.organization_data
    set data = jsonb_set(
      workspace,
      '{signatures}',
      (
        select coalesce(jsonb_agg(
          case when item.value ->> 'id' = input_signature ->> 'id'
            then (item.value - 'signatureImage') || jsonb_build_object(
              'signaturePath', input_signature_image,
              'positionSnapshot', saved_signature -> 'positionSnapshot'
            )
            else item.value
          end
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
      ),
      true
    ),
    updated_by = auth.uid(),
    updated_at = now()
    where organization_data.organization_id = v_organization_id;

  update public.document_signatures
    set metadata = (metadata - 'signatureImage') || jsonb_build_object(
      'signaturePath', input_signature_image,
      'positionSnapshot', saved_signature -> 'positionSnapshot'
    )
    where signature_id = input_signature ->> 'id';

  return saved_signature;
end;
$$;
