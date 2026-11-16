create or replace function public.record_employee_signature_with_image(
  input_resource_id text,
  input_pin text,
  input_signature_image text,
  input_personal_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_code text := btrim(input_personal_code);
  signature jsonb;
begin
  if input_resource_id is distinct from 'res-evacuation-plan-familiarization-journal' then
    raise exception 'Personal code is only accepted for the evacuation plan journal';
  end if;
  if personal_code is null or personal_code = '' or length(personal_code) > 32 then
    raise exception 'Personal code is invalid';
  end if;

  signature := public.record_employee_signature(input_resource_id, input_pin);
  if signature is null then
    return null;
  end if;

  signature := private.attach_signature_image(
    signature || jsonb_build_object('personalCodeSnapshot', personal_code),
    input_signature_image
  );

  update public.document_signatures
    set metadata = metadata || jsonb_build_object('personalCodeSnapshot', personal_code)
    where signature_id = signature ->> 'id';
  if not found then
    raise exception 'Signature record was not found';
  end if;

  return signature;
end;
$$;

revoke all on function public.record_employee_signature_with_image(text, text, text, text) from public, anon;
grant execute on function public.record_employee_signature_with_image(text, text, text, text) to authenticated;
