create policy "Assigned DSS specialists can read organization workspace data"
  on public.organization_data for select to authenticated
  using (public.is_organization_member(organization_id, array['dss_specialist']));