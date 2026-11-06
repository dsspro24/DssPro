create or replace function public.cancel_pending_dss_specialist_invitation(
  input_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.dss_specialist_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
    into invitation
    from public.dss_specialist_invitations
    where id = input_invitation_id
    for update;

  if not found then
    raise exception 'DSS invitation not found';
  end if;
  if not public.is_organization_member(invitation.organization_id, array['manager']) then
    raise exception 'Organization manager access required';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'DSS invitation is no longer pending';
  end if;

  update public.dss_specialist_invitations
    set status = 'revoked',
        responded_at = now()
    where id = invitation.id;
end;
$$;

revoke all on function public.cancel_pending_dss_specialist_invitation(uuid) from public, anon;
grant execute on function public.cancel_pending_dss_specialist_invitation(uuid) to authenticated;
