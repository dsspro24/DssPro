create or replace function public.can_read_signature_asset(input_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id::text = split_part(coalesce(input_path, ''), '/', 1)
      and membership.user_id = (select auth.uid())
      and membership.role in ('manager', 'dss_specialist')
  ) or exists (
    select 1
    from public.organization_memberships as membership
    join public.document_signatures as signature
      on signature.organization_id = membership.organization_id
      and signature.employee_id = membership.employee_id
    where membership.organization_id::text = split_part(coalesce(input_path, ''), '/', 1)
      and membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and signature.metadata ->> 'signaturePath' = input_path
  ) or exists (
    select 1
    from public.organization_memberships as membership
    join public.organization_data as organization_data
      on organization_data.organization_id = membership.organization_id
    cross join lateral jsonb_array_elements(
      coalesce(organization_data.data -> 'aapIssuances', '[]'::jsonb)
    ) as issuance(value)
    where membership.organization_id::text = split_part(coalesce(input_path, ''), '/', 1)
      and membership.user_id = (select auth.uid())
      and membership.role = 'employee'
      and issuance.value ->> 'employeeId' = membership.employee_id
      and issuance.value ->> 'status' = 'signed'
      and issuance.value ->> 'signaturePath' = input_path
  ) or public.is_creator();
$$;

revoke all on function public.can_read_signature_asset(text) from public, anon;
grant execute on function public.can_read_signature_asset(text) to authenticated;
