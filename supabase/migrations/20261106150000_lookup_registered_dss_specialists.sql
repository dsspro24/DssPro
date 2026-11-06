create or replace function public.lookup_registered_dss_specialist(input_email text)
returns table (user_id uuid, full_name text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select auth_user.id, profile.full_name, auth_user.email
  from auth.users as auth_user
  join public.profiles as profile on profile.id = auth_user.id
  where lower(btrim(auth_user.email)) = lower(btrim(input_email))
    and profile.account_type = 'dss_specialist'
  limit 1;
$$;

revoke all on function public.lookup_registered_dss_specialist(text) from public, anon, authenticated;
grant execute on function public.lookup_registered_dss_specialist(text) to service_role;
