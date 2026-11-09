import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

const helpLoaders = {
  darbuotojas: () => import('./help/employee.js'),
  dss: () => import('./help/dss.js'),
  vadovas: () => import('./help/manager.js'),
  kurejas: () => import('./help/creator.js'),
};

function readDismissed(storageKey) {
  try {
    return localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

export default function WorkspaceHelp({ open, role, navigation, storageKey, onNavigate, onHighlightTab, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [helpData, setHelpData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [failedRetryToken, setFailedRetryToken] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const latestNavigation = useRef(navigation);
  const latestCallbacks = useRef({ onNavigate, onHighlightTab });
  useEffect(() => {
    latestNavigation.current = navigation;
    latestCallbacks.current = { onNavigate, onHighlightTab };
  }, [navigation, onNavigate, onHighlightTab]);
  const steps = navigation.map(([tab, label]) => ({
    tab,
    label,
    description: helpData?.descriptions?.[tab] ?? helpData?.descriptions?.default ?? '',
  }));
  const activeStep = steps[stepIndex];
  const mode = !open
    ? 'closed'
    : loadError && failedRetryToken === retryToken
      ? 'error'
      : helpData
        ? dismissed ? 'reference' : 'tour'
        : 'loading';

  const close = useCallback(() => {
    onHighlightTab(null);
    onClose();
  }, [onClose, onHighlightTab]);

  useEffect(() => {
    if (!open || helpData) return undefined;

    let active = true;
    const loadRoleHelp = helpLoaders[role];
    Promise.resolve()
      .then(() => {
        if (!loadRoleHelp) throw new Error('Šiai paskyros rolei pagalbos turinio dar nėra.');
        return loadRoleHelp();
      })
      .then((data) => {
        if (!active) return;
        setHelpData(data);
        const wasDismissed = readDismissed(storageKey);
        setDismissed(wasDismissed);
        if (wasDismissed) {
          return;
        }
        const firstStep = latestNavigation.current[0];
        setStepIndex(0);
        if (firstStep) {
          latestCallbacks.current.onNavigate(firstStep[0]);
          latestCallbacks.current.onHighlightTab(firstStep[0]);
          window.setTimeout(() => {
            document.querySelector(`[data-help-target="${firstStep[0]}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 0);
        }
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setFailedRetryToken(retryToken);
      });

    return () => { active = false; };
  }, [open, role, storageKey, retryToken, helpData]);

  const showStep = (index) => {
    const nextIndex = Math.max(0, Math.min(index, steps.length - 1));
    const step = steps[nextIndex];
    if (!step) return;
    setStepIndex(nextIndex);
    onNavigate(step.tab);
    onHighlightTab(step.tab);
    window.setTimeout(() => {
      document.querySelector(`[data-help-target="${step.tab}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  };

  const dismissTour = () => {
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // The current tour can still be closed when browser storage is unavailable.
    }
    setDismissed(true);
    close();
  };

  const restoreTour = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Restoring the tour remains available for the current session.
    }
    setDismissed(false);
    showStep(0);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, close]);

  if (!open || mode === 'closed') return null;

  return <>
    <div className="fixed inset-0 z-[70] bg-slate-950/30 print:hidden" aria-hidden="true" />
    {mode === 'loading' && <section role="dialog" aria-modal="true" aria-labelledby="workspace-help-title" aria-busy="true" className="fixed inset-x-3 bottom-3 z-[80] rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(26rem,calc(100vw-2rem))]">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">DSS Pro žinynas</p><h2 id="workspace-help-title" className="mt-1 text-lg font-bold">Įkeliama pagalba…</h2></div>
        <button type="button" aria-label="Uždaryti pagalbą" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={18} /></button>
      </div>
    </section>}
    {mode === 'error' && <section role="dialog" aria-modal="true" aria-labelledby="workspace-help-title" className="fixed inset-x-3 bottom-3 z-[80] rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(26rem,calc(100vw-2rem))]">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">DSS Pro žinynas</p><h2 id="workspace-help-title" className="mt-1 text-lg font-bold">Pagalbos įkelti nepavyko</h2></div>
        <button type="button" aria-label="Uždaryti pagalbą" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={18} /></button>
      </div>
      {loadError && <p className="mt-3 text-sm text-rose-700">{loadError}</p>}
      <button type="button" onClick={() => { setLoadError(''); setRetryToken((token) => token + 1); }} className="mt-4 min-h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900">Bandyti dar kartą</button>
    </section>}
    {mode === 'tour' && activeStep && <section role="dialog" aria-modal="true" aria-labelledby="workspace-help-title" className="fixed inset-x-3 bottom-3 z-[80] max-h-[75vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(26rem,calc(100vw-2rem))] sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Pagalba {helpData.roleName}</p>
          <h2 id="workspace-help-title" className="mt-1 text-lg font-bold">{activeStep.label}</h2>
        </div>
        <button type="button" aria-label="Uždaryti pagalbos vedlį" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{activeStep.description}</p>
      <p className="mt-3 text-xs font-medium text-slate-500" aria-live="polite">Žingsnis {stepIndex + 1} iš {steps.length} · Pažymėjome šią skiltį meniu.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <button type="button" onClick={dismissTour} className="text-left text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800">Daugiau neberodyti vedlio</button>
        <div className="flex items-center gap-2">
          <button type="button" disabled={stepIndex === 0} onClick={() => showStep(stepIndex - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft size={15} />Atgal</button>
          {stepIndex === steps.length - 1
            ? <button type="button" onClick={close} className="inline-flex min-h-10 items-center gap-1 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white hover:bg-emerald-900"><Check size={16} />Baigti</button>
            : <button type="button" onClick={() => showStep(stepIndex + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white hover:bg-emerald-900">Kitas žingsnis<ArrowRight size={15} /></button>}
        </div>
      </div>
    </section>}
    {mode === 'reference' && <section role="dialog" aria-modal="true" aria-labelledby="workspace-help-title" className="fixed inset-x-3 bottom-3 z-[80] max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(30rem,calc(100vw-2rem))] sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Trumpas žinynas</p><h2 id="workspace-help-title" className="mt-1 text-lg font-bold">Pagalba {helpData.roleName}</h2></div>
        <button type="button" aria-label="Uždaryti pagalbą" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <ul className="mt-4 space-y-3">
        {steps.map((step) => <li key={step.tab} className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-bold">{step.label}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">{step.description}</p>
        </li>)}
      </ul>
      <button type="button" onClick={restoreTour} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900">Rodyti žingsninį vedlį<ArrowRight size={16} /></button>
    </section>}
  </>;
}
