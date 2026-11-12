create or replace function public.get_organization_commission_assignments(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_creator()
    and not public.is_organization_member(input_organization_id, array['manager', 'dss_specialist']) then
    raise exception 'Organization member access required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', assignment.assignment_id,
      'organizationId', assignment.organization_id,
      'employeeId', assignment.employee_id,
      'userId', assignment.assignee_user_id,
      'employeeName', coalesce(profile.full_name, employee.full_name),
      'employeeEmail', employee.email,
      'role', assignment.role,
      'status', assignment.status,
      'invitedAt', assignment.invited_at,
      'respondedAt', assignment.responded_at,
      'consentSignaturePath', assignment.consent_signature_path,
      'consentSignatureMethod', assignment.consent_signature_method,
      'consentIp', assignment.consent_ip
    ) order by case assignment.role when 'Komisijos pirmininkas' then 0 else 1 end, coalesce(profile.full_name, employee.full_name))
    from public.organization_commission_assignments as assignment
    left join public.organization_employees as employee
      on employee.employee_id = assignment.employee_id
      and employee.organization_id = assignment.organization_id
    left join public.profiles as profile on profile.id = assignment.assignee_user_id
    where assignment.organization_id = input_organization_id
      and assignment.status <> 'revoked'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_organization_protocol_commission_signatures(input_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_creator()
    and not public.is_organization_member(input_organization_id, array['manager', 'dss_specialist']) then
    raise exception 'Organization access required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', signature.signature_id,
      'orgId', signature.organization_id,
      'batchId', signature.batch_id,
      'assignmentId', signature.assignment_id,
      'employeeId', signature.employee_id,
      'userId', signature.signer_user_id,
      'signer', signature.signer_name,
      'role', signature.signer_role,
      'signatureMethod', signature.signature_method,
      'signaturePath', signature.signature_path,
      'signedAt', signature.signed_at,
      'ip', signature.ip_address
    ) order by signature.signed_at)
    from public.protocol_commission_signatures as signature
    where signature.organization_id = input_organization_id
  ), '[]'::jsonb);
end;
$$;
