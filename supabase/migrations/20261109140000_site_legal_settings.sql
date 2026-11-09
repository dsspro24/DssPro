create table public.site_legal_settings (
  id boolean primary key default true check (id),
  provider_name text not null default '' check (char_length(provider_name) <= 180),
  registration_number text not null default '' check (char_length(registration_number) <= 100),
  address text not null default '' check (char_length(address) <= 300),
  contact_email text not null default 'dsspro@inbox.lt' check (
    char_length(contact_email) <= 254
    and contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  terms_status text not null default 'draft' check (terms_status in ('draft', 'published')),
  published_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (terms_status <> 'published' or (
    nullif(btrim(provider_name), '') is not null
    and nullif(btrim(registration_number), '') is not null
    and nullif(btrim(address), '') is not null
    and nullif(btrim(contact_email), '') is not null
  ))
);

insert into public.site_legal_settings (id, contact_email)
values (true, 'dsspro@inbox.lt')
on conflict (id) do nothing;

alter table public.site_legal_settings enable row level security;

revoke all on public.site_legal_settings from public, anon, authenticated;
grant select on public.site_legal_settings to anon, authenticated;
grant update on public.site_legal_settings to authenticated;

create policy "Anyone can read the public legal settings"
  on public.site_legal_settings for select to anon, authenticated
  using (id);

create policy "Creators can update public legal settings"
  on public.site_legal_settings for update to authenticated
  using (public.is_creator())
  with check (public.is_creator() and updated_by = (select auth.uid()));

create or replace function public.update_site_legal_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.terms_status = 'published' then
    if tg_op = 'INSERT' then
      new.published_at := now();
    elsif old.terms_status <> 'published' then
      new.published_at := now();
    end if;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.update_site_legal_settings() from public, anon, authenticated;

create trigger set_site_legal_settings_timestamps
  before insert or update on public.site_legal_settings
  for each row execute function public.update_site_legal_settings();
