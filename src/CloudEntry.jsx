import { useEffect, useState } from 'react';
import { Building2, LogIn, LogOut, UserPlus } from 'lucide-react';
import LocalWorkspace from './LocalWorkspace.jsx';
import { supabase } from './lib/supabase.js';

async function loadManagerWorkspace(user) {
  const [{ data: signingPinConfigured, error: pinError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.rpc('has_signing_pin'),
    supabase.from('profiles').select('full_name, account_type').eq('id', user.id).maybeSingle(),
  ]);
  if (pinError) throw pinError;
  if (profileError) throw profileError;
  const managerName = profile?.full_name ?? user.user_metadata?.full_name ?? '';
  const companyDetails = {
    companyName: user.user_metadata?.company_name ?? '',
    companyCode: user.user_metadata?.company_code ?? '',
  };
  if (!signingPinConfigured) return { requiresSigningPin: true, managerName, ...companyDetails };
  if (profile?.account_type === 'dss_specialist') return { requiresDssSpecialist: true, managerName };
  if (profile?.account_type === 'employee') return { requiresEmployee: true, managerName };

  const { data: memberships, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id);
  if (membershipError) throw membershipError;

  const managerMembership = memberships.find((membership) => membership.role === 'manager');
  if (!managerMembership) return { requiresOrganization: true, managerName, ...companyDetails };

  const { data: organization, error: organizationError } = await supabase
    .from('organizations').select('id, name, company_code').eq('id', managerMembership.organization_id).single();
  if (organizationError) throw organizationError;

  const { data: savedWorkspace, error: workspaceError } = await supabase
    .from('organization_data')
    .select('data')
    .eq('organization_id', organization.id)
    .maybeSingle();
  if (workspaceError) throw workspaceError;

  return {
    organization,
    managerName,
    data: savedWorkspace?.data ?? null,
  };
}

export default function CloudEntry() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [signupRole, setSignupRole] = useState('manager');
  const [workspace, setWorkspace] = useState(null);
  const [workspaceStatus, setWorkspaceStatus] = useState('idle');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', signingPin: '', confirmSigningPin: '', companyName: '', companyCode: '' });
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
        setWorkspaceStatus(loadedWorkspace?.requiresSigningPin ? 'pin-needed' : loadedWorkspace?.requiresDssSpecialist ? 'dss-specialist' : loadedWorkspace?.requiresEmployee ? 'employee-account' : loadedWorkspace?.requiresOrganization ? 'organization-needed' : loadedWorkspace ? 'ready' : 'organization-needed');
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
          setWorkspaceStatus(loadedWorkspace?.requiresSigningPin ? 'pin-needed' : loadedWorkspace?.requiresDssSpecialist ? 'dss-specialist' : loadedWorkspace?.requiresEmployee ? 'employee-account' : loadedWorkspace?.requiresOrganization ? 'organization-needed' : loadedWorkspace ? 'ready' : 'organization-needed');
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
      setWorkspaceStatus(loadedWorkspace?.requiresSigningPin ? 'pin-needed' : loadedWorkspace?.requiresDssSpecialist ? 'dss-specialist' : loadedWorkspace?.requiresEmployee ? 'employee-account' : loadedWorkspace?.requiresOrganization ? 'organization-needed' : loadedWorkspace ? 'ready' : 'organization-needed');
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
    setWorkspaceStatus('idle');
    setForm({ fullName: '', email: '', password: '', signingPin: '', confirmSigningPin: '', companyName: '', companyCode: '' });
  };

  if (!authReady || (session && (workspaceStatus === 'idle' || workspaceStatus === 'loading'))) {
    return <main className="grid min-h-screen place-items-center bg-slate-100 px-4"><p className="text-sm text-slate-600">Jungiama prie DSS Pro…</p></main>;
  }

  if (session && workspaceStatus === 'ready' && workspace) {
    return <LocalWorkspace userRole="vadovas" onRoleChange={() => {}} onExit={signOut} initialCloudData={workspace.data} cloudOrganization={workspace.organization} cloudManagerName={workspace.managerName} cloudMode cloudUserId={session.user.id} />;
  }

  return <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 text-slate-900">
    <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-md bg-emerald-950 text-emerald-200"><Building2 size={21} /></span><div><p className="text-lg font-bold">DSS Pro</p><p className="text-sm text-slate-500">Prisijungimas prie paskyros</p></div></div>
      {session && workspaceStatus === 'employee-account' ? <>
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
        <h1 className="text-xl font-bold">{authMode === 'signup' ? signupRole === 'manager' ? 'Sukurkite vadovo paskyrą' : 'Sukurkite DSS specialisto paskyrą' : 'Prisijunkite'}</h1><p className="mt-1 text-sm text-slate-600">{authMode === 'signup' ? signupRole === 'manager' ? 'Patvirtinus el. paštą galėsite sukurti įmonės paskyrą.' : 'DSS specialisto paskyra registruojama atskirai; įmonės vadovas jus pakvies į savo DSS aplinką.' : 'Naudokite tą patį prisijungimą kaip vadovas, DSS specialistas ar darbuotojas.'}</p>
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