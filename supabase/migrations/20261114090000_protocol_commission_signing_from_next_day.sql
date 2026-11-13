create or replace function public.enforce_protocol_commission_signing_from_next_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  protocol_batch jsonb;
  protocol_settings jsonb;
begin
  select data
    into workspace
    from public.organization_data
    where organization_id = new.organization_id;

  select item.value
    into protocol_batch
    from jsonb_array_elements(coalesce(workspace -> 'protocolBatches', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = new.batch_id
      and item.value ->> 'orgId' = new.organization_id::text;

  if protocol_batch is null then
    return new;
  end if;

  select organization.value -> 'resourceSettings' -> (protocol_batch ->> 'resourceId')
    into protocol_settings
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as organization(value)
    where organization.value ->> 'id' = new.organization_id::text;

  if protocol_settings ->> 'commissionSigningFromNextDay' = 'true' then
    if coalesce(protocol_batch ->> 'protocolDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Protocol date is invalid for commission signing';
    end if;

    if (now() at time zone 'Europe/Vilnius')::date < (protocol_batch ->> 'protocolDate')::date + 1 then
      raise exception 'Commission signing is available only from the day after the protocol date';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_protocol_commission_signing_from_next_day() from public, anon, authenticated;

create trigger protocol_commission_signing_from_next_day
  before insert on public.protocol_commission_signatures
  for each row
  execute function public.enforce_protocol_commission_signing_from_next_day();
