import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { supabase } from './lib/supabase.js';
import { PRIVACY_POLICY_VERSION } from './lib/legalVersions.js';
import { COOKIE_CONSENT_VALIDITY_DAYS, getCookieConsentExpiry, hasUnexpiredCookieConsent } from './lib/cookieConsent.js';

const preferenceKey = 'dsspro-cookie-preferences-v1';

function readPreferences() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferenceKey) ?? 'null');
    if (
      saved?.policyVersion === PRIVACY_POLICY_VERSION
      && typeof saved.analytics === 'boolean'
      && hasUnexpiredCookieConsent(saved)
    ) return saved;

    if (saved) window.localStorage.removeItem(preferenceKey);
    return null;
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
    const openSettings = () => {
      setAnalyticsDraft(preferences?.analytics ?? false);
      setSettingsOpen(true);
    };
    window.addEventListener('dsspro:open-cookie-settings', openSettings);
    return () => window.removeEventListener('dsspro:open-cookie-settings', openSettings);
  }, [preferences]);

  useEffect(() => {
    updateGoogleConsent(preferences?.analytics === true);
  }, [preferences]);

  useEffect(() => {
    if (!preferences) return undefined;
    let timeoutId;
    const checkExpiry = () => {
      if (!hasUnexpiredCookieConsent(preferences)) {
        try {
          window.localStorage.removeItem(preferenceKey);
        } catch (error) {
          setSyncError(`Pasibaigusio slapukų pasirinkimo pašalinti nepavyko: ${error.message || String(error)}`);
        }
        setPreferences(null);
        return;
      }

      const remaining = getCookieConsentExpiry(preferences) - Date.now() + 1;
      timeoutId = window.setTimeout(checkExpiry, Math.min(remaining, 2147483647));
    };

    const remaining = getCookieConsentExpiry(preferences) - Date.now() + 1;
    timeoutId = window.setTimeout(checkExpiry, Math.min(Math.max(remaining, 1), 2147483647));
    return () => window.clearTimeout(timeoutId);
  }, [preferences]);

  useEffect(() => {
    if (!preferences?.id || !userId || !supabase) return;
    let active = true;
    supabase.from('privacy_consent_records').upsert({
      id: preferences.id,
      user_id: userId,
      consent_type: 'cookies',
      privacy_policy_version: preferences.policyVersion,
      accepted: true,
      analytics: preferences.analytics,
      source: 'cookie_banner',
    }, { onConflict: 'id', ignoreDuplicates: true }).then(({ error }) => {
      if (!active) return;
      if (error) {
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
      savedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch (error) {
      setSyncError(`Slapukų pasirinkimo išsaugoti šioje naršyklėje nepavyko: ${error.message || String(error)}`);
    }
    setPreferences(next);
    setSettingsOpen(false);
  };

  return <>
    {(settingsOpen || !preferences) && <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title" className="my-auto w-full max-w-xl space-y-4 rounded-xl bg-white p-5 text-slate-900 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><Cookie size={20} /></span>
          <div>
            <h2 id="cookie-consent-title" className="text-xl font-bold">Slapukų pasirinkimai</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Būtini slapukai ir vietinė saugykla reikalingi prisijungimui, saugumui bei jūsų pasirinkimams išsaugoti. Analitika yra pasirenkama ir įjungiama tik jums sutikus. Sutikimas arba atsisakymas galioja {COOKIE_CONSENT_VALIDITY_DAYS} dienų; vėliau paprašysime pasirinkimą atnaujinti.</p>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <input type="checkbox" checked disabled className="mt-0.5" />
          <span><strong className="block">Būtini</strong><span className="text-slate-600">Prisijungimo sesija, saugumas ir slapukų pasirinkimo įsiminimas. Jų išjungti negalima.</span></span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <input type="checkbox" checked={analyticsDraft} onChange={(event) => setAnalyticsDraft(event.target.checked)} className="mt-0.5" />
          <span><strong className="block">Analitiniai („Google Tag Manager“)</strong><span className="text-slate-600">Leidžia rinkti svetainės naudojimo ir įrenginio duomenis. Sutikimas galioja 6 mėnesius (180 dienų), bet kada galite jį pakeisti.</span></span>
        </label>
        <p className="text-xs leading-5 text-slate-500">Prisijungusio naudotojo pasirinkimas įrašomas sutikimų žurnale ir saugomas 2 metus. Iki prisijungimo jis saugomas tik šioje naršyklėje, o prisijungus susiejamas su paskyra. Išsamiau: <a className="font-semibold text-emerald-800 underline" href="/privatumo-politika">Privatumo politika</a> ir <a className="font-semibold text-emerald-800 underline" href="/naudojimo-salygos">Naudojimo sąlygos</a>.</p>
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
