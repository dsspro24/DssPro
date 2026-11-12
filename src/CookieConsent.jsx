import { useEffect, useState } from 'react';
import { Cookie, Settings2 } from 'lucide-react';
import { supabase } from './lib/supabase.js';
import { PRIVACY_POLICY_VERSION } from './lib/legalVersions.js';

const preferenceKey = 'dsspro-cookie-preferences-v1';

function readPreferences() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferenceKey) ?? 'null');
    return saved?.policyVersion === PRIVACY_POLICY_VERSION && typeof saved.analytics === 'boolean' ? saved : null;
  } catch {
    return null;
  }
}

function clearGoogleAnalyticsCookies() {
  for (const name of document.cookie.split(';').map((cookie) => cookie.split('=')[0].trim())) {
    if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)|^_gac_/i.test(name)) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.dsspro.lt; SameSite=Lax`;
  }
}

function updateGoogleConsent(analyticsAllowed) {
  const dataLayer = window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { dataLayer.push(arguments); };
  const consent = {
    analytics_storage: analyticsAllowed ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  };
  if (analyticsAllowed && !window.__dssProGoogleTagManagerLoaded) {
    window.gtag('consent', 'default', { ...consent, analytics_storage: 'denied' });
    window.gtag('js', new Date());
    window.gtag('consent', 'update', consent);
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-NHTMXQTT';
    document.head.append(script);
    window.__dssProGoogleTagManagerLoaded = true;
  } else {
    window.gtag('consent', 'update', consent);
  }
  if (!analyticsAllowed) clearGoogleAnalyticsCookies();
}

export default function CookieConsent() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyticsDraft, setAnalyticsDraft] = useState(false);
  const [userId, setUserId] = useState('');
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? '');
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setSyncError(`Prisijungimo būsenos patikrinti nepavyko: ${error.message}`);
      setUserId(data.session?.user?.id ?? '');
    }).catch((error) => {
      if (active) setSyncError(`Prisijungimo būsenos patikrinti nepavyko: ${error.message || String(error)}`);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    updateGoogleConsent(preferences?.analytics === true);
  }, [preferences]);

  useEffect(() => {
    if (!preferences?.id || !userId || !supabase) return;
    let active = true;
    supabase.from('privacy_consent_records').insert({
      id: preferences.id,
      user_id: userId,
      consent_type: 'cookies',
      privacy_policy_version: preferences.policyVersion,
      accepted: true,
      analytics: preferences.analytics,
      source: 'cookie_banner',
    }).then(({ error }) => {
      if (!active) return;
      if (error && error.code !== '23505') {
        setSyncError(`Slapukų pasirinkimo užregistruoti nepavyko: ${error.message}`);
        return;
      }
      setSyncError('');
    }).catch((error) => {
      if (active) setSyncError(`Slapukų pasirinkimo užregistruoti nepavyko: ${error.message || String(error)}`);
    });
    return () => { active = false; };
  }, [preferences, userId]);

  const savePreferences = (analytics) => {
    const next = {
      id: window.crypto.randomUUID(),
      analytics,
      policyVersion: PRIVACY_POLICY_VERSION,
    };
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch (error) {
      setSyncError(`Slapukų pasirinkimo išsaugoti šioje naršyklėje nepavyko: ${error.message || String(error)}`);
    }
    setPreferences(next);
    setSettingsOpen(false);
  };

  const openSettings = () => {
    setAnalyticsDraft(preferences?.analytics ?? false);
    setSettingsOpen(true);
  };

  return <>
    <button type="button" className="fixed bottom-3 right-3 z-[80] inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg hover:bg-slate-50" onClick={openSettings}>
      <Settings2 size={15} />Slapukų nustatymai
    </button>
    {(settingsOpen || !preferences) && <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title" className="my-auto w-full max-w-xl space-y-4 rounded-xl bg-white p-5 text-slate-900 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><Cookie size={20} /></span>
          <div>
            <h2 id="cookie-consent-title" className="text-xl font-bold">Slapukų pasirinkimai</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Būtini slapukai ir vietinė saugykla reikalingi prisijungimui, saugumui bei jūsų pasirinkimams išsaugoti. Analitika yra pasirenkama ir įjungiama tik jums sutikus.</p>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <input type="checkbox" checked disabled className="mt-0.5" />
          <span><strong className="block">Būtini</strong><span className="text-slate-600">Prisijungimo sesija, saugumas ir slapukų pasirinkimo įsiminimas. Jų išjungti negalima.</span></span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <input type="checkbox" checked={analyticsDraft} onChange={(event) => setAnalyticsDraft(event.target.checked)} className="mt-0.5" />
          <span><strong className="block">Analitiniai („Google Tag Manager“)</strong><span className="text-slate-600">Leidžia rinkti svetainės naudojimo ir įrenginio duomenis. Pasirinkimą bet kada galite pakeisti.</span></span>
        </label>
        <p className="text-xs leading-5 text-slate-500">Prisijungusio naudotojo pasirinkimas įrašomas sutikimų žurnale. Iki prisijungimo jis saugomas tik šioje naršyklėje, o prisijungus susiejamas su paskyra. Išsamiau: <a className="font-semibold text-emerald-800 underline" href="/privatumo-politika">Privatumo politika</a> ir <a className="font-semibold text-emerald-800 underline" href="/naudojimo-salygos">Naudojimo sąlygos</a>.</p>
        {syncError && <p role="alert" className="rounded-md bg-rose-50 p-3 text-xs text-rose-800">{syncError}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {preferences && <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => setSettingsOpen(false)}>Uždaryti</button>}
          <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => savePreferences(false)}>Tik būtini</button>
          <button type="button" className="rounded-md border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-900" onClick={() => savePreferences(analyticsDraft)}>Išsaugoti pasirinkimą</button>
          <button type="button" className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white" onClick={() => savePreferences(true)}>Sutikti su visais</button>
        </div>
      </section>
    </div>}
  </>;
}
