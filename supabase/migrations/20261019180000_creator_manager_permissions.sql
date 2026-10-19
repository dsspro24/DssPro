create or replace function public.is_organization_member(
  target_organization_id uuid,
  allowed_roles text[] default array['manager', 'dss_specialist', 'employee']
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    public.is_creator()
    and 'manager' = any(coalesce(allowed_roles, array[]::text[]))
  ) or exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = any (allowed_roles)
  );
$$;

revoke all on function public.is_organization_member(uuid, text[]) from public, anon;
grant execute on function public.is_organization_member(uuid, text[]) to authenticated;