create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_signing_pins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_signing_pins enable row level security;
revoke all on table public.user_signing_pins from anon, authenticated;

create or replace function public.has_signing_pin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_signing_pins where user_id = (select auth.uid())
  );
$$;

create or replace function public.set_signing_pin(input_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if input_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must contain exactly four digits';
  end if;

  insert into public.user_signing_pins (user_id, pin_hash)
  values ((select auth.uid()), extensions.crypt(input_pin, extensions.gen_salt('bf', 12)));
  return true;
exception
  when unique_violation then
    raise exception 'Signing PIN is already configured';
end;
$$;

create or replace function public.verify_signing_pin(input_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_pin_hash text;
  current_failures integer;
  current_lock timestamptz;
  next_failures integer;
begin
  if auth.uid() is null or input_pin !~ '^[0-9]{4}$' then
    return false;
  end if;

  select pin_hash, failed_attempts, locked_until
    into saved_pin_hash, current_failures, current_lock
    from public.user_signing_pins
    where user_id = (select auth.uid())
    for update;

  if not found or current_lock > now() then
    return false;
  end if;

  if extensions.crypt(input_pin, saved_pin_hash) = saved_pin_hash then
    update public.user_signing_pins
      set failed_attempts = 0, locked_until = null
      where user_id = (select auth.uid());
    return true;
  end if;

  next_failures := current_failures + 1;
  update public.user_signing_pins
    set failed_attempts = next_failures,
        locked_until = case when next_failures >= 5 then now() + interval '15 minutes' else null end
    where user_id = (select auth.uid());
  return false;
end;
$$;

create or replace function public.change_signing_pin(input_current_pin text, input_new_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if input_new_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must contain exactly four digits';
  end if;
  if not public.verify_signing_pin(input_current_pin) then
    return false;
  end if;

  update public.user_signing_pins
    set pin_hash = extensions.crypt(input_new_pin, extensions.gen_salt('bf', 12)),
        failed_attempts = 0,
        locked_until = null,
        updated_at = now()
    where user_id = (select auth.uid());
  return found;
end;
$$;

revoke all on function public.has_signing_pin() from public, anon;
revoke all on function public.set_signing_pin(text) from public, anon;
revoke all on function public.verify_signing_pin(text) from public, anon;
revoke all on function public.change_signing_pin(text, text) from public, anon;
grant execute on function public.has_signing_pin() to authenticated;
grant execute on function public.set_signing_pin(text) to authenticated;
grant execute on function public.verify_signing_pin(text) to authenticated;
grant execute on function public.change_signing_pin(text, text) to authenticated;