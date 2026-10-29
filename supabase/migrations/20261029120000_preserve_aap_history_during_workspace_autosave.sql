create or replace function private.preserve_aap_issuance_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (new.data ? 'aapIssuances') then
    new.data := jsonb_set(new.data, '{aapIssuances}', coalesce(old.data -> 'aapIssuances', '[]'::jsonb), true);
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_aap_issuance_history() from public, anon, authenticated;

create trigger preserve_aap_issuance_history
  before update of data on public.organization_data
  for each row
  execute function private.preserve_aap_issuance_history();
