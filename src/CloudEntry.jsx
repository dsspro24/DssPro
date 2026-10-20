import { useEffect, useState } from 'react';
import { Building2, LogIn, LogOut, UserPlus } from 'lucide-react';
import LocalWorkspace from './LocalWorkspace.jsx';
import { supabase } from './lib/supabase.js';
import { hydrateSignatureImages } from './lib/storageAssets.js';

function getWorkspaceStatus(workspace) {
  if (workspace?.requiresEmployeePassword) return 'employee-password-needed';
  if (workspace?.requiresSigningPin) return 'pin-needed';
  if (workspace?.requiresDssSpecialist) return 'dss-specialist';
  if (workspace?.requiresEmployee) return 'employee-account';
  if (workspace?.requiresOrganization) return 'organization-needed';
  return workspace ? 'ready' : 'organization-needed';
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
    if (!hydrated.html && hydrated.htmlUrl) {
      const result = await fetch(hydrated.htmlUrl);
      if (!result.ok) throw new Error(`Nepavyko įkelti HTML šablono: ${result.status}`);
      hydrated.html = await result.text();
    }
    return hydrated;
  }));
}

async function hydrateWorkspaceAssets(workspace) {
  if (!workspace || typeof workspace !== 'object') return workspace;
  const [resources, signatures, aapIssuances] = await Promise.all([
    hydrateResourceAssets(workspace.resources ?? []),
    hydrateSignatureImages(workspace.signatures ?? []),
    hydrateSignatureImages(workspace.aapIssuances ?? []),
  ]);
  const archivedEmployees = await Promise.all((workspace.archivedEmployees ?? []).map(async (record) => ({
    ...record,
    resources: await hydrateResourceAssets(record.resources ?? []),
    signatures: await hydrateSignatureImages(record.signatures ?? []),
  })));
  return { ...workspace, resources, signatures, aapIssuances, archivedEmployees };
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
  };

  if (['employee', 'dss_specialist'].includes(profile?.account_type) && user.user_metadata?.employee_needs_password) {
    return { requiresEmployeePassword: true, managerName };
  }

  if (isCreator) {
    const { error: assetMigrationError } = await supabase.functions.invoke('creator-migrate-assets', { body: {} });
    if (assetMigrationError) throw new Error(`Nepavyko perkelti senų failų į Storage: ${assetMigrationError.message}`);

    const [organizationsResult, workspacesResult, catalogResult, accountsResult] = await Promise.all([
      supabase.from('organizations').select('id, name, company_code').order('name'),
      supabase.from('organization_data').select('organization_id, data'),
      supabase.from('creator_workspace_data').select('data').eq('id', true).maybeSingle(),
      supabase.rpc('creator_list_accounts'),
    ]);
    if (organizationsResult.error) throw organizationsResult.error;
    if (workspacesResult.error) throw workspacesResult.error;
    if (catalogResult.error) throw catalogResult.error;
    if (accountsResult.error) throw accountsResult.error;

    const hydratedWorkspaces = await Promise.all(workspacesResult.data.map(async (workspace) => [
      workspace.organization_id,
      await hydrateWorkspaceAssets(workspace.data),
    ]));
    const workspaceByOrganization = new Map(hydratedWorkspaces);
    const hydratedCatalog = await hydrateWorkspaceAssets(catalogResult.data?.data ?? null);
    const resourcesById = new Map();
    const subscriptionsById = new Map();
    for (const workspaceData of workspaceByOrganization.values()) {
      for (const resource of workspaceData?.resources ?? []) {
        if (!resource.organizationId) resourcesById.set(resource.id, resource);
      }
      for (const subscription of workspaceData?.subscriptions ?? []) subscriptionsById.set(subscription.id, subscription);
    }
    for (const resource of hydratedCatalog?.resources ?? []) {
      if (!resource.organizationId) resourcesById.set(resource.id, resource);
    }

    const organizations = organizationsResult.data.map((organization) => {
      const workspaceData = workspaceByOrganization.get(organization.id);
      const savedOrganization = workspaceData?.organizations?.find((item) => item.id === organization.id);
      return {
        ...savedOrganization,
        id: organization.id,
        name: organization.name,
        companyCode: organization.company_code ?? '',
      };
    });

    return {
      creator: true,
      managerName,
      catalog: hydratedCatalog,
      creatorAccounts: accountsResult.data ?? [],
      creatorWorkspaces: Object.fromEntries(workspaceByOrganization),
      data: {
        organizations,
        employees: [...workspaceByOrganization.values()].flatMap((item) => item?.employees ?? []),
        archivedEmployees: [...workspaceByOrganization.values()].flatMap((item) => item?.archivedEmployees ?? []),
        protocolBatches: [...workspaceByOrganization.values()].flatMap((item) => item?.protocolBatches ?? []),
        specialists: [...workspaceByOrganization.values()].flatMap((item) => item?.specialists ?? []),
        signatures: [...workspaceByOrganization.values()].flatMap((item) => item?.signatures ?? []),
        ...(resourcesById.size ? { resources: [...resourcesById.values()] } : {}),
        resourceTypes: hydratedCatalog?.resourceTypes ?? ['Testas', 'Žurnalas', 'Kortelė', 'Protokolas'],
        subscriptions: [...subscriptionsById.values()],
      },
    };
  }

  const { data: signingPinConfigured, error: pinError } = await supabase.rpc('has_signing_pin');
  if (pinError) throw pinError;
  if (!signingPinConfigured) return { requiresSigningPin: true, managerName, ...companyDetails };
  const { data: memberships, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, employee_id')
    .eq('user_id', user.id);
  if (membershipError) throw membershipError;
  const { error: memberAssetMigrationError } = await supabase.functions.invoke('creator-migrate-assets', { body: {} });
  if (memberAssetMigrationError) throw new Error(`Nepavyko perkelti įmonės failų į Storage: ${memberAssetMigrationError.message}`);

  if (profile?.account_type === 'dss_specialist') {
    const dssMemberships = memberships.filter((membership) => membership.role === 'dss_specialist');
    if (!dssMemberships.length) return { requiresDssSpecialist: true, managerName };
    const organizationIds = dssMemberships.map((membership) => membership.organization_id);
    const [organizationsResult, workspacesResult, catalogResult] = await Promise.all([
      supabase.from('organizations').select('id, name, company_code').in('id', organizationIds),
      supabase.from('organization_data').select('organization_id, data').in('organization_id', organizationIds),
      supabase.from('creator_workspace_data').select('data').eq('id', true).maybeSingle(),
    ]);
    if (organizationsResult.error) throw organizationsResult.error;
    if (workspacesResult.error) throw workspacesResult.error;
    if (catalogResult.error) throw catalogResult.error;

    const hydratedWorkspaces = await Promise.all(workspacesResult.data.map(async (item) => [
      item.organization_id,
      await hydrateWorkspaceAssets(item.data),
    ]));
    const workspaceByOrganization = new Map(hydratedWorkspaces);
    const hydratedCatalog = await hydrateWorkspaceAssets(catalogResult.data?.data ?? null);
    const resourcesById = new Map();
    const organizations = organizationsResult.data.map((organization) => {
      const workspaceData = workspaceByOrganization.get(organization.id);
      const savedOrganization = workspaceData?.organizations?.find((item) => item.id === organization.id) ?? {};
      for (const resource of workspaceData?.resources ?? []) resourcesById.set(resource.id, resource);
      return { ...savedOrganization, id: organization.id, name: organization.name, companyCode: organization.company_code ?? '', dss: [...new Set([...(savedOrganization.dss ?? []), user.id])] };
    });
    for (const resource of hydratedCatalog?.resources ?? []) {
      if (!resource.organizationId) resourcesById.set(resource.id, resource);
    }

    return {
      dss: true,
      managerName,
      data: {
        organizations,
        employees: [...workspaceByOrganization.values()].flatMap((item) => item?.employees ?? []),
        archivedEmployees: [],
        protocolBatches: [...workspaceByOrganization.values()].flatMap((item) => item?.protocolBatches ?? []),
        specialists: [{ id: user.id, name: managerName, email: user.email ?? '', status: 'Paskyra patvirtinta' }],
        signatures: [...workspaceByOrganization.values()].flatMap((item) => item?.signatures ?? []),
        resources: [...resourcesById.values()],
        resourceTypes: hydratedCatalog?.resourceTypes ?? ['Testas', 'Žurnalas', 'Kortelė', 'Protokolas'],
        subscriptions: [],
      },
    };
  }

  if (profile?.account_type === 'employee') {
    const employeeMembership = memberships.find((membership) => membership.role === 'employee');
    if (!employeeMembership) return { requiresEmployee: true, managerName };
    const [{ data: employeeWorkspace, error: employeeWorkspaceError }, { data: aapIssuances, error: aapIssuancesError }] = await Promise.all([
      supabase.rpc('get_employee_workspace'),
      supabase.rpc('get_employee_aap_issuances'),
    ]);
    if (employeeWorkspaceError) throw employeeWorkspaceError;
    if (aapIssuancesError) throw aapIssuancesError;
    const employeeData = await hydrateWorkspaceAssets({
      ...employeeWorkspace.data,
      aapIssuances: aapIssuances ?? [],
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

  const { data: organization, error: organizationError } = await supabase
    .from('organizations').select('id, name, company_code').eq('id', managerMembership.organization_id).single();
  if (organizationError) throw organizationError;

  const [workspaceResult, catalogResult] = await Promise.all([
    supabase.from('organization_data').select('data').eq('organization_id', organization.id).maybeSingle(),
    supabase.from('creator_workspace_data').select('data').eq('id', true).maybeSingle(),
  ]);
  const { data: savedWorkspace, error: workspaceError } = workspaceResult;
  if (workspaceError) throw workspaceError;
  if (catalogResult.error) throw catalogResult.error;
  const hydratedWorkspace = await hydrateWorkspaceAssets(savedWorkspace?.data ?? null);
  const hydratedCatalog = await hydrateWorkspaceAssets(catalogResult.data?.data ?? null);

  return {
    organization,
    managerName,
    catalog: hydratedCatalog,
    data: hydratedWorkspace,
  };
}

export default function CloudEntry() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [signupRole, setSignupRole] = useState('manager');
  const [workspace, setWorkspace] = useState(null);
  const [creatorPreview, setCreatorPreview] = useState(null);
  const [workspaceStatus, setWorkspaceStatus] = useState('idle');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '', signingPin: '', confirmSigningPin: '', companyName: '', companyCode: '' });
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        setErrorMessage(error.message || 'Nepavyko įkelti įmonės duomenų.');
        setWorkspaceStatus('error');
      });

    return () => { active = false; };
  }, [session]);

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
              company_name: form.companyName.trim(),
              company_code: form.companyCode.trim(),
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
      setErrorMessage(error.message || 'Nepavyko prisijungti. Patikrinkite duomenis ir bandykite dar kartą.');
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
        organization,
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setWorkspace(null);
    setCreatorPreview(null);
    setWorkspaceStatus('idle');
    setForm({ fullName: '', email: '', password: '', confirmPassword: '', signingPin: '', confirmSigningPin: '', companyName: '', companyCode: '' });
  };

  const refreshCreatorWorkspace = async ({ exitPreview = false } = {}) => {
    if (!session?.user) return;
    const loadedWorkspace = await loadManagerWorkspace(session.user);
    setWorkspace(loadedWorkspace);
    setWorkspaceStatus(getWorkspaceStatus(loadedWorkspace));
    if (exitPreview) setCreatorPreview(null);
  };

  if (!authReady || (session && (workspaceStatus === 'idle' || workspaceStatus === 'loading'))) {
    return <main className="grid min-h-screen place-items-center bg-slate-100 px-4"><p className="text-sm text-slate-600">Jungiama prie DSS Pro…</p></main>;
  }

  if (session && workspaceStatus === 'ready' && workspace) {
    if (workspace.creator && creatorPreview) {
      const sourceData = workspace.creatorWorkspaces?.[creatorPreview.organizationId];
      const sourceOrganization = sourceData?.organizations?.find((item) => item.id === creatorPreview.organizationId)
        ?? workspace.data.organizations.find((item) => item.id === creatorPreview.organizationId);
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
        return <LocalWorkspace
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
        />;
      }
    }
    return <LocalWorkspace
      userRole={workspace.creator ? 'kurejas' : workspace.employee ? 'darbuotojas' : workspace.dss ? 'dss' : 'vadovas'}
      onRoleChange={() => {}}
      onExit={signOut}
      initialCloudData={workspace.data}
      creatorCatalog={workspace.catalog}
      creatorAccounts={workspace.creatorAccounts}
      creatorWorkspaces={workspace.creatorWorkspaces}
      onCreatorPreview={(organizationId, role) => setCreatorPreview({ organizationId, role })}
      onCreatorWorkspaceChanged={() => refreshCreatorWorkspace()}
      onCreatorOrganizationDeleted={() => refreshCreatorWorkspace({ exitPreview: true })}
      cloudOrganization={workspace.organization}
      cloudManagerName={workspace.managerName}
      cloudMode
      cloudUserId={session.user.id}
    />;
  }

  return <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 text-slate-900">
    <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-md bg-emerald-950 text-emerald-200"><Building2 size={21} /></span><div><p className="text-lg font-bold">DSS Pro</p><p className="text-sm text-slate-500">Prisijungimas prie paskyros</p></div></div>
      {session && workspaceStatus === 'employee-password-needed' ? <>
        <h1 className="text-xl font-bold">Susikurkite slaptažodį</h1><p className="mt-1 text-sm text-slate-600">Kvietimas patvirtintas. Susikurkite slaptažodį, o kitame žingsnyje nustatykite PIN dokumentams pasirašyti.</p>
        <form onSubmit={finishEmployeePasswordSetup} className="mt-5 space-y-4"><label className="block text-sm font-medium">Naujas slaptažodis<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><label className="block text-sm font-medium">Pakartokite slaptažodį<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" autoComplete="new-password" minLength={8} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required /></label><button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={submitting}><LogIn size={16} />{submitting ? 'Išsaugoma…' : 'Sukurti slaptažodį'}</button></form>
      </> : session && workspaceStatus === 'employee-account' ? <>
        <h1 className="text-xl font-bold">Darbuotojo paskyra</h1><p className="mt-1 text-sm text-slate-600">Prisijungėte kaip darbuotojas. Įmonės DSS dokumentai atsiras, kai vadovas jus pakvies ir priskirs įmonei.</p><button type="button" className="mt-5 w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold" onClick={signOut}>Atsijungti</button>
      </> : session && workspaceStatus === 'dss-specialist' ? <>
        <h1 className="text-xl font-bold">DSS specialisto paskyra</h1><p className="mt-1 text-sm text-slate-600">Jūs prisijungėte kaip DSS specialistas. Kad matytumėte įmonės dokumentus, įmonės vadovas turi jus pakviesti šiuo el. paštu: <strong>{session.user.email}</strong>.</p><button type="button" className="mt-5 w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold" onClick={signOut}>Atsijungti</button>
      </> : session && workspaceStatus === 'pin-needed' ? <>
        <h1 className="text-xl font-bold">Nustatykite pasirašymo PIN</h1><p className="mt-1 text-sm text-slate-600">PIN bus naudojamas dokumentams pasirašyti. Jis saugomas užšifruotu hash’u ir niekada nerodomas nustatymuose.</p>
        <form onSubmit={finishSigningPinSetup} className="mt-5 space-y-4"><label className="block text-sm font-medium">4 skaitmenų PIN<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={form.signingPin} onChange={(event) => setForm({ ...form, signingPin: event.target.value })} required /></label><label className="block text-sm font-medium">Pakartokite PIN<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={form.confirmSigningPin} onChange={(event) => setForm({ ...form, confirmSigningPin: event.target.value })} required /></label><button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={submitting}><LogIn size={16} />{submitting ? 'Išsaugoma…' : 'Nustatyti PIN'}</button></form>
      </> : session && workspaceStatus === 'organization-needed' ? <>
        <h1 className="text-xl font-bold">Sukurkite įmonę</h1><p className="mt-1 text-sm text-slate-600">Įmonės duomenys bus atskirti nuo kitų paskyrų.</p>
        <form onSubmit={createOrganization} className="mt-5 space-y-4"><label className="block text-sm font-medium">Įmonės pavadinimas<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} required /></label><label className="block text-sm font-medium">Įmonės kodas <span className="font-normal text-slate-500">(neprivaloma)</span><input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={form.companyCode} onChange={(event) => setForm({ ...form, companyCode: event.target.value })} /></label><button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={submitting}><Building2 size={16} />{submitting ? 'Kuriama…' : 'Sukurti įmonę'}</button></form>
      </> : session && workspaceStatus === 'error' ? <><h1 className="text-xl font-bold">Nepavyko atidaryti įmonės</h1><p className="mt-2 text-sm text-rose-700">{errorMessage}</p><button type="button" className="mt-5 w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={signOut}>Atsijungti</button></> : <>
        <h1 className="text-xl font-bold">{authMode === 'signup' ? signupRole === 'manager' ? 'Sukurkite vadovo paskyrą' : 'Sukurkite DSS specialisto paskyrą' : 'Prisijunkite'}</h1>{authMode === 'signup' && <p className="mt-1 text-sm text-slate-600">{signupRole === 'manager' ? 'Patvirtinus el. paštą galėsite sukurti įmonės paskyrą.' : 'DSS specialisto paskyra registruojama atskirai; įmonės vadovas jus pakvies į savo DSS aplinką.'}</p>}
        {authMode === 'signup' && <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1 text-xs font-semibold"><button type="button" className={`rounded px-2 py-2 ${signupRole === 'manager' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`} onClick={() => setSignupRole('manager')}>Vadovo paskyra</button><button type="button" className={`rounded px-2 py-2 ${signupRole === 'dss_specialist' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`} onClick={() => setSignupRole('dss_specialist')}>DSS specialisto paskyra</button></div>}
        <form onSubmit={handleAuth} className="mt-5 space-y-4">{authMode === 'signup' && <><label className="block text-sm font-medium">Vardas ir pavardė<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" autoComplete="name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></label></>}<label className="block text-sm font-medium">El. paštas<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label className="block text-sm font-medium">Slaptažodis<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>{authMode === 'signup' && <><label className="block text-sm font-medium">Pasirašymo PIN (4 skaitmenys)<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={form.signingPin} onChange={(event) => setForm({ ...form, signingPin: event.target.value })} required /></label><label className="block text-sm font-medium">Pakartokite pasirašymo PIN<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={form.confirmSigningPin} onChange={(event) => setForm({ ...form, confirmSigningPin: event.target.value })} required /></label></>}<button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={submitting}>{authMode === 'signup' ? <UserPlus size={16} /> : <LogIn size={16} />}{submitting ? 'Vykdoma…' : authMode === 'signup' ? 'Sukurti paskyrą' : 'Prisijungti'}</button></form>
        <button type="button" className="mt-4 w-full text-sm font-semibold text-emerald-800 hover:text-emerald-950" onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setErrorMessage(''); setNotice(''); }}>{authMode === 'signup' ? 'Jau turite paskyrą? Prisijunkite' : 'Neturite paskyros? Registruokitės'}</button>
      </>}
      {notice && <p role="status" className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {errorMessage && workspaceStatus !== 'error' && <p role="alert" className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</p>}
      {session && workspaceStatus !== 'error' && <button type="button" className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900" onClick={signOut}><LogOut size={15} />Atsijungti</button>}
    </section>
  </main>;
}