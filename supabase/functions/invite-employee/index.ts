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

  if (!organizationId || !employee || !/^emp-[a-z0-9-]{10,80}$/i.test(employeeId)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || redirectUrl.origin !== origin) {
    return response(400, { error: 'Employee invitation data is invalid' });
  }

  const { data: canManageOrganization, error: permissionError } = await userClient.rpc(
    'can_manage_organization',
    { target_organization_id: organizationId },
  );
  if (permissionError) return response(500, { error: `Could not check organization management access: ${permissionError.message}` });
  if (!canManageOrganization) return response(403, { error: 'Organization management access is required to invite employees' });

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

  const { error: membershipError } = await adminClient.from('organization_memberships').insert({
    organization_id: organizationId,
    user_id: invitation.user.id,
    role: 'employee',
    employee_id: employeeId,
  });

  if (membershipError) {
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    await adminClient.from('organization_data').update({ data: workspace.data }).eq('organization_id', organizationId);
    return response(500, { error: `Could not link employee account: ${membershipError.message}` });
  }

  const { error: employeeLinkError } = await adminClient
    .from('organization_employees')
    .update({ auth_user_id: invitation.user.id })
    .eq('employee_id', employeeId);
  if (employeeLinkError) {
    await adminClient.from('organization_memberships').delete().eq('organization_id', organizationId).eq('user_id', invitation.user.id);
    await adminClient.auth.admin.deleteUser(invitation.user.id);
    await adminClient.from('organization_data').update({ data: workspace.data }).eq('organization_id', organizationId);
    return response(500, { error: `Could not link employee record: ${employeeLinkError.message}` });
  }

  return response(200, { employeeId, email });
});