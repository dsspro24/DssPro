import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Building2, LogIn, LogOut, UserPlus } from 'lucide-react';
import { supabase } from './lib/supabase.js';

const LocalWorkspace = lazy(() => import('./LocalWorkspace.jsx'));

function WorkspaceLoading() {
  return <main className="grid min-h-screen place-items-center bg-slate-100 px-4"><p className="text-sm text-slate-600">Įkeliama darbo sritis…</p></main>;
}

function getWorkspaceStatus(workspace) {
  if (workspace?.requiresEmployeePassword) return 'employee-password-needed';
  if (workspace?.requiresSigningPin) return 'pin-needed';
  if (workspace?.requiresDssSpecialist) return 'dss-specialist';
  if (workspace?.requiresEmployee) return 'employee-account';
  if (workspace?.requiresOrganization) return 'organization-needed';
  return workspace ? 'ready' : 'organization-needed';
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeProtocolCommissionTasks(tasks = [], organizationId = null) {
  return tasks.map((task) => {
    const commissionAssignments = task.commissionAssignments ?? task.commission_assignments ?? [];
    const employeeId = task.employeeId ?? task.employee_id;
    const role = task.role;
    const currentAssignment = commissionAssignments.find((assignment) =>
      (assignment.employeeId ?? assignment.employee_id) === employeeId && assignment.role === role);
    const assignmentId = [task.assignmentId, task.assignment_id, currentAssignment?.id, currentAssignment?.assignment_id]
      .find(isUuid);
    return {
      ...task,
      organizationId: task.organizationId ?? task.organization_id ?? organizationId,
      employeeId,
      assignmentId,
      batchId: task.batchId ?? task.batch_id,
      commissionAssignments,
    };
  });
}

async function hydrateResourceAssets(resources = []) {
  return Promise.all(resources.map(async (resource) => {
    if (!resource || typeof resource !== 'object') return resource;
    const hydrated = { ...resource };
    const imageUrl = hydrated.imageUrl ?? (typeof hydrated.image === 'string' && !hydrated.image.startsWith('data:') ? hydrated.image : null);
    if (imageUrl) {
      hydrated.imageUrl = imageUrl;
      hydrated.image = imageUrl;
    }
    return hydrated;
  }));
}

async function hydrateWorkspaceAssets(workspace) {
  if (!workspace || typeof workspace !== 'object') return workspace;
  const resources = await hydrateResourceAssets(workspace.resources ?? []);
  const archivedEmployees = await Promise.all((workspace.archivedEmployees ?? []).map(async (record) => ({
    ...record,
    resources: await hydrateResourceAssets(record.resources ?? []),
    signatures: record.signatures ?? [],
  })));
  return {
    ...workspace,
    resources,
    signatures: workspace.signatures ?? [],
    aapIssuances: workspace.aapIssuances ?? [],
    commissionInvitations: workspace.commissionInvitations ?? [],
    protocolCommissionSignatures: workspace.protocolCommissionSignatures ?? [],
    archivedEmployees,
  };
}

function scopeWorkspaceToOrganization(workspace, organizationId) {
  if (!workspace || !organizationId) return workspace;
  const organizations = (workspace.organizations ?? []).filter((organization) => organization.id === organizationId);
  const specialistIds = new Set(organizations.flatMap((organization) => organization.dss ?? []));
  return {
    ...workspace,
    organizations,
    employees: (workspace.employees ?? []).filter((employee) => employee.orgId === organizationId),
    signatures: (workspace.signatures ?? []).filter((signature) => signature.orgId === organizationId),
    protocolBatches: (workspace.protocolBatches ?? []).filter((batch) => batch.orgId === organizationId),
    aapIssuances: (workspace.aapIssuances ?? []).filter((issuance) => issuance.orgId === organizationId),
    commissionAssignments: (workspace.commissionAssignments ?? []).filter((assignment) => assignment.organizationId === organizationId),
    commissionInvitations: (workspace.commissionInvitations ?? []).filter((invitation) => invitation.organizationId === organizationId),
    protocolCommissionSignatures: (workspace.protocolCommissionSignatures ?? []).filter((signature) => signature.orgId === organizationId),
    subscriptions: (workspace.subscriptions ?? []).filter((subscription) => subscription.orgId === organizationId),
    specialists: (workspace.specialists ?? []).filter((specialist) => specialistIds.has(specialist.id)),
    dssInvitations: (workspace.dssInvitations ?? []).filter((invitation) => invitation.organization_id === organizationId),
    dssOrganizationRequests: (workspace.dssOrganizationRequests ?? []).filter((request) => request.organization_id === organizationId),
  };
}

async function loadOrganizationWorkspace(organizationId, sharedResources = []) {
  const [
    { data: workspace, error: workspaceError },
    { data: organizationDocuments, error: documentsError },
  ] = await Promise.all([
    supabase.rpc('get_organization_workspace_metadata', { input_organization_id: organizationId }),
    supabase.from('organization_documents')
      .select('document_id, payload')
      .eq('organization_id', organizationId)
      .eq('active', true),
  ]);
  if (workspaceError) throw workspaceError;
  if (documentsError) throw documentsError;

  const mapDocuments = (documents, resourceOrganizationId = '') => documents.map((document) => {
    if (!document.payload || typeof document.payload !== 'object' || Array.isArray(document.payload)) {
      throw new Error(`Dokumento ${document.document_id} duomenys netinkami.`);
    }
    return {
      ...document.payload,
      id: document.document_id,
      ...(resourceOrganizationId ? { organizationId: resourceOrganizationId } : {}),
    };
  });
  const catalogResources = sharedResources.filter((resource) => resource && !resource.organizationId);
  let sharedCatalogResources = catalogResources;
  if (!catalogResources.length) {
    const { data: sharedDocuments, error: sharedDocumentsError } = await supabase.from('organization_documents')
      .select('document_id, payload')
      .is('organization_id', null)
      .eq('active', true);
    if (sharedDocumentsError) throw sharedDocumentsError;
    sharedCatalogResources = mapDocuments(sharedDocuments ?? []);
  }

  const scopedWorkspace = scopeWorkspaceToOrganization(workspace, organizationId);
  return scopedWorkspace
    ? {
      ...scopedWorkspace,
      resources: [
        ...sharedCatalogResources,
        ...mapDocuments(organizationDocuments ?? [], organizationId),
      ],
    }
    : null;
}

async function loadManagerWorkspace(user) {
  const [{ data: isCreator, error: creatorError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.rpc('is_creator'),
    supabase.from('profiles').select('full_name, account_type').eq('id', user.id).maybeSingle(),
  ]);
  if (creatorError) throw creatorError;
  if (profileError) throw profileError;
  const managerName = profile?.full_name ?? user.user_metadata?.full_name ?? '';
  const companyDetails = {
    companyName: user.user_metadata?.company_name ?? '',
    companyCode: user.user_metadata?.company_code ?? '',
    companyPlanCode: user.user_metadata?.plan_code === 'pro' ? 'pro' : 'standard',
  };

  if (['employee', 'dss_specialist'].includes(profile?.account_type) && user.user_metadata?.employee_needs_password) {
    return { requiresEmployeePassword: true, managerName };
  }

  if (isCreator) {
    const [organizationsResult, catalogResult, accountsResult, subscriptionsResult] = await Promise.all([
      supabase.from('organizations').select('id, name, company_code').order('name'),
      supabase.from('creator_workspace_data').select('data').eq('id', true).maybeSingle(),
      supabase.rpc('creator_list_accounts'),
      supabase.from('organization_data').select('organization_id, subscriptions:data->subscriptions'),
    ]);
    if (organizationsResult.error) throw organizationsResult.error;
    if (catalogResult.error) throw catalogResult.error;
    if (accountsResult.error) throw accountsResult.error;
    if (subscriptionsResult.error) throw subscriptionsResult.error;
    const hydratedCatalog = await hydrateWorkspaceAssets(catalogResult.data?.data ?? null);
    const organizations = organizationsResult.data.map((organization) => ({
      id: organization.id,
      name: organization.name,
      companyCode: organization.company_code ?? '',
    }));
    const subscriptions = subscriptionsResult.data.flatMap((workspace) => workspace.subscriptions ?? []);

    return {
      creator: true,
      managerName,
      catalog: hydratedCatalog,
      creatorAccounts: accountsResult.data ?? [],
      data: {
        organizations,
        employees: [],
        archivedEmployees: [],
        protocolBatches: [],
        specialists: [],
        signatures: [],
        resources: hydratedCatalog?.resources ?? [],
        resourceTypes: hydratedCatalog?.resourceTypes ?? ['Testas', 'Žurnalas', 'Kortelė', 'Protokolas'],
        subscriptions,
      },
    };
  }

  const [
    { data: signingPinConfigured, error: pinError },
    membershipsResult,
  ] = await Promise.all([
    supabase.rpc('has_signing_pin'),
    supabase.from('organization_memberships')
      .select('organization_id, role, employee_id, can_manage_workspace')
      .eq('user_id', user.id),
  ]);
  if (pinError) throw pinError;
  if (!signingPinConfigured) return { requiresSigningPin: true, managerName, ...companyDetails };
  const { data: memberships, error: membershipError } = membershipsResult;
  if (membershipError) throw membershipError;
  if (profile?.account_type === 'dss_specialist') {
    const dssMemberships = memberships.filter((membership) => membership.role === 'dss_specialist');
    const organizationIds = dssMemberships.map((membership) => membership.organization_id);
    const [organizationsResult, catalogResult, invitationsResult, requestsResult] = await Promise.all([
      organizationIds.length
        ? supabase.from('organizations').select('id, name, company_code').in('id', organizationIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('creator_workspace_data').select('data').eq('id', true).maybeSingle(),
      supabase.from('dss_specialist_invitations')
        .select('id, organization_id, organization_name, invited_email, invited_name, created_at')
        .eq('specialist_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase.from('dss_organization_requests')
        .select('id, organization_id, organization_name, specialist_user_id, specialist_name, specialist_email, status, created_at')
        .eq('specialist_user_id', user.id)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: true }),
    ]);
    if (organizationsResult.error) throw organizationsResult.error;
    if (catalogResult.error) throw catalogResult.error;
    if (invitationsResult.error) throw invitationsResult.error;
    if (requestsResult.error) throw requestsResult.error;
    const { data: commissionInvitations, error: commissionInvitationsError } = await supabase.rpc('get_account_commission_invitations');
    if (commissionInvitationsError) throw commissionInvitationsError;
    const hydratedCatalog = await hydrateWorkspaceAssets(catalogResult.data?.data ?? null);
    const organizations = (organizationsResult.data ?? []).map((organization) => {
      const membership = dssMemberships.find((item) => item.organization_id === organization.id);
      return {
        id: organization.id,
        name: organization.name,
        companyCode: organization.company_code ?? '',
        dss: [user.id],
        resources: [],
        canManageWorkspace: membership?.can_manage_workspace === true,
      };
    });

    return {
      dss: true,
      managerName,
      data: {
        organizations,
        dssInvitations: invitationsResult.data ?? [],
        dssOrganizationRequests: requestsResult.data ?? [],
        commissionInvitations: commissionInvitations ?? [],
        employees: [],
        archivedEmployees: [],
        protocolBatches: [],
        commissionAssignments: [],
        protocolCommissionSignatures: [],
        specialists: [{ id: user.id, name: managerName, email: user.email ?? '', status: 'Paskyra patvirtinta' }],
        signatures: [],
        resources: (hydratedCatalog?.resources ?? []).filter((resource) => !resource.organizationId),
        resourceTypes: hydratedCatalog?.resourceTypes ?? ['Testas', 'Žurnalas', 'Kortelė', 'Protokolas'],
        subscriptions: [],
      },
    };
  }

  if (profile?.account_type === 'employee') {
    const employeeMembership = memberships.find((membership) => membership.role === 'employee');
    if (!employeeMembership) return { requiresEmployee: true, managerName };
    const [
      { data: employeeWorkspace, error: employeeWorkspaceError },
      { data: aapIssuances, error: aapIssuancesError },
      { data: commissionInvitations, error: commissionInvitationsError },
      { data: commissionTasks, error: commissionTasksError },
      { data: commissionStatus, error: commissionStatusError },
      { data: employeeSequenceNumber, error: employeeSequenceNumberError },
    ] = await Promise.all([
      supabase.rpc('get_employee_workspace'),
      supabase.rpc('get_employee_aap_issuances'),
      supabase.rpc('get_employee_commission_invitations'),
      supabase.rpc('get_employee_protocol_commission_tasks'),
      supabase.rpc('get_employee_protocol_commission_status'),
      supabase.rpc('get_employee_sequence_number'),
    ]);
    if (employeeWorkspaceError) throw employeeWorkspaceError;
    if (aapIssuancesError) throw aapIssuancesError;
    if (commissionInvitationsError) throw commissionInvitationsError;
    if (commissionTasksError) throw commissionTasksError;
    if (commissionStatusError && commissionStatusError.code !== 'PGRST202') throw commissionStatusError;
    if (employeeSequenceNumberError) throw employeeSequenceNumberError;
    const normalizedCommissionTasks = normalizeProtocolCommissionTasks(
      commissionTasks ?? [],
      employeeWorkspace.organization?.id ?? employeeMembership.organization_id,
    );
    const employeeCommissionAssignments = [...new Map([
      ...normalizedCommissionTasks.flatMap((task) => task.commissionAssignments ?? []),
      ...(commissionStatus?.commissionAssignments ?? []),
    ].map((assignment) => [`${assignment.batchId ?? ''}:${assignment.id ?? assignment.assignment_id}`, assignment])).values()];
    const employeeProtocolSignatures = [...new Map([
      ...normalizedCommissionTasks.flatMap((task) => task.protocolCommissionSignatures ?? []),
      ...(commissionStatus?.protocolCommissionSignatures ?? []),
    ].map((signature) => [signature.id, signature])).values()];
    const employeeData = await hydrateWorkspaceAssets({
      ...employeeWorkspace.data,
      employees: employeeWorkspace.data.employees.map((employee) => ({ ...employee, sequenceNumber: employeeSequenceNumber })),
      aapIssuances: aapIssuances ?? [],
      commissionInvitations: commissionInvitations ?? [],
      commissionTasks: normalizedCommissionTasks,
      commissionAssignments: employeeCommissionAssignments,
      protocolCommissionSignatures: employeeProtocolSignatures,
    });
    return {
      employee: true,
      managerName,
      organization: employeeWorkspace.organization,
      data: {
        ...employeeData,
        resources: (employeeData.resources ?? []).map((resource) => ({
          ...resource,
          questions: (resource.questions ?? []).map((question) => {
            const safeQuestion = { ...question };
            safeQuestion.multipleAnswers = Array.isArray(question.correctIndices) || question.multipleAnswers === true;
            delete safeQuestion.correctIndex;
            delete safeQuestion.correctIndices;
            return safeQuestion;
          }),
        })),
      },
    };
  }

  const managerMembership = memberships.find((membership) => membership.role === 'manager');
  if (!managerMembership) return { requiresOrganization: true, managerName, ...companyDetails };
  const organizationId = managerMembership.organization_id;

  const { data: catalogData, error: catalogError } = await supabase
    .from('creator_workspace_data').select('data').eq('id', true).maybeSingle();
  if (catalogError) throw catalogError;
  const [savedWorkspace, invitationsResult, requestsResult, organizationSettingsResult] = await Promise.all([
    loadOrganizationWorkspace(organizationId, catalogData?.data?.resources ?? []),
    supabase.from('dss_specialist_invitations')
      .select('id, organization_id, organization_name, specialist_user_id, invited_email, invited_name, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase.from('dss_organization_requests')
      .select('id, organization_id, organization_name, specialist_user_id, specialist_name, specialist_email, status, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase.from('organizations')
      .select('dss_requests_enabled')
      .eq('id', organizationId)
      .single(),
  ]);
  const { data: dssInvitations, error: dssInvitationsError } = invitationsResult;
  if (dssInvitationsError) throw dssInvitationsError;
  const { data: dssOrganizationRequests, error: dssOrganizationRequestsError } = requestsResult;
  if (dssOrganizationRequestsError) throw dssOrganizationRequestsError;
  const { data: organizationSettings, error: organizationSettingsError } = organizationSettingsResult;
  if (organizationSettingsError) throw organizationSettingsError;
  const savedOrganization = savedWorkspace?.organizations?.find((item) => item.id === organizationId);
  const organization = {
    id: organizationId,
    name: savedOrganization?.name ?? companyDetails.companyName,
    company_code: savedOrganization?.companyCode ?? companyDetails.companyCode,
  };
  const hydratedWorkspace = await hydrateWorkspaceAssets(savedWorkspace);
  const hydratedCatalog = await hydrateWorkspaceAssets(catalogData?.data ?? null);
  const hydratedManagerWorkspace = await hydrateWorkspaceAssets({
    ...hydratedWorkspace,
    commissionAssignments: [],
    protocolCommissionSignatures: [],
  });

  return {
    organization,
    initializeCreatorDefaults: !savedWorkspace,
    managerName,
    catalog: hydratedCatalog,
    data: {
      ...hydratedManagerWorkspace,
      organizations: (hydratedManagerWorkspace.organizations ?? []).map((item) => item.id === organizationId
        ? { ...item, dssRequestsEnabled: organizationSettings.dss_requests_enabled }
        : item),
      dssInvitations: dssInvitations ?? [],
      dssOrganizationRequests: dssOrganizationRequests ?? [],
    },
  };
}

async function invokeCreatorAssetMigration(body) {
  let result = await supabase.functions.invoke('creator-migrate-assets', { body });
  const status = result.error?.context instanceof Response ? result.error.context.status : null;
  if (!result.error || status !== 401) return result;

  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    return {
      data: null,
      error: new Error('Prisijungimo sesija nebegalioja. Atsijunkite ir prisijunkite iš naujo, tada bandykite dar kartą.'),
    };
  }

  result = await supabase.functions.invoke('creator-migrate-assets', {
    body,
    headers: { Authorization: `Bearer ${data.session.access_token}` },
  });
  return result;
}

export default function CloudEntry({ onExit, onBackToLanding }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [signupRole, setSignupRole] = useState('manager');
  const [workspace, setWorkspace] = useState(null);
  const [creatorPreview, setCreatorPreview] = useState(null);
  const [creatorPreviewLoading, setCreatorPreviewLoading] = useState(false);
  const [workspaceStatus, setWorkspaceStatus] = useState('idle');
  const [workspaceLoadAttempt, setWorkspaceLoadAttempt] = useState(0);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '', signingPin: '', confirmSigningPin: '', companyName: '', companyCode: '' });
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const assetMigrationStartedFor = useRef('');

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setWorkspace(null);
        setWorkspaceStatus('idle');
      }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setErrorMessage(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return undefined;

    let active = true;
    loadManagerWorkspace(session.user)
      .then((loadedWorkspace) => {
        if (!active) return;
        setWorkspace(loadedWorkspace);
        setWorkspaceStatus(getWorkspaceStatus(loadedWorkspace));
        if (loadedWorkspace?.companyName) {
          setForm((current) => ({ ...current, companyName: loadedWorkspace.companyName, companyCode: loadedWorkspace.companyCode }));
        }
      })
      .catch((error) => {
        if (!active) return;
        const isNetworkError = error instanceof TypeError || /failed to fetch/i.test(error.message ?? '');
        setErrorMessage(isNetworkError
          ? 'Nepavyko susisiekti su DSS Pro serveriu. Patikrinkite interneto ryšį ir bandykite dar kartą.'
          : error.message || 'Nepavyko įkelti įmonės duomenų.');
        setWorkspaceStatus('error');
      });

    return () => { active = false; };
  }, [session, workspaceLoadAttempt]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || workspaceStatus !== 'ready' || !workspace) return undefined;
    const migrationKey = `${userId}:${workspace.creator ? 'catalog' : 'member'}`;
    if (assetMigrationStartedFor.current === migrationKey) return undefined;
    assetMigrationStartedFor.current = migrationKey;
    let active = true;
    supabase.functions.invoke('creator-migrate-assets', {
      body: workspace.creator ? { catalogOnly: true } : {},
    }).then(({ error }) => {
      if (error && active) setNotice(`Fono failų atnaujinti nepavyko: ${error.message}`);
    }).catch((error) => {
      if (active) setNotice(`Fono failų atnaujinti nepavyko: ${error.message || 'įvyko klaida.'}`);
    });
    return () => { active = false; };
  }, [session?.user?.id, workspaceStatus, workspace]);

  const handleAuth = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setNotice('');
    setSubmitting(true);
    try {
      if (authMode === 'signup') {
        if (!/^\d{4}$/.test(form.signingPin) || form.signingPin !== form.confirmSigningPin) {
          throw new Error('Pasirašymo PIN turi būti 4 skaitmenys, o abu įrašai turi sutapti.');
        }
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: {
              full_name: form.fullName.trim(),
              account_type: signupRole,
              ...(signupRole === 'manager' ? {
                company_name: form.companyName.trim(),
                company_code: form.companyCode.trim(),
                plan_code: 'standard',
              } : { plan_code: 'free' }),
              signing_pin: form.signingPin,
            },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.session) {
          const loadedWorkspace = await loadManagerWorkspace(data.session.user);
          setSession(data.session);
          setWorkspace(loadedWorkspace);
          setWorkspaceStatus(getWorkspaceStatus(loadedWorkspace));
        } else {
          setNotice('Paskyra sukurta. Patvirtinkite el. paštą ir prisijunkite; PIN nustatymas bus užbaigtas prieš įmonės kūrimą.');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (error) throw error;
        setSession(data.session);
      }
    } catch (error) {
      const message = error.message?.toLowerCase() ?? '';
      setErrorMessage(error.code === 'email_not_confirmed' || message.includes('email not confirmed')
        ? 'Prieš prisijungdami patvirtinkite el. paštą. Patikrinkite gautuosius ir brukalo aplanką.'
        : error.message || 'Nepavyko prisijungti. Patikrinkite duomenis ir bandykite dar kartą.');
    } finally {
      setSubmitting(false);
    }
  };

  const finishSigningPinSetup = async (event) => {
    event.preventDefault();
    if (!session?.user) return;
    setErrorMessage('');
    if (!/^\d{4}$/.test(form.signingPin) || form.signingPin !== form.confirmSigningPin) {
      setErrorMessage('Pasirašymo PIN turi būti 4 skaitmenys, o abu įrašai turi sutapti.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('set_signing_pin', { input_pin: form.signingPin });
      if (error) throw error;
      const loadedWorkspace = await loadManagerWorkspace(session.user);
      setWorkspace(loadedWorkspace);
      setWorkspaceStatus(getWorkspaceStatus(loadedWorkspace));
      if (loadedWorkspace?.companyName) {
        setForm((current) => ({ ...current, companyName: loadedWorkspace.companyName, companyCode: loadedWorkspace.companyCode }));
      }
      setForm((current) => ({ ...current, signingPin: '', confirmSigningPin: '' }));
    } catch (error) {
      setErrorMessage(error.message || 'Nepavyko nustatyti pasirašymo PIN.');
    } finally {
      setSubmitting(false);
    }
  };

  const finishEmployeePasswordSetup = async (event) => {
    event.preventDefault();
    if (form.password.length < 8 || form.password !== form.confirmPassword) {
      setErrorMessage('Slaptažodis turi būti bent 8 simbolių, o abu įrašai turi sutapti.');
      return;
    }
    setErrorMessage('');
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: form.password,
        data: { employee_needs_password: false },
      });
      if (error) throw error;
      const updatedUser = data.user ?? session?.user;
      if (!updatedUser) throw new Error('Nepavyko patvirtinti darbuotojo paskyros.');
      const loadedWorkspace = await loadManagerWorkspace(updatedUser);
      setSession((current) => current ? { ...current, user: updatedUser } : current);
      setWorkspace(loadedWorkspace);
      setWorkspaceStatus(getWorkspaceStatus(loadedWorkspace));
      setForm((current) => ({ ...current, password: '', confirmPassword: '' }));
    } catch (error) {
      setErrorMessage(error.message || 'Nepavyko nustatyti slaptažodžio.');
    } finally {
      setSubmitting(false);
    }
  };

  const createOrganization = async (event) => {
    event.preventDefault();
    if (!session?.user) return;
    setErrorMessage('');
    setSubmitting(true);
    try {
      const { data: organizationId, error } = await supabase.rpc('create_organization', {
        organization_name: form.companyName.trim(),
        organization_code: form.companyCode.trim() || null,
      });
      if (error) throw error;
      const { data: organization, error: organizationError } = await supabase
        .from('organizations')
        .select('id, name, company_code')
        .eq('id', organizationId)
        .single();
      if (organizationError) throw organizationError;
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
      setWorkspace({
        organization: { ...organization, plan_code: session.user.user_metadata?.plan_code === 'pro' ? 'pro' : 'standard' },
        managerName: profile?.full_name ?? session.user.user_metadata?.full_name ?? '',
        data: null,
      });
      setWorkspaceStatus('ready');
    } catch (error) {
      setErrorMessage(error.message || 'Nepavyko sukurti įmonės.');
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = () => {
    setWorkspace(null);
    setCreatorPreview(null);
    setWorkspaceStatus('idle');
    setSession(null);
    setForm({ fullName: '', email: '', password: '', confirmPassword: '', signingPin: '', confirmSigningPin: '', companyName: '', companyCode: '' });
    onExit?.();
    void supabase.auth.signOut().then(({ error }) => {
      if (error) console.error('Could not complete sign out.', error);
    }).catch((error) => console.error('Could not complete sign out.', error));
  };

  const refreshCreatorWorkspace = async ({ exitPreview = false } = {}) => {
    if (!session?.user) return;
    const loadedWorkspace = await loadManagerWorkspace(session.user);
    setWorkspace(loadedWorkspace);
    setWorkspaceStatus(getWorkspaceStatus(loadedWorkspace));
    if (exitPreview) setCreatorPreview(null);
  };

  const refreshSignedInWorkspace = async () => {
    if (!session?.user) return null;
    const loadedWorkspace = await loadManagerWorkspace(session.user);
    setWorkspace(loadedWorkspace);
    setWorkspaceStatus(getWorkspaceStatus(loadedWorkspace));
    return loadedWorkspace;
  };

  const openCreatorPreview = async (organizationId, role) => {
    setErrorMessage('');
    setCreatorPreviewLoading(true);
    try {
      const { error: assetMigrationError } = await invokeCreatorAssetMigration({ organizationId });
      if (assetMigrationError) {
        const details = assetMigrationError.context instanceof Response
          ? await assetMigrationError.context.clone().json().catch(() => null)
          : null;
        throw new Error(`Nepavyko paruošti įmonės failų: ${details?.error ?? assetMigrationError.message}`);
      }
      const { data: savedWorkspace, error } = await supabase
        .from('organization_data')
        .select('data')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      const data = await hydrateWorkspaceAssets(savedWorkspace?.data ?? null);
      setCreatorPreview({ organizationId, role, data });
    } catch (error) {
      setErrorMessage(`Įmonės darbo vietos įkelti nepavyko: ${error.message}`);
      window.alert(`Įmonės darbo vietos įkelti nepavyko: ${error.message}`);
    } finally {
      setCreatorPreviewLoading(false);
    }
  };

  const loadDssOrganization = useCallback(async (organizationId) => {
    const organizationSummary = workspace?.data.organizations.find((item) => item.id === organizationId);
    if (!organizationSummary || !organizationSummary.dss?.includes(session?.user.id)) {
      throw new Error('Neturite prieigos prie šios įmonės.');
    }

    const [
      { data: currentMembership, error: currentMembershipError },
      savedWorkspace,
      { data: assignments, error: assignmentsError },
      { data: protocolSignatures, error: protocolSignaturesError },
    ] = await Promise.all([
      supabase.from('organization_memberships')
        .select('can_manage_workspace')
        .eq('organization_id', organizationId)
        .eq('user_id', session.user.id)
        .eq('role', 'dss_specialist')
        .maybeSingle(),
      loadOrganizationWorkspace(organizationId, workspace.data.resources ?? []),
      supabase.rpc('get_organization_commission_assignments', { input_organization_id: organizationId }),
      supabase.rpc('get_organization_protocol_commission_signatures', { input_organization_id: organizationId }),
    ]);
    if (currentMembershipError) throw currentMembershipError;
    if (!currentMembership) throw new Error('Neturite prieigos prie šios įmonės.');
    if (assignmentsError) throw assignmentsError;
    if (protocolSignaturesError) throw protocolSignaturesError;
    if (!savedWorkspace) throw new Error('Įmonės darbo sritis dar nesukurta.');

    const storedWorkspace = savedWorkspace;
    const savedOrganization = storedWorkspace.organizations?.find((item) => item.id === organizationId);
    if (!savedOrganization) throw new Error('Įmonės nustatymai nerasti.');
    const hydratedWorkspace = await hydrateWorkspaceAssets(storedWorkspace);
    const hydratedAssignments = (assignments ?? []).map((assignment) => ({
      ...assignment,
      signaturePath: assignment.consentSignaturePath,
    }));
    const hydratedProtocolSignatures = protocolSignatures ?? [];
    const organization = {
      ...organizationSummary,
      ...savedOrganization,
      id: organizationId,
      name: organizationSummary.name,
      companyCode: organizationSummary.companyCode,
      dss: [...new Set([...(savedOrganization.dss ?? []), session.user.id])],
      canManageWorkspace: currentMembership.can_manage_workspace === true,
    };
    const globalResources = workspace.catalog?.resources?.filter((resource) => !resource.organizationId) ?? [];
    const resourcesById = new Map(globalResources.map((resource) => [resource.id, resource]));
    for (const resource of hydratedWorkspace.resources ?? []) resourcesById.set(resource.id, resource);

    return {
      organization,
      data: {
        employees: hydratedWorkspace.employees ?? [],
        archivedEmployees: [],
        protocolBatches: hydratedWorkspace.protocolBatches ?? [],
        commissionAssignments: hydratedAssignments,
        protocolCommissionSignatures: hydratedProtocolSignatures,
        signatures: hydratedWorkspace.signatures ?? [],
        resources: [...resourcesById.values()],
      },
    };
  }, [session, workspace]);

  if (!authReady) {
    return <main className="grid min-h-screen place-items-center bg-slate-100 px-4"><p className="text-sm text-slate-600">Tikrinama prisijungimo būsena…</p></main>;
  }
  if (session && (workspaceStatus === 'idle' || workspaceStatus === 'loading')) {
    return <main className="grid min-h-screen place-items-center bg-slate-100 px-4"><div role="status" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm"><span className="size-4 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" aria-hidden="true" /><span><strong className="block text-slate-900">Prisijungta</strong><span className="text-slate-500">Kraunama jūsų darbo sritis…</span></span></div></main>;
  }

  if (session && workspaceStatus === 'ready' && workspace) {
    if (workspace.creator && creatorPreviewLoading) {
      return <main className="grid min-h-screen place-items-center bg-slate-100 px-4"><p className="text-sm text-slate-600">Įkeliama pasirinktos įmonės darbo vieta…</p></main>;
    }
    if (workspace.creator && creatorPreview) {
      const sourceData = creatorPreview.data;
      const listedOrganization = workspace.data.organizations.find((item) => item.id === creatorPreview.organizationId);
      const organizationMemberships = workspace.creatorAccounts.flatMap((account) => (account.organizations ?? [])
        .filter((membership) => membership.id === creatorPreview.organizationId)
        .map((membership) => ({ ...account, membership })));
      const savedOrganization = sourceData?.organizations?.find((item) => item.id === creatorPreview.organizationId);
      const sourceOrganization = listedOrganization && {
        ...savedOrganization,
        ...listedOrganization,
        manager: organizationMemberships.find((account) => account.membership.role === 'manager')?.fullName ?? savedOrganization?.manager ?? '',
        dss: organizationMemberships.filter((account) => account.membership.role === 'dss_specialist').map((account) => account.id),
      };
      if (sourceOrganization) {
        const dssId = sourceOrganization.dss?.[0] ?? `creator-preview-${sourceOrganization.id}`;
        const dssSpecialist = sourceData?.specialists?.find((specialist) => specialist.id === dssId)
          ?? { id: dssId, name: 'DSS specialistas (peržiūra)', email: '', status: 'Peržiūra' };
        const previewOrganization = creatorPreview.role === 'dss'
          ? { ...sourceOrganization, dss: [...new Set([...(sourceOrganization.dss ?? []), dssId])] }
          : sourceOrganization;
        const previewData = {
          ...(sourceData ?? {}),
          organizations: [previewOrganization],
          employees: (sourceData?.employees ?? []).filter((employee) => employee.orgId === creatorPreview.organizationId),
          archivedEmployees: (sourceData?.archivedEmployees ?? []).filter((record) => record.orgId === creatorPreview.organizationId),
          protocolBatches: (sourceData?.protocolBatches ?? []).filter((batch) => batch.orgId === creatorPreview.organizationId),
          specialists: creatorPreview.role === 'dss' ? [dssSpecialist] : sourceData?.specialists ?? [],
          signatures: (sourceData?.signatures ?? []).filter((signature) => signature.orgId === creatorPreview.organizationId),
          resources: sourceData?.resources ?? workspace.data.resources,
          resourceTypes: sourceData?.resourceTypes ?? workspace.data.resourceTypes,
          subscriptions: (sourceData?.subscriptions ?? []).filter((subscription) => subscription.orgId === creatorPreview.organizationId),
        };
        return <Suspense fallback={<WorkspaceLoading />}><LocalWorkspace
          key={`creator-preview-${creatorPreview.organizationId}-${creatorPreview.role}`}
          userRole={creatorPreview.role}
          onRoleChange={() => {}}
          onExit={signOut}
          initialCloudData={previewData}
          cloudOrganization={{ id: sourceOrganization.id, name: sourceOrganization.name, company_code: sourceOrganization.companyCode }}
          cloudManagerName={workspace.managerName}
          cloudMode
          cloudUserId={session.user.id}
          creatorReadOnlyPreview={`${sourceOrganization.name} · kaip ${creatorPreview.role === 'vadovas' ? 'vadovas' : 'DSS specialistas'}`}
          onExitCreatorPreview={() => setCreatorPreview(null)}
          onCreatorWorkspaceChanged={() => refreshCreatorWorkspace()}
          onCreatorOrganizationDeleted={() => refreshCreatorWorkspace({ exitPreview: true })}
          onCreatorAccountDeleted={() => refreshCreatorWorkspace()}
        /></Suspense>;
      }
    }
    return <Suspense fallback={<WorkspaceLoading />}><LocalWorkspace
        key={workspace.creator ? 'creator-workspace' : 'signed-in-workspace'}
      userRole={workspace.creator ? 'kurejas' : workspace.employee ? 'darbuotojas' : workspace.dss ? 'dss' : 'vadovas'}
      onRoleChange={() => {}}
      onExit={signOut}
      initialCloudData={workspace.data}
      creatorCatalog={workspace.catalog}
      initializeCreatorDefaults={workspace.initializeCreatorDefaults}
      creatorAccounts={workspace.creatorAccounts}
      onCreatorPreview={openCreatorPreview}
      onCreatorWorkspaceChanged={() => refreshCreatorWorkspace()}
      onCreatorOrganizationDeleted={() => refreshCreatorWorkspace({ exitPreview: true })}
      onCreatorAccountDeleted={() => refreshCreatorWorkspace()}
      cloudOrganization={workspace.organization}
      cloudManagerName={workspace.managerName}
      onLoadDssOrganization={workspace.dss ? loadDssOrganization : undefined}
      onRefreshWorkspace={refreshSignedInWorkspace}
      cloudMode
      cloudUserId={session.user.id}
    /></Suspense>;
  }

  return <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 text-slate-900">
    <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-md bg-emerald-950 text-emerald-200"><Building2 size={21} /></span><div><p className="text-lg font-bold">DSS Pro</p><p className="text-sm text-slate-500">Prisijungimas prie paskyros</p></div></div>
      {session && workspaceStatus === 'employee-password-needed' ? <>
        <h1 className="text-xl font-bold">Susikurkite slaptažodį</h1><p className="mt-1 text-sm text-slate-600">Kvietimo nuoroda patvirtinta. Susikurkite slaptažodį, o kitame žingsnyje nustatykite PIN dokumentams pasirašyti.</p>
        <form onSubmit={finishEmployeePasswordSetup} className="mt-5 space-y-4"><label className="block text-sm font-medium">Naujas slaptažodis<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><label className="block text-sm font-medium">Pakartokite slaptažodį<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" autoComplete="new-password" minLength={8} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required /></label><button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={submitting}><LogIn size={16} />{submitting ? 'Išsaugoma…' : 'Sukurti slaptažodį'}</button></form>
      </> : session && workspaceStatus === 'employee-account' ? <>
        <h1 className="text-xl font-bold">Darbuotojo paskyra</h1><p className="mt-1 text-sm text-slate-600">Prisijungėte kaip darbuotojas. Įmonės DSS dokumentai atsiras, kai vadovas jus pakvies ir priskirs įmonei.</p><button type="button" className="mt-5 w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold" onClick={signOut}>Atsijungti</button>
      </> : session && workspaceStatus === 'dss-specialist' ? <>
        <h1 className="text-xl font-bold">DSS specialisto paskyra</h1><p className="mt-1 text-sm text-slate-600">Jūsų paskyra aktyvi. Šiuo metu neturite prižiūrimų įmonių; galėsite peržiūrėti ir priimti vadovų kvietimus prisijungę šiuo el. paštu: <strong>{session.user.email}</strong>.</p><button type="button" className="mt-5 w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold" onClick={signOut}>Atsijungti</button>
      </> : session && workspaceStatus === 'pin-needed' ? <>
        <h1 className="text-xl font-bold">Nustatykite pasirašymo PIN</h1><p className="mt-1 text-sm text-slate-600">PIN bus naudojamas dokumentams pasirašyti. Jis saugomas užšifruotu hash’u ir niekada nerodomas nustatymuose.</p>
        <form onSubmit={finishSigningPinSetup} className="mt-5 space-y-4"><label className="block text-sm font-medium">4 skaitmenų PIN<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={form.signingPin} onChange={(event) => setForm({ ...form, signingPin: event.target.value })} required /></label><label className="block text-sm font-medium">Pakartokite PIN<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={form.confirmSigningPin} onChange={(event) => setForm({ ...form, confirmSigningPin: event.target.value })} required /></label><button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={submitting}><LogIn size={16} />{submitting ? 'Išsaugoma…' : 'Nustatyti PIN'}</button></form>
      </> : session && workspaceStatus === 'organization-needed' ? <>
        <h1 className="text-xl font-bold">Sukurkite įmonę</h1><p className="mt-1 text-sm text-slate-600">Įmonės duomenys bus atskirti nuo kitų paskyrų.</p><p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Pasirinktas planas: {session.user.user_metadata?.plan_code === 'pro' ? 'Pro · 79 €/mėn.' : 'Standartinis · 29 €/mėn.'}. Mokėjimų integracija dar neprijungta, todėl prenumerata bus laukianti apmokėjimo.</p>
        <form onSubmit={createOrganization} className="mt-5 space-y-4"><label className="block text-sm font-medium">Įmonės pavadinimas<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} required /></label><label className="block text-sm font-medium">Įmonės kodas <span className="font-normal text-slate-500">(neprivaloma)</span><input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={form.companyCode} onChange={(event) => setForm({ ...form, companyCode: event.target.value })} /></label><button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={submitting}><Building2 size={16} />{submitting ? 'Kuriama…' : 'Sukurti įmonę'}</button></form>
      </> : session && workspaceStatus === 'error' ? <>
        <h1 className="text-xl font-bold">Nepavyko atidaryti darbo srities</h1>
        <p className="mt-2 text-sm text-rose-700">{errorMessage}</p>
        <button type="button" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => { setErrorMessage(''); setWorkspaceStatus('idle'); setWorkspaceLoadAttempt((attempt) => attempt + 1); }}>Bandyti dar kartą</button>
        <button type="button" className="mt-3 w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={signOut}>Atsijungti</button>
      </> : <>
        <h1 className="text-xl font-bold">{authMode === 'signup' ? signupRole === 'manager' ? 'Sukurkite vadovo paskyrą' : 'Sukurkite DSS specialisto paskyrą' : 'Prisijunkite'}</h1>{authMode === 'signup' && <p className="mt-1 text-sm text-slate-600">{signupRole === 'manager' ? 'Patvirtinus el. paštą galėsite sukurti įmonės paskyrą.' : 'Patvirtinę el. paštą iškart galėsite naudotis DSS specialisto paskyra. Įmonės duomenų įvesti nereikia; vadovų kvietimus priimsite prisijungę.'}</p>}
        {authMode === 'signup' && <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1 text-xs font-semibold"><button type="button" className={`rounded px-2 py-2 ${signupRole === 'manager' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`} onClick={() => setSignupRole('manager')}>Vadovo paskyra</button><button type="button" className={`rounded px-2 py-2 ${signupRole === 'dss_specialist' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`} onClick={() => setSignupRole('dss_specialist')}>DSS specialisto paskyra</button></div>}
        <form onSubmit={handleAuth} className="mt-5 space-y-4">{authMode === 'signup' && <><label className="block text-sm font-medium">Vardas ir pavardė<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" autoComplete="name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></label></>}<label className="block text-sm font-medium">El. paštas<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label className="block text-sm font-medium">Slaptažodis<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>{authMode === 'signup' && <>{signupRole === 'manager' && <><label className="block text-sm font-medium">Įmonės pavadinimas<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" autoComplete="organization" value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} required /></label><label className="block text-sm font-medium">Įmonės kodas <span className="font-normal text-slate-500">(neprivaloma)</span><input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={form.companyCode} onChange={(event) => setForm({ ...form, companyCode: event.target.value })} /></label></>}<label className="block text-sm font-medium">Pasirašymo PIN (4 skaitmenys)<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={form.signingPin} onChange={(event) => setForm({ ...form, signingPin: event.target.value })} required /></label><label className="block text-sm font-medium">Pakartokite pasirašymo PIN<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={form.confirmSigningPin} onChange={(event) => setForm({ ...form, confirmSigningPin: event.target.value })} required /></label></>}<button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={submitting}>{authMode === 'signup' ? <UserPlus size={16} /> : <LogIn size={16} />}{submitting ? 'Vykdoma…' : authMode === 'signup' ? 'Sukurti paskyrą' : 'Prisijungti'}</button></form>
        {onBackToLanding ? <button type="button" className="mt-4 w-full text-sm font-semibold text-emerald-800 hover:text-emerald-950" onClick={onBackToLanding}>Pasirinkti planą ir registruotis</button>
          : <button type="button" className="mt-4 w-full text-sm font-semibold text-emerald-800 hover:text-emerald-950" onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setErrorMessage(''); setNotice(''); }}>{authMode === 'signup' ? 'Jau turite paskyrą? Prisijunkite' : 'Neturite paskyros? Registruokitės'}</button>}
      </>}
      {notice && <p role="status" className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {errorMessage && workspaceStatus !== 'error' && <p role="alert" className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</p>}
      {session && workspaceStatus !== 'error' && <button type="button" className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900" onClick={signOut}><LogOut size={15} />Atsijungti</button>}
    </section>
  </main>;
}