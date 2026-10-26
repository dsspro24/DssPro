alter table public.dss_specialist_invitations
  add column if not exists can_manage_workspace boolean not null default false;

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

  insert into public.organization_memberships (
    organization_id, user_id, role, can_manage_workspace
  ) values (
    invitation.organization_id, auth.uid(), 'dss_specialist', invitation.can_manage_workspace
  ) on conflict (organization_id, user_id) do update
    set role = excluded.role,
        can_manage_workspace = excluded.can_manage_workspace;

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