create or replace function public.create_additional_organization_with_billing_details(
  organization_name text,
  organization_code text,
  input_billing_address text,
  input_vat_code text,
  input_plan_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  normalized_name text := btrim(coalesce(organization_name, ''));
  normalized_code text := btrim(coalesce(organization_code, ''));
  normalized_address text := btrim(coalesce(input_billing_address, ''));
begin
  if normalized_name = '' then raise exception 'Organization name is required'; end if;
  if normalized_code = '' then raise exception 'Organization code is required'; end if;
  if normalized_address = '' then raise exception 'Billing address is required'; end if;

  new_organization_id := public.create_additional_organization(
    normalized_name,
    normalized_code,
    input_plan_code
  );

  update public.organizations
  set billing_address = normalized_address,
      vat_code = btrim(coalesce(input_vat_code, ''))
  where id = new_organization_id;

  perform public.request_workspace_subscription(new_organization_id, input_plan_code, 1);
  return new_organization_id;
end;
$$;

revoke all on function public.create_additional_organization_with_billing_details(text, text, text, text, text) from public, anon;
grant execute on function public.create_additional_organization_with_billing_details(text, text, text, text, text) to authenticated;
