create or replace function public.creator_list_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  accounts jsonb;
begin
  if not public.is_creator() then
    raise exception 'Creator access required';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', profile.id,
      'fullName', profile.full_name,
      'email', auth_user.email,
      'accountType', profile.account_type,
      'createdAt', profile.created_at,
      'organizations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', organization.id,
          'name', organization.name,
          'role', membership.role
        ) order by organization.name)
        from public.organization_memberships as membership
        join public.organizations as organization on organization.id = membership.organization_id
        where membership.user_id = profile.id
      ), '[]'::jsonb)
    ) order by profile.full_name, auth_user.email
  ), '[]'::jsonb)
    into accounts
    from public.profiles as profile
    join auth.users as auth_user on auth_user.id = profile.id
    where profile.account_type in ('manager', 'dss_specialist');

  return accounts;
end;
$$;

revoke all on function public.creator_list_accounts() from public, anon;
grant execute on function public.creator_list_accounts() to authenticated;