drop policy if exists "Tenant members can read documents" on public.organization_documents;
create policy "Managers and DSS specialists can read documents"
  on public.organization_documents for select to authenticated
  using (
    public.is_creator()
    or (organization_id is null and exists (
      select 1 from public.organization_memberships as membership
      where membership.user_id = (select auth.uid())
        and membership.role in ('manager', 'dss_specialist')
    ))
    or public.is_organization_member(organization_id, array['manager', 'dss_specialist'])
  );

drop policy if exists "Authenticated users can read the shared creator catalog" on public.creator_workspace_data;
create policy "Organization managers and DSS specialists can read the shared creator catalog"
  on public.creator_workspace_data for select to authenticated
  using (
    public.is_creator()
    or exists (
      select 1 from public.organization_memberships as membership
      where membership.user_id = (select auth.uid())
        and membership.role in ('manager', 'dss_specialist')
    )
  );