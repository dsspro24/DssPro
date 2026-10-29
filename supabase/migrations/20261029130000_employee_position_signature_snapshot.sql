update public.organization_data as organization_data
set data = jsonb_set(
  organization_data.data,
  '{signatures}',
  (
    select coalesce(jsonb_agg(
      case
        when signature.value ? 'positionSnapshot' then signature.value
        else signature.value || jsonb_build_object(
          'positionSnapshot',
          coalesce(
            nullif(signature.value #>> '{aapSnapshot,position}', ''),
            (
              select nullif(employee.value ->> 'position', '')
              from jsonb_array_elements(coalesce(organization_data.data -> 'employees', '[]'::jsonb)) as employee(value)
              where employee.value ->> 'id' = signature.value ->> 'employeeId'
              limit 1
            ),
            'Darbuotojas'
          )
        )
      end
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(organization_data.data -> 'signatures', '[]'::jsonb)) as signature(value)
  ),
  true
)
where exists (
  select 1
  from jsonb_array_elements(coalesce(organization_data.data -> 'signatures', '[]'::jsonb)) as signature(value)
  where not (signature.value ? 'positionSnapshot')
);

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
  organization_id uuid;
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
  if coalesce(input_signature_image, '') !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
    or length(input_signature_image) > 1000000 then
    raise exception 'Signature image must be a PNG smaller than 1 MB';
  end if;

  select employee_record.organization_id into organization_id
    from public.organization_employees as employee_record
    where employee_record.employee_id = input_signature ->> 'employeeId';
  if not found then raise exception 'Signature employee was not found'; end if;

  if signature_role = 'Darbuotojas' then
    if not public.is_organization_member(organization_id, array['employee']) then raise exception 'Employee access required'; end if;
  elsif signature_role = 'DSS specialistas' then
    if not public.is_organization_member(organization_id, array['dss_specialist']) then raise exception 'DSS specialist access required'; end if;
  elsif signature_role in ('Vadovas', 'Komisijos narys') then
    if not public.is_organization_member(organization_id, array['manager']) then raise exception 'Organization manager access required'; end if;
  else
    raise exception 'Signer role is invalid';
  end if;

  select data into workspace
    from public.organization_data
    where organization_id = private.attach_signature_image.organization_id
    for update;
  if workspace is null then raise exception 'Organization workspace was not found'; end if;

  select item.value into employee
    from jsonb_array_elements(coalesce(workspace -> 'employees', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = input_signature ->> 'employeeId';
  if employee is null then raise exception 'Signature employee was not found in the workspace'; end if;

  saved_signature := input_signature || jsonb_build_object(
    'signatureImage', input_signature_image,
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
        select coalesce(jsonb_agg(case when item.value ->> 'id' = input_signature ->> 'id' then saved_signature else item.value end), '[]'::jsonb)
        from jsonb_array_elements(coalesce(workspace -> 'signatures', '[]'::jsonb)) as item(value)
      ),
      true
    ),
    updated_by = auth.uid(),
    updated_at = now()
    where organization_id = private.attach_signature_image.organization_id;

  update public.document_signatures
    set metadata = metadata || jsonb_build_object(
      'signatureImage', input_signature_image,
      'positionSnapshot', saved_signature -> 'positionSnapshot'
    )
    where signature_id = input_signature ->> 'id';

  return saved_signature;
end;
$$;
