create table if not exists public.dss_specialist_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  organization_name text not null,
  specialist_user_id uuid not null references auth.users (id) on delete cascade,
  invited_email text not null,
  invited_name text not null default '',
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists dss_specialist_invitations_user_status_idx
  on public.dss_specialist_invitations (specialist_user_id, status);

create unique index if not exists dss_specialist_invitations_open_unique
  on public.dss_specialist_invitations (organization_id, specialist_user_id)
  where status in ('pending', 'accepted');

alter table public.dss_specialist_invitations enable row level security;
revoke all on public.dss_specialist_invitations from anon, authenticated;
grant select on public.dss_specialist_invitations to authenticated;

create policy "Managers and invited specialists can read DSS invitations"
  on public.dss_specialist_invitations for select to authenticated
  using (
    specialist_user_id = (select auth.uid())
    or public.is_organization_member(organization_id, array['manager'])
  );

create or replace function public.respond_dss_specialist_invitation(
  input_invitation_id uuid,
  input_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.dss_specialist_invitations%rowtype;
  account_type text;
  workspace jsonb;
  updated_organizations jsonb;
  updated_specialists jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into invitation
    from public.dss_specialist_invitations
    where id = input_invitation_id
    for update;
  if not found or invitation.specialist_user_id <> auth.uid() then
    raise exception 'DSS invitation not found';
  end if;
  if invitation.status <> 'pending' then raise exception 'DSS invitation is no longer pending'; end if;

  select profile.account_type into account_type
    from public.profiles as profile
    where profile.id = auth.uid();
  if coalesce(account_type, '') <> 'dss_specialist' then raise exception 'DSS specialist account required'; end if;

  if not input_accept then
    update public.dss_specialist_invitations
      set status = 'declined', responded_at = now()
      where id = invitation.id;
    return;
  end if;

  if exists (
    select 1 from public.organization_memberships as membership
    where membership.organization_id = invitation.organization_id
      and membership.user_id = auth.uid()
      and membership.role <> 'dss_specialist'
  ) then
    raise exception 'This account already has a different role in the organization';
  end if;

  insert into public.organization_memberships (organization_id, user_id, role)
    values (invitation.organization_id, auth.uid(), 'dss_specialist')
    on conflict (organization_id, user_id) do update set role = excluded.role;

  update public.dss_specialist_invitations
    set status = 'accepted', responded_at = now()
    where id = invitation.id;

  select data into workspace
    from public.organization_data
    where organization_id = invitation.organization_id
    for update;
  if workspace is null then raise exception 'Organization workspace was not found'; end if;

  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = invitation.organization_id::text then
      jsonb_set(
        item.value,
        '{dss}',
        case
          when coalesce(item.value -> 'dss', '[]'::jsonb) ? auth.uid()::text then coalesce(item.value -> 'dss', '[]'::jsonb)
          else coalesce(item.value -> 'dss', '[]'::jsonb) || jsonb_build_array(auth.uid()::text)
        end,
        true
      )
    else item.value end
  ), '[]'::jsonb)
    into updated_organizations
    from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value);

  if not exists (
    select 1 from jsonb_array_elements(coalesce(workspace -> 'organizations', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = invitation.organization_id::text
  ) then raise exception 'Organization workspace entry was not found'; end if;

  select coalesce(jsonb_agg(item.value), '[]'::jsonb)
    into updated_specialists
    from jsonb_array_elements(coalesce(workspace -> 'specialists', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' <> auth.uid()::text;
  updated_specialists := updated_specialists || jsonb_build_array(jsonb_build_object(
    'id', auth.uid(),
    'name', invitation.invited_name,
    'email', invitation.invited_email,
    'status', 'Paskyra patvirtinta'
  ));

  update public.organization_data
    set data = jsonb_set(
      jsonb_set(workspace, '{organizations}', updated_organizations, true),
      '{specialists}', updated_specialists, true
    ),
    updated_by = auth.uid(),
    updated_at = now()
    where organization_id = invitation.organization_id;
end;
$$;

create or replace function public.revoke_dss_specialist(
  input_organization_id uuid,
  input_specialist_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace jsonb;
  updated_organizations jsonb;
begin
  if auth.uid() is null or not public.is_organization_member(input_organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;

  if not exists (
    select 1 from public.organization_memberships as membership
    where membership.organization_id = input_organization_id
      and membership.user_id = input_specialist_user_id
      and membership.role = 'dss_specialist'
  ) then raise exception 'DSS specialist is not assigned to this organization'; end if;

  select data into workspace
    from public.organization_data
    where organization_id = input_organization_id
    for update;
  if workspace is null then raise exception 'Organization workspace was not found'; end if;

  delete from public.organization_memberships
    where organization_id = input_organization_id
      and user_id = input_specialist_user_id
      and role = 'dss_specialist';

  update public.dss_specialist_invitations
    set status = 'revoked', responded_at = now()
    where organization_id = input_organization_id
      and specialist_user_id = input_specialist_user_id
      and status in ('pending', 'accepted');

  select coalesce(jsonb_agg(
    case when item.value ->> 'id' = input_organization_id::text then
      jsonb_set(
        item.value,
        '{dss}',
        coalesce((
          select jsonb_agg(to_jsonb(member.value))
          from jsonb_array_elements_text(coalesce(item.value -> 'dss', '[]'::jsonb)) as member(value)
          where member.value <> input_specialist_user_id::text
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

revoke all on function public.respond_dss_specialist_invitation(uuid, boolean) from public, anon;
revoke all on function public.revoke_dss_specialist(uuid, uuid) from public, anon;
grant execute on function public.respond_dss_specialist_invitation(uuid, boolean) to authenticated;
grant execute on function public.revoke_dss_specialist(uuid, uuid) to authenticated;

drop policy if exists "Managers and DSS specialists can read documents" on public.organization_documents;
create policy "Managers and DSS specialists can read documents"
  on public.organization_documents for select to authenticated
  using (
    public.is_creator()
    or (
      organization_id is null
      and (
        exists (
          select 1 from public.organization_memberships as membership
          where membership.user_id = (select auth.uid())
            and membership.role in ('manager', 'dss_specialist')
        )
        or exists (
          select 1 from public.profiles as profile
          where profile.id = (select auth.uid())
            and profile.account_type = 'dss_specialist'
        )
      )
    )
    or public.is_organization_member(organization_id, array['manager', 'dss_specialist'])
  );

drop policy if exists "Organization managers and DSS specialists can read the shared creator catalog" on public.creator_workspace_data;
create policy "Organization managers and DSS specialists can read the shared creator catalog"
  on public.creator_workspace_data for select to authenticated
  using (
    public.is_creator()
    or exists (
      select 1 from public.organization_memberships as membership
      where membership.user_id = (select auth.uid())
        and membership.role in ('manager', 'dss_specialist')
    )
    or exists (
      select 1 from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.account_type = 'dss_specialist'
    )
  );
