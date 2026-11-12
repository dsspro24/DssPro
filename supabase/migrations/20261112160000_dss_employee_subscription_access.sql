create or replace function public.has_active_employee_subscription(input_organization_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or (not public.is_creator()
      and not public.is_organization_member(input_organization_id, array['manager', 'dss_specialist'])) then
    raise exception 'Organization access denied';
  end if;

  return exists (
    select 1
    from public.workspace_subscriptions as subscription
    where subscription.organization_id = input_organization_id
      and subscription.status = 'active'
      and (subscription.starts_at is null or subscription.starts_at <= now())
      and (subscription.ends_at is null or subscription.ends_at > now())
  );
end;
$$;

revoke all on function public.has_active_employee_subscription(uuid) from public, anon;
grant execute on function public.has_active_employee_subscription(uuid) to authenticated;
