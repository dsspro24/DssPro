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
  const canManageWorkspace = body.canManageWorkspace === true;
  if (!organizationId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
    return response(403, { error: 'Kviesti DSS specialistą gali tik įmonės vadovas.' });
  }

  const { data: workspace, error: workspaceError } = await adminClient
    .from('organization_data')
    .select('data')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (workspaceError || !workspace?.data) return response(409, { error: 'Įmonės darbo srities duomenys dar neišsaugoti.' });

  const { data: specialistMatches, error: specialistLookupError } = await adminClient.rpc('lookup_registered_dss_specialist', {
    input_email: email,
  });
  if (specialistLookupError) return response(500, { error: `Registruotų DSS specialistų rasti nepavyko: ${specialistLookupError.message}` });
  const registeredSpecialist = specialistMatches?.[0];
  if (!registeredSpecialist) {
    return response(404, { error: 'Registruotas DSS specialistas šiuo el. paštu nerastas. Patikrinkite el. paštą arba įsitikinkite, kad asmuo yra užsiregistravęs kaip DSS specialistas.' });
  }
  const specialistUser = {
    id: String(registeredSpecialist.user_id),
    email: String(registeredSpecialist.email ?? email),
  };

  const { data: existingMembership, error: membershipLookupError } = await adminClient
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', specialistUser.id)
    .maybeSingle();
  if (membershipLookupError) return response(500, { error: `Patikrinti specialisto priskyrimo įmonei nepavyko: ${membershipLookupError.message}` });
  if (existingMembership) {
    return response(409, { error: existingMembership.role === 'dss_specialist'
      ? 'Šis DSS specialistas jau priskirtas šiai įmonei.'
      : 'Ši paskyra įmonėje jau turi kitą vaidmenį.' });
  }

  const fullName = String(registeredSpecialist.full_name ?? '');
  const organization = workspace.data.organizations?.find((item: Record<string, unknown>) => item.id === organizationId);
  if (!organization) return response(404, { error: 'Įmonės darbo sritis nerasta.' });

  const { data: existingInvitation, error: existingInvitationError } = await adminClient
    .from('dss_specialist_invitations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('specialist_user_id', specialistUser.id)
    .in('status', ['pending', 'accepted'])
    .maybeSingle();
  if (existingInvitationError) return response(500, { error: `Patikrinti esamą DSS specialisto kvietimą nepavyko: ${existingInvitationError.message}` });
  if (existingInvitation) {
    return response(409, { error: 'Šis DSS specialistas jau pakviestas į šią įmonę arba jai priskirtas.' });
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
  if (invitationError) return response(500, { error: `Išsaugoti DSS specialisto kvietimą nepavyko: ${invitationError.message}` });

  return response(200, {
    invitationId: invitation.id,
    userId: specialistUser.id,
    fullName,
    email,
    organizationName: String(organization.name ?? ''),
    canManageWorkspace,
    invited: false,
    status: 'pending',
  });
});