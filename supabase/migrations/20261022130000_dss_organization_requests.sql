create table if not exists public.dss_organization_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  organization_name text not null,
  specialist_user_id uuid not null references auth.users (id) on delete cascade,
  specialist_name text not null default '',
  specialist_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists dss_organization_requests_open_unique
  on public.dss_organization_requests (organization_id, specialist_user_id)
  where status = 'pending';

create index if not exists dss_organization_requests_specialist_status_idx
  on public.dss_organization_requests (specialist_user_id, status);

alter table public.dss_organization_requests enable row level security;
revoke all on public.dss_organization_requests from anon, authenticated;
grant select on public.dss_organization_requests to authenticated;

create policy "Managers and requesting DSS specialists can read organization requests"
  on public.dss_organization_requests for select to authenticated
  using (
    specialist_user_id = (select auth.uid())
    or public.is_organization_member(organization_id, array['manager'])
  );

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
    where (
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
  request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = auth.uid() and profile.account_type = 'dss_specialist'
  ) then raise exception 'DSS specialist account required'; end if;
  select organization.name into organization_name
    from public.organizations as organization
    where organization.id = input_organization_id;
  if not found then raise exception 'Organization not found'; end if;
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

create or replace function public.respond_dss_organization_request(
  input_request_id uuid,
  input_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.dss_organization_requests%rowtype;
  workspace jsonb;
  updated_organizations jsonb;
  updated_specialists jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_accept is null then raise exception 'Choose whether to accept the DSS request'; end if;

  select * into request_record
    from public.dss_organization_requests
    where id = input_request_id
    for update;
  if not found or not public.is_organization_member(request_record.organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;
  if request_record.status <> 'pending' then raise exception 'DSS request is no longer pending'; end if;

  if not input_accept then
    update public.dss_organization_requests
      set status = 'declined', responded_at = now()
      where id = request_record.id;
    return;
  end if;

  if exists (
    select 1 from public.organization_memberships as membership
    where membership.organization_id = request_record.organization_id
      and membership.user_id = request_record.specialist_user_id
  ) then raise exception 'This account already has a role in the organization'; end if;

  insert into public.organization_memberships (organization_id, user_id, role)
    values (request_record.organization_id, request_record.specialist_user_id, 'dss_specialist');

  update public.dss_organization_requests
    set status = 'accepted', responded_at = now()
    where id = request_record.id;

  update public.dss_specialist_invitations
    set status = 'accepted', responded_at = now()
    where organization_id = request_record.organization_id
      and specialist_user_id = request_record.specialist_user_id
      and status = 'pending';

  select data into workspace
    from public.organization_data
    where organization_id = request_record.organization_id
    for update;
  if workspace is null then raise exception 'Organization workspace was not found'; end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = request_record.organization_id::text
  ) then raise exception 'Organization workspace entry was not found'; end if;

  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = request_record.organization_id::text then
      jsonb_set(
        item.value,
        '{dss}',
        case
          when coalesce(item.value -> 'dss', '[]'::jsonb) ? request_record.specialist_user_id::text
            then coalesce(item.value -> 'dss', '[]'::jsonb)
          else coalesce(item.value -> 'dss', '[]'::jsonb) || jsonb_build_array(request_record.specialist_user_id::text)
        end,
        true
      )
    else item.value end
  ), '[]'::jsonb)
    into updated_organizations
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value);

  select coalesce(jsonb_agg(item.value), '[]'::jsonb)
    into updated_specialists
    from jsonb_array_elements(coalesce(workspace -> 'specialists', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' <> request_record.specialist_user_id::text;
  updated_specialists := updated_specialists || jsonb_build_array(jsonb_build_object(
    'id', request_record.specialist_user_id,
    'name', request_record.specialist_name,
    'email', request_record.specialist_email,
    'status', 'Paskyra patvirtinta'
  ));

  update public.organization_data
    set data = jsonb_set(
      jsonb_set(workspace, '{organizations}', updated_organizations, true),
      '{specialists}', updated_specialists, true
    ),
    updated_by = auth.uid(),
    updated_at = now()
    where organization_id = request_record.organization_id;
end;
$$;

create or replace function public.leave_dss_organization(input_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  updated_organizations jsonb;
begin
  if auth.uid() is null or not public.is_organization_member(input_organization_id, array['dss_specialist']) then
    raise exception 'DSS specialist access required';
  end if;

  select data into workspace
    from public.organization_data
    where organization_id = input_organization_id
    for update;
  if workspace is null then raise exception 'Organization workspace was not found'; end if;

  delete from public.organization_memberships
    where organization_id = input_organization_id
      and user_id = auth.uid()
      and role = 'dss_specialist';

  update public.dss_specialist_invitations
    set status = 'revoked', responded_at = now()
    where organization_id = input_organization_id
      and specialist_user_id = auth.uid()
      and status = 'accepted';
  update public.dss_organization_requests
    set status = 'revoked', responded_at = now()
    where organization_id = input_organization_id
      and specialist_user_id = auth.uid()
      and status = 'accepted';

  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = input_organization_id::text then
      jsonb_set(
        item.value,
        '{dss}',
        coalesce((
          select jsonb_agg(to_jsonb(member.value))
          from jsonb_array_elements_text(coalesce(item.value -> 'dss', '[]'::jsonb)) as member(value)
          where member.value <> auth.uid()::text
        ), '[]'::jsonb),
        true
      )
    else item.value end
  ), '[]'::jsonb)
    into updated_organizations
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value);

  update public.organization_data
    set data = jsonb_set(workspace, '{organizations}', updated_organizations, true),
    updated_by = auth.uid(),
    updated_at = now()
    where organization_id = input_organization_id;
end;
$$;

revoke all on function public.search_organizations_for_dss(text) from public, anon;
revoke all on function public.request_dss_organization(uuid) from public, anon;
revoke all on function public.respond_dss_organization_request(uuid, boolean) from public, anon;
revoke all on function public.leave_dss_organization(uuid) from public, anon;
grant execute on function public.search_organizations_for_dss(text) to authenticated;
grant execute on function public.request_dss_organization(uuid) to authenticated;
grant execute on function public.respond_dss_organization_request(uuid, boolean) to authenticated;
grant execute on function public.leave_dss_organization(uuid) to authenticated;
