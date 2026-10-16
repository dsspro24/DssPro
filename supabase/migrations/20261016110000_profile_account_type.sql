alter table public.profiles
  add column if not exists account_type text not null default 'manager';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('manager', 'dss_specialist'));
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_pin text := new.raw_user_meta_data ->> 'signing_pin';
  supplied_account_type text := coalesce(new.raw_user_meta_data ->> 'account_type', 'manager');
begin
  if supplied_account_type not in ('manager', 'dss_specialist') then
    raise exception 'Unsupported account type';
  end if;

  insert into public.profiles (id, full_name, account_type)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    supplied_account_type
  );

  if supplied_pin is not null then
    if supplied_pin !~ '^[0-9]{4}$' then
      raise exception 'PIN must contain exactly four digits';
    end if;

    insert into public.user_signing_pins (user_id, pin_hash)
    values (new.id, extensions.crypt(supplied_pin, extensions.gen_salt('bf', 12)));

    update auth.users
      set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'signing_pin'
      where id = new.id;
  end if;

  return new;
end;
$$;