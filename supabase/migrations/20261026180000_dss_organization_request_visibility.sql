alter table public.organizations
  add column if not exists dss_requests_enabled boolean not null default true;

create or replace function public.search_organizations_for_dss(input_query text)
returns table (id uuid, name text, company_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := lower(btrim(coalesce(input_query, '')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = auth.uid() and profile.account_type = 'dss_specialist'
  ) then raise exception 'DSS specialist account required'; end if;
  if length(normalized_query) < 2 then raise exception 'Enter at least two characters to search'; end if;

  return query
    select organization.id, organization.name, organization.company_code
    from public.organizations as organization
    where organization.dss_requests_enabled
      and (
        position(normalized_query in lower(organization.name)) > 0
        or position(normalized_query in lower(coalesce(organization.company_code, ''))) > 0
      )
      and not exists (
        select 1 from public.organization_memberships as membership
        where membership.organization_id = organization.id and membership.user_id = auth.uid()
      )
      and not exists (
        select 1 from public.dss_organization_requests as request
        where request.organization_id = organization.id
          and request.specialist_user_id = auth.uid()
          and request.status = 'pending'
      )
      and not exists (
        select 1 from public.dss_specialist_invitations as invitation
        where invitation.organization_id = organization.id
          and invitation.specialist_user_id = auth.uid()
          and invitation.status = 'pending'
      )
    order by organization.name
    limit 20;
end;
$$;

create or replace function public.request_dss_organization(input_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  specialist_name text;
  specialist_email text;
  organization_name text;
  organization_requests_enabled boolean;
  request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = auth.uid() and profile.account_type = 'dss_specialist'
  ) then raise exception 'DSS specialist account required'; end if;
  select organization.name, organization.dss_requests_enabled
    into organization_name, organization_requests_enabled
    from public.organizations as organization
    where organization.id = input_organization_id;
  if not found then raise exception 'Organization not found'; end if;
  if not organization_requests_enabled then raise exception 'This organization is not accepting DSS requests'; end if;
  if exists (
    select 1 from public.organization_memberships as membership
    where membership.organization_id = input_organization_id and membership.user_id = auth.uid()
  ) then raise exception 'You already have a role in this organization'; end if;
  if exists (
    select 1 from public.dss_specialist_invitations as invitation
    where invitation.organization_id = input_organization_id
      and invitation.specialist_user_id = auth.uid()
      and invitation.status = 'pending'
  ) then raise exception 'This organization has already invited you'; end if;

  select profile.full_name, coalesce(user_record.email, '')
    into specialist_name, specialist_email
    from public.profiles as profile
    join auth.users as user_record on user_record.id = profile.id
    where profile.id = auth.uid();
  if coalesce(specialist_email, '') = '' then raise exception 'Specialist email is unavailable'; end if;

  insert into public.dss_organization_requests (
    organization_id, organization_name, specialist_user_id, specialist_name, specialist_email
  )
  values (input_organization_id, organization_name, auth.uid(), coalesce(specialist_name, ''), specialist_email)
  on conflict (organization_id, specialist_user_id) where status = 'pending' do nothing
  returning id into request_id;

  if request_id is null then raise exception 'A request for this organization is already pending'; end if;
  return request_id;
end;
$$;

create or replace function public.set_organization_dss_request_visibility(
  input_organization_id uuid,
  input_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  update public.organizations
    set dss_requests_enabled = coalesce(input_enabled, true)
    where id = input_organization_id;
  return found;
end;
$$;

revoke all on function public.search_organizations_for_dss(text) from public, anon;
revoke all on function public.request_dss_organization(uuid) from public, anon;
revoke all on function public.set_organization_dss_request_visibility(uuid, boolean) from public, anon;
grant execute on function public.search_organizations_for_dss(text) to authenticated;
grant execute on function public.request_dss_organization(uuid) to authenticated;
grant execute on function public.set_organization_dss_request_visibility(uuid, boolean) to authenticated;
