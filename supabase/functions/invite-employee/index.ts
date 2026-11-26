import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

const response = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const sendEmployeeSetupEmail = async (
  adminClient: ReturnType<typeof createClient>,
  employeeUser: { email_confirmed_at?: string; user_metadata?: Record<string, unknown> },
  email: string,
  redirectTo: string,
) => {
  if (employeeUser.user_metadata?.employee_needs_password !== true) return false;

  if (!employeeUser.email_confirmed_at) {
    const { error } = await adminClient.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    return true;
  }

  const { error } = await adminClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
  return true;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });

  const authorization = request.headers.get('Authorization');
  const origin = request.headers.get('Origin');
  if (!authorization || !origin) return response(401, { error: 'Authenticated request required' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return response(500, { error: 'Supabase function environment is incomplete' });

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return response(401, { error: 'Session is invalid or expired' });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: 'Invalid request body' });
  }

  const organizationId = String(body.organizationId ?? '');
  const resendEmployeeId = String(body.resendEmployeeId ?? '');
  const isResend = Boolean(resendEmployeeId);
  const employee = body.employee as Record<string, unknown> | undefined;
  const email = String(employee?.email ?? '').trim().toLowerCase();
  const employeeId = String(employee?.id ?? '');
  const redirectTo = String(body.redirectTo ?? '');
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(redirectTo);
  } catch {
    return response(400, { error: 'Invalid invitation redirect URL' });
  }

  if (!organizationId
    || (isResend && !/^emp-[a-z0-9-]{10,80}$/i.test(resendEmployeeId))
    || (!isResend && (!employee || !/^emp-[a-z0-9-]{10,80}$/i.test(employeeId)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    || redirectUrl.origin !== origin) {
    return response(400, { error: 'Employee invitation data is invalid' });
  }

  const { data: canManageOrganization, error: permissionError } = await userClient.rpc(
    'can_manage_organization',
    { target_organization_id: organizationId },
  );
  if (permissionError) return response(500, { error: `Could not check organization management access: ${permissionError.message}` });
  if (!canManageOrganization) return response(403, { error: 'Organization management access is required to invite employees' });

  const { data: subscriptions, error: subscriptionError } = await adminClient
    .from('workspace_subscriptions')
    .select('status, starts_at, ends_at')
    .eq('organization_id', organizationId);
  if (subscriptionError) return response(500, { error: `Could not check organization subscription: ${subscriptionError.message}` });
  const now = Date.now();
  const hasEmployeeAccess = (subscriptions ?? []).some((subscription) => {
    const startTime = subscription.starts_at ? new Date(subscription.starts_at).getTime() : null;
    const endTime = subscription.ends_at ? new Date(subscription.ends_at).getTime() : null;
    const periodHasStarted = startTime === null || (Number.isFinite(startTime) && startTime <= now);
    const periodIsActive = endTime === null || (Number.isFinite(endTime) && endTime > now);
    return subscription.status === 'active' && periodHasStarted && periodIsActive;
  });
  if (!hasEmployeeAccess) {
    return response(403, { error: 'Įmonės prenumerata neaktyvi. Darbuotojus bus galima pridėti, kai įmonės vadovas ją atnaujins.' });
  }

  const { data: workspace, error: workspaceReadError } = await adminClient
    .from('organization_data')
    .select('data, updated_by')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (workspaceReadError || !workspace?.data) {
    return response(409, { error: 'Organization workspace is not saved yet. Try again in a moment.' });
  }

  const organization = workspace.data.organizations?.find((item: Record<string, unknown>) => item.id === organizationId);
  if (!organization) return response(404, { error: 'Organization workspace was not found' });

  if (isResend) {
    const invitedEmployee = (Array.isArray(workspace.data.employees) ? workspace.data.employees : [])
      .find((item: Record<string, unknown>) => item.id === resendEmployeeId && item.orgId === organizationId);
    if (!invitedEmployee || invitedEmployee.status !== 'Pakviestas') {
      return response(404, { error: 'Pending employee invitation was not found' });
    }

    const invitedEmail = String(invitedEmployee.email ?? '').trim().toLowerCase();
    const { data: employeeUserId, error: employeeLookupError } = await adminClient.rpc(
      'find_employee_account_by_email',
      { input_email: invitedEmail },
    );
    if (employeeLookupError) return response(500, { error: `Could not check for an existing employee account: ${employeeLookupError.message}` });
    if (!employeeUserId) return response(404, { error: 'Employee account was not found' });

    const { data: employeeUserResult, error: employeeUserError } = await adminClient.auth.admin.getUserById(employeeUserId);
    if (employeeUserError || !employeeUserResult.user) {
      return response(500, { error: `Could not load employee account: ${employeeUserError?.message ?? 'Account was not found'}` });
    }

    try {
      const emailSent = await sendEmployeeSetupEmail(adminClient, employeeUserResult.user, invitedEmail, redirectUrl.toString());
      return response(200, { employeeId: resendEmployeeId, email: invitedEmail, emailSent });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return response(400, { error: `Could not resend employee setup email: ${message}` });
    }
  }

  const resourceIds = Array.isArray(employee.resourceIds) ? employee.resourceIds.map(String) : [];
  const allowedResourceIds = new Set(Array.isArray(organization.resources) ? organization.resources.map(String) : []);
  if (resourceIds.some((resourceId) => !allowedResourceIds.has(resourceId))) {
    return response(400, { error: 'Employee assignment contains a document not available to this organization' });
  }
  const requestedSequenceNumbers = employee.sequenceNumbersByResource;
  if (requestedSequenceNumbers !== undefined
    && (typeof requestedSequenceNumbers !== 'object' || requestedSequenceNumbers === null || Array.isArray(requestedSequenceNumbers))) {
    return response(400, { error: 'Employee document sequence numbers are invalid' });
  }
  const sequenceNumbersByResource: Record<string, number> = {};
  for (const [resourceId, value] of Object.entries(requestedSequenceNumbers ?? {})) {
    if (!allowedResourceIds.has(resourceId) || typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      return response(400, { error: 'Employee document sequence numbers are invalid' });
    }
    sequenceNumbersByResource[resourceId] = value;
  }

  const employees = Array.isArray(workspace.data.employees) ? workspace.data.employees : [];
  const archivedEmployees = Array.isArray(workspace.data.archivedEmployees) ? workspace.data.archivedEmployees : [];
  const hasSequenceCollision = (existing: Record<string, unknown>) => Object.entries(sequenceNumbersByResource).some(
    ([resourceId, value]) => Number((existing.sequenceNumbersByResource as Record<string, unknown> | undefined)?.[resourceId]) === value,
  );
  const hasArchivedSequenceCollision = (record: Record<string, unknown>) => {
    const archivedEmployee = record.employee;
    return typeof archivedEmployee === 'object' && archivedEmployee !== null && !Array.isArray(archivedEmployee)
      && hasSequenceCollision(archivedEmployee as Record<string, unknown>);
  };
  if (employees.some((item: Record<string, unknown>) => hasSequenceCollision(item))
    || archivedEmployees.some((record: Record<string, unknown>) => hasArchivedSequenceCollision(record))) {
    return response(409, { error: 'A document sequence number is already assigned to another employee. Refresh the workspace and try again.' });
  }
  const contractNumber = String(employee.contractNumber ?? '').trim();
  if (employees.some((item: Record<string, unknown>) => String(item.email ?? '').toLowerCase() === email)) {
    return response(409, { error: 'This email is already listed in the organization' });
  }
  if (employees.some((item: Record<string, unknown>) => String(item.contractNumber ?? '').trim().toLowerCase() === contractNumber.toLowerCase())) {
    return response(409, { error: 'This contract number is already assigned in the organization' });
  }

  const safeEmployee = {
    id: employeeId,
    orgId: organizationId,
    name: String(employee.name ?? '').trim(),
    email,
    contractNumber,
    position: String(employee.position ?? 'Darbuotojas').trim() || 'Darbuotojas',
    status: 'Pakviestas',
    inviteCount: 1,
    invitedAt: new Date().toISOString(),
    medicalCertificateValidUntil: String(employee.medicalCertificateValidUntil ?? ''),
    resourceIds,
    sequenceNumbersByResource,
    sizes: { shoes: '', clothes: '', pants: '', jacket: '', height: '', weight: '', helmet: '' },
    progressByResource: {},
    testResults: [],
    pin: '',
  };
  if (!safeEmployee.name || !safeEmployee.contractNumber) return response(400, { error: 'Employee name and contract number are required' });

  const { data: existingEmployeeUserId, error: existingEmployeeLookupError } = await adminClient.rpc(
    'find_employee_account_by_email',
    { input_email: email },
  );
  if (existingEmployeeLookupError) {
    return response(500, { error: `Could not check for an existing employee account: ${existingEmployeeLookupError.message}` });
  }

  const currentBatches = Array.isArray(workspace.data.protocolBatches) ? workspace.data.protocolBatches : [];
  const proposedBatches = Array.isArray(body.protocolBatches) ? body.protocolBatches : [];
  const nextBatches = [...currentBatches];
  for (const batch of proposedBatches) {
    if (batch?.orgId !== organizationId || !Array.isArray(batch.employeeIds) || !batch.employeeIds.includes(employeeId)) continue;
    if (!allowedResourceIds.has(String(batch.resourceId ?? ''))) continue;
    const existingIndex = nextBatches.findIndex((item: Record<string, unknown>) => item.id === batch.id);
    if (existingIndex >= 0) {
      const existing = nextBatches[existingIndex];
      nextBatches[existingIndex] = {
        ...existing,
        ...batch,
        employeeIds: [...new Set([...(Array.isArray(existing.employeeIds) ? existing.employeeIds : []), employeeId])],
      };
    } else {
      nextBatches.push({ ...batch, employeeIds: [employeeId] });
    }
  }

  const nextData = {
    ...workspace.data,
    employees: [...employees, safeEmployee],
    protocolBatches: nextBatches,
  };
  const { error: saveError } = await adminClient
    .from('organization_data')
    .update({ data: nextData, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId);
  if (saveError) return response(500, { error: `Could not save employee assignment: ${saveError.message}` });

  let employeeUserId = existingEmployeeUserId;
  let invitedNewAccount = false;
  let setupEmailSent = false;
  if (!employeeUserId) {
    const { data: invitation, error: invitationError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: safeEmployee.name,
        account_type: 'employee',
        employee_needs_password: true,
      },
      redirectTo: redirectUrl.toString(),
    });

    if (invitationError || !invitation.user) {
      await adminClient.from('organization_data').update({ data: workspace.data }).eq('organization_id', organizationId);
      return response(400, { error: invitationError?.message ?? 'Could not create employee account' });
    }
    employeeUserId = invitation.user.id;
    invitedNewAccount = true;
    setupEmailSent = true;
  } else {
    const { data: employeeUserResult, error: employeeUserError } = await adminClient.auth.admin.getUserById(employeeUserId);
    if (employeeUserError || !employeeUserResult.user) {
      await adminClient.from('organization_data').update({ data: workspace.data }).eq('organization_id', organizationId);
      return response(500, { error: `Could not load employee account: ${employeeUserError?.message ?? 'Account was not found'}` });
    }
    try {
      setupEmailSent = await sendEmployeeSetupEmail(adminClient, employeeUserResult.user, email, redirectUrl.toString());
    } catch (error) {
      await adminClient.from('organization_data').update({ data: workspace.data }).eq('organization_id', organizationId);
      const message = error instanceof Error ? error.message : String(error);
      return response(400, { error: `Could not resend employee setup email: ${message}` });
    }
  }

  const { error: accessError } = await adminClient.from('employee_organization_access').upsert({
    organization_id: organizationId,
    user_id: employeeUserId,
    employee_id: employeeId,
  }, { onConflict: 'organization_id,user_id' });

  if (accessError) {
    if (invitedNewAccount) await adminClient.auth.admin.deleteUser(employeeUserId);
    await adminClient.from('organization_data').update({ data: workspace.data }).eq('organization_id', organizationId);
    return response(500, { error: `Could not link employee to this organization: ${accessError.message}` });
  }

  const { data: employeeMemberships, error: membershipsError } = await adminClient.from('organization_memberships')
    .select('organization_id')
    .eq('user_id', employeeUserId)
    .eq('role', 'employee');
  if (membershipsError) {
    await adminClient.from('employee_organization_access').delete().eq('organization_id', organizationId).eq('user_id', employeeUserId);
    if (invitedNewAccount) await adminClient.auth.admin.deleteUser(employeeUserId);
    await adminClient.from('organization_data').update({ data: workspace.data }).eq('organization_id', organizationId);
    return response(500, { error: `Could not check employee organization access: ${membershipsError.message}` });
  }

  if (!employeeMemberships?.length) {
    const { error: membershipError } = await adminClient.from('organization_memberships').insert({
      organization_id: organizationId,
      user_id: employeeUserId,
      role: 'employee',
      employee_id: employeeId,
    });
    if (membershipError) {
      await adminClient.from('employee_organization_access').delete().eq('organization_id', organizationId).eq('user_id', employeeUserId);
      if (invitedNewAccount) await adminClient.auth.admin.deleteUser(employeeUserId);
      await adminClient.from('organization_data').update({ data: workspace.data }).eq('organization_id', organizationId);
      return response(500, { error: `Could not link employee account: ${membershipError.message}` });
    }
  }

  const { error: employeeLinkError } = await adminClient
    .from('organization_employees')
    .update({ auth_user_id: employeeUserId })
    .eq('employee_id', employeeId);
  if (employeeLinkError) {
    await adminClient.from('employee_organization_access').delete().eq('organization_id', organizationId).eq('user_id', employeeUserId);
    if (invitedNewAccount || !employeeMemberships?.length) {
      await adminClient.from('organization_memberships').delete().eq('organization_id', organizationId).eq('user_id', employeeUserId);
    }
    if (invitedNewAccount) {
      await adminClient.auth.admin.deleteUser(employeeUserId);
    }
    await adminClient.from('organization_data').update({ data: workspace.data }).eq('organization_id', organizationId);
    return response(500, { error: `Could not link employee record: ${employeeLinkError.message}` });
  }

  return response(200, { employeeId, email, existingAccount: !invitedNewAccount, invitationEmailSent: setupEmailSent });
});