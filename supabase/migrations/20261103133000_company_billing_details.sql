alter table public.organizations
  add column if not exists billing_address text not null default '',
  add column if not exists vat_code text not null default '';

create or replace function public.manager_save_organization_billing_details(
  input_organization_id uuid,
  input_billing_address text,
  input_vat_code text
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.organizations%rowtype;
begin
  if not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Manager membership required';
  end if;

  update public.organizations
  set billing_address = btrim(coalesce(input_billing_address, '')),
      vat_code = btrim(coalesce(input_vat_code, ''))
  where id = input_organization_id
  returning * into result;
  if not found then raise exception 'Organization not found'; end if;
  return result;
end;
$$;

revoke all on function public.manager_save_organization_billing_details(uuid, text, text) from public, anon;
grant execute on function public.manager_save_organization_billing_details(uuid, text, text) to authenticated;

create or replace function public.snapshot_company_billing_details_on_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company public.organizations%rowtype;
begin
  if new.preinvoice_data is null
    or (tg_op = 'UPDATE' and new.preinvoice_data is not distinct from old.preinvoice_data) then
    return new;
  end if;

  select * into company
  from public.organizations
  where id = new.organization_id;
  if not found then
    raise exception 'Invoice organization not found';
  end if;

  new.preinvoice_data := jsonb_set(
    new.preinvoice_data,
    '{recipient}',
    coalesce(new.preinvoice_data -> 'recipient', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'name', company.name,
      'companyCode', company.company_code,
      'vatCode', nullif(company.vat_code, ''),
      'address', nullif(company.billing_address, '')
    )),
    true
  );
  return new;
end;
$$;

revoke all on function public.snapshot_company_billing_details_on_invoice() from public, anon, authenticated;

drop trigger if exists snapshot_company_billing_details_on_invoice on public.workspace_subscriptions;
create trigger snapshot_company_billing_details_on_invoice
  before insert or update of preinvoice_data on public.workspace_subscriptions
  for each row execute function public.snapshot_company_billing_details_on_invoice();
