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
  const { data: { user: manager }, error: authError } = await userClient.auth.getUser();
  if (authError || !manager) return response(401, { error: 'Session is invalid or expired' });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: 'Invalid request body' });
  }

  const organizationId = String(body.organizationId ?? '');
  const email = String(body.email ?? '').trim().toLowerCase();
  const redirectTo = String(body.redirectTo ?? '');
  const canManageWorkspace = body.canManageWorkspace === true;
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(redirectTo);
  } catch {
    return response(400, { error: 'Invalid invitation redirect URL' });
  }
  if (!organizationId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || redirectUrl.origin !== origin) {
    return response(400, { error: 'DSS invitation data is invalid' });
  }

  const [{ data: managerMembership, error: managerMembershipError }, { data: isCreator, error: creatorError }] = await Promise.all([
    userClient
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', manager.id)
      .maybeSingle(),
    userClient.rpc('is_creator'),
  ]);
  if (managerMembershipError || creatorError || (managerMembership?.role !== 'manager' && !isCreator)) {
    return response(403, { error: 'Only an organization manager can invite DSS specialists' });
  }

  const { data: workspace, error: workspaceError } = await adminClient
    .from('organization_data')
    .select('data')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (workspaceError || !workspace?.data) return response(409, { error: 'Organization workspace is not saved yet' });

  let specialistUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;
  let invited = false;
  const { data: listedUsers, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return response(500, { error: `Could not look up the DSS account: ${listError.message}` });
  specialistUser = listedUsers.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;

  if (specialistUser) {
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('full_name, account_type')
      .eq('id', specialistUser.id)
      .maybeSingle();
    if (profileError) return response(500, { error: profileError.message });
    if (profile?.account_type !== 'dss_specialist') {
      return response(409, { error: 'This email already belongs to a different account type' });
    }
  } else {
    const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: email,
        account_type: 'dss_specialist',
        employee_needs_password: true,
      },
      redirectTo: redirectUrl.toString(),
    });
    if (inviteError || !invitation.user) return response(400, { error: inviteError?.message ?? 'Could not send DSS invitation' });
    specialistUser = invitation.user;
    invited = true;
  }

  const { data: existingMembership, error: membershipLookupError } = await adminClient
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', specialistUser.id)
    .maybeSingle();
  if (membershipLookupError) {
    if (invited) await adminClient.auth.admin.deleteUser(specialistUser.id);
    return response(500, { error: `Could not check the existing organization membership: ${membershipLookupError.message}` });
  }
  if (existingMembership) {
    if (invited) await adminClient.auth.admin.deleteUser(specialistUser.id);
    return response(409, { error: existingMembership.role === 'dss_specialist'
      ? 'This DSS specialist is already assigned to this organization'
      : 'This account already has a different role in this organization' });
  }

  const fullName = String(specialistUser.user_metadata?.full_name ?? email);
  const organization = workspace.data.organizations?.find((item: Record<string, unknown>) => item.id === organizationId);
  if (!organization) {
    if (invited) await adminClient.auth.admin.deleteUser(specialistUser.id);
    return response(404, { error: 'Organization workspace was not found' });
  }

  const { data: existingInvitation, error: existingInvitationError } = await adminClient
    .from('dss_specialist_invitations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('specialist_user_id', specialistUser.id)
    .in('status', ['pending', 'accepted'])
    .maybeSingle();
  if (existingInvitationError) {
    if (invited) await adminClient.auth.admin.deleteUser(specialistUser.id);
    return response(500, { error: `Could not check the existing DSS invitation: ${existingInvitationError.message}` });
  }
  if (existingInvitation) {
    if (invited) await adminClient.auth.admin.deleteUser(specialistUser.id);
    return response(409, { error: 'This DSS specialist is already invited to or assigned to this organization' });
  }

  const { data: invitation, error: invitationError } = await adminClient.from('dss_specialist_invitations').insert({
    organization_id: organizationId,
    organization_name: String(organization.name ?? ''),
    specialist_user_id: specialistUser.id,
    invited_email: email,
    invited_name: fullName,
    invited_by: manager.id,
    can_manage_workspace: canManageWorkspace,
    status: 'pending',
  }).select('id').single();
  if (invitationError) {
    if (invited) await adminClient.auth.admin.deleteUser(specialistUser.id);
    return response(500, { error: `Could not save DSS invitation: ${invitationError.message}` });
  }

  return response(200, {
    invitationId: invitation.id,
    userId: specialistUser.id,
    fullName,
    email,
    organizationName: String(organization.name ?? ''),
    canManageWorkspace,
    invited,
    status: 'pending',
  });
});