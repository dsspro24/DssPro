create or replace function public.create_organization_with_billing_details(
  organization_name text,
  organization_code text,
  input_billing_address text,
  input_vat_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  new_organization_id := public.create_organization(organization_name, organization_code);

  update public.organizations
  set billing_address = btrim(coalesce(input_billing_address, '')),
      vat_code = btrim(coalesce(input_vat_code, ''))
  where id = new_organization_id;

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization_with_billing_details(text, text, text, text) from public, anon;
grant execute on function public.create_organization_with_billing_details(text, text, text, text) to authenticated;
