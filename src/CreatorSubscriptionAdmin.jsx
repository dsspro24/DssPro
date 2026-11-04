import { useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import dssProLogo from './assets/dss-pro-logo.webp';

const issuerFields = [
  ['legalForm', 'Teisinė forma (IV, MB, UAB ir kt.)'],
  ['name', 'Pavadinimas / vardas, pavardė'],
  ['companyCode', 'Įmonės / veiklos kodas'],
  ['vatCode', 'PVM mokėtojo kodas'],
  ['address', 'Adresas'],
  ['email', 'El. paštas'],
  ['phone', 'Telefonas'],
  ['bankName', 'Bankas'],
  ['bankAccount', 'Banko sąskaita (IBAN)'],
];

export function CreatorInvoiceSettingsEditor({ settings, onLoad, onSave, defaults, inputClass, buttonClass }) {
  const [draft, setDraft] = useState(() => ({
    ...defaults,
    ...settings,
    issuer_details: {
      ...defaults.issuer_details,
      ...(settings?.issuer_details ?? {}),
    },
  }));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await onSave(draft);
      const updatedSettings = saved ?? draft;
      setDraft({
        ...defaults,
        ...updatedSettings,
        issuer_details: {
          ...defaults.issuer_details,
          ...(updatedSettings?.issuer_details ?? {}),
        },
      });
      setEditing(false);
    } catch (saveError) {
      setError(saveError.message || 'Sąskaitų rekvizitų išsaugoti nepavyko.');
    } finally {
      setSaving(false);
    }
  };

  const toggleEditing = async () => {
    if (editing) {
      setEditing(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const saved = await onLoad();
      setDraft({
        ...defaults,
        ...saved,
        issuer_details: {
          ...defaults.issuer_details,
          ...(saved?.issuer_details ?? {}),
        },
      });
      setEditing(true);
    } catch (loadError) {
      setError(loadError.message || 'Išsaugytų sąskaitų rekvizitų užkrauti nepavyko.');
    } finally {
      setLoading(false);
    }
  };

  const savedIssuerDetails = issuerFields
    .map(([key, label]) => ({ label: label.replace(/\s*\([^)]*\)\s*/g, '').trim(), value: draft.issuer_details[key]?.trim() }))
    .filter(({ value }) => value);

  return <div className="space-y-4">
    <p className="text-sm text-slate-600">Čia pardavėjo rekvizitai (IV, MB, UAB ir kt.). Peržiūrėkite, kaip jie bus rodomi sąskaitoje; paspauskite „Redaguoti“ norėdami pakeisti.</p>
    <section className="max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-label="Sąskaitos pardavėjo rekvizitų peržiūra">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <img src={dssProLogo} alt="DSS Pro" className="size-14 rounded-full object-contain" />
          <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Pardavėjas</p><h3 className="text-lg font-bold">{draft.issuer_details.name || 'Pavadinimas / vardas, pavardė'}</h3></div>
        </div>
        <button type="button" className={buttonClass} onClick={toggleEditing} disabled={loading}>{loading ? 'Užkraunama…' : editing ? 'Slėpti redagavimą' : 'Redaguoti rekvizitus'}</button>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {draft.issuer_details.legalForm && <p><span className="text-slate-500">Teisinė forma: </span><strong>{draft.issuer_details.legalForm}</strong></p>}
        {savedIssuerDetails.filter(({ label }) => label !== 'Pavadinimas / vardas, pavardė' && label !== 'Teisinė forma').map(({ label, value }) => <p key={label}><span className="text-slate-500">{label}: </span><strong className="break-words">{value}</strong></p>)}
        <p><span className="text-slate-500">PVM: </span><strong>{draft.vat_registered ? `${draft.vat_rate ?? 21} %${draft.vat_included ? ' (įskaičiuotas į kainą)' : ' (pridedamas prie kainos)'}` : 'netaikomas'}</strong></p>
        {draft.invoice_note?.trim() && <p className="whitespace-pre-wrap sm:col-span-2"><span className="text-slate-500">Pastaba: </span>{draft.invoice_note}</p>}
        {!savedIssuerDetails.length && !draft.invoice_note?.trim() && <p className="text-slate-500 sm:col-span-2">Pardavėjo rekvizitai dar nesužymėti.</p>}
      </div>
    </section>
    {editing && <form onSubmit={save} className="max-w-4xl space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/30 p-4">
      <p className="text-sm text-slate-600">Visi laukai neprivalomi. Išsaugoti duomenys bus naudojami naujoms sąskaitoms; jau išrašytos sąskaitos nekeičiamos.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {issuerFields.map(([key, label]) => <label key={key} className="text-sm font-medium">{label}<input className={`${inputClass} mt-1`} value={draft.issuer_details[key] ?? ''} onChange={(event) => setDraft((current) => ({ ...current, issuer_details: { ...current.issuer_details, [key]: event.target.value } }))} /></label>)}
      </div>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.vat_registered === true} onChange={(event) => setDraft((current) => ({ ...current, vat_registered: event.target.checked }))} />Esu PVM mokėtojas</label>
        {draft.vat_registered && <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">PVM tarifas (%)<input className={`${inputClass} mt-1`} type="number" min="0" max="100" step="0.01" value={draft.vat_rate ?? 21} onChange={(event) => setDraft((current) => ({ ...current, vat_rate: event.target.value }))} required /></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={draft.vat_included === true} onChange={(event) => setDraft((current) => ({ ...current, vat_included: event.target.checked }))} />Nurodytos kainos jau apima PVM</label>
        </div>}
        <label className="block text-sm font-medium">Pastaba sąskaitoje <span className="font-normal text-slate-500">(neprivaloma)</span><textarea className={`${inputClass} mt-1 min-h-20`} value={draft.invoice_note ?? ''} onChange={(event) => setDraft((current) => ({ ...current, invoice_note: event.target.value }))} /></label>
      </div>
      <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Saugoma…' : 'Išsaugoti rekvizitus'}</button>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>}
    {error && !editing && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}

export function SubscriptionPlanPriceEditor({ plan, onSave, inputClass }) {
  const [price, setPrice] = useState((plan.amount_cents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event) => {
    event.preventDefault();
    const amount = Number(price.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Įveskite tinkamą kainą.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(plan.code, Math.round(amount * 100));
    } catch (saveError) {
      setError(saveError.message || 'Kainos išsaugoti nepavyko.');
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={save} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3">
    <div className="min-w-40 flex-1"><p className="text-sm font-semibold">{plan.name}</p><p className="text-xs text-slate-500">{plan.employee_limit ? `Iki ${plan.employee_limit} darbuotojų` : 'Papildomos įmonės darbo sritis'}</p></div>
    <label className="text-sm font-medium">€/mėn.<input className={`${inputClass} mt-1 w-32`} type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
    <button type="submit" className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50" disabled={saving}>{saving ? 'Saugoma…' : 'Keisti kainą'}</button>
    {error && <p role="alert" className="basis-full text-xs text-rose-700">{error}</p>}
  </form>;
}

export function CreatorSubscriptionEditor({ subscription, organizationName, plans, onSave, onConfirmPayment, now, inputClass, buttonClass }) {
  const [status, setStatus] = useState(({ 'Laukiama sąskaitos': 'pending', Aktyvi: 'active', Atšaukta: 'canceled', Pasibaigusi: 'expired' })[subscription.status] ?? subscription.status);
  const [planCode, setPlanCode] = useState(subscription.planCode ?? 'up_to_20');
  const [amount, setAmount] = useState(String(subscription.price ?? 0));
  const [startsAt, setStartsAt] = useState(subscription.startsAt ? new Date(subscription.startsAt).toISOString().slice(0, 16) : '');
  const [endsAt, setEndsAt] = useState(subscription.endsAt ? new Date(subscription.endsAt).toISOString().slice(0, 16) : '');
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(subscription.cancelAtPeriodEnd === true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [paymentEndDate, setPaymentEndDate] = useState('');
  const [error, setError] = useState('');
  const availablePlans = plans.filter((plan) => plan.active !== false
    && (subscription.isAddon ? plan.code.startsWith('additional_workspace_') : !plan.code.startsWith('additional_workspace')));
  const price = Number(amount.replace(',', '.'));
  const remainingDays = subscription.endsAt ? Math.ceil((new Date(subscription.endsAt).getTime() - now) / 86_400_000) : null;
  const lifecycle = subscription.paymentStatus === 'Laukiama apmokėjimo'
    ? ['Laukia apmokėjimo', 'bg-orange-100 text-orange-900']
    : subscription.status === 'Aktyvi' && remainingDays !== null && remainingDays <= 0
      ? ['Pasibaigusi', 'bg-rose-100 text-rose-900']
      : subscription.status === 'Aktyvi' && remainingDays !== null && remainingDays <= 5
        ? [`Baigiasi po ${Math.max(1, remainingDays)} d.`, 'bg-yellow-100 text-yellow-900']
        : subscription.status === 'Aktyvi'
          ? ['Aktyvi', 'bg-emerald-100 text-emerald-900']
          : subscription.status === 'Pasibaigusi'
            ? ['Pasibaigusi', 'bg-rose-100 text-rose-900']
            : subscription.status === 'Atšaukta'
              ? ['Atšaukta', 'bg-slate-100 text-slate-700']
              : [subscription.status, 'bg-slate-100 text-slate-700'];
  const confirmPayment = async () => {
    setConfirmingPayment(true);
    setError('');
    try {
      await onConfirmPayment(subscription.id, paymentEndDate);
      setPaymentEndDate('');
    } catch (confirmError) {
      setError(confirmError.message || 'Mokėjimo patvirtinti nepavyko.');
    } finally {
      setConfirmingPayment(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!Number.isFinite(price) || price < 0) {
      setError('Įveskite tinkamą kainą.');
      return;
    }
    if (status === 'active' && (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt))) {
      setError('Aktyviai prenumeratai nurodykite tinkamą pradžios ir pabaigos laiką.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await onSave(subscription.id, {
        status,
        planCode,
        amountCents: Math.round(price * 100),
        startsAt: startsAt ? new Date(startsAt).toISOString() : '',
        endsAt: endsAt ? new Date(endsAt).toISOString() : '',
        cancelAtPeriodEnd,
      });
      setStatus(({ 'Laukiama sąskaitos': 'pending', Aktyvi: 'active', Atšaukta: 'canceled', Pasibaigusi: 'expired' })[saved.status] ?? saved.status);
      setStartsAt(saved.startsAt ? new Date(saved.startsAt).toISOString().slice(0, 16) : '');
      setEndsAt(saved.endsAt ? new Date(saved.endsAt).toISOString().slice(0, 16) : '');
      setEditing(false);
    } catch (saveError) {
      setError(saveError.message || 'Prenumeratos išsaugoti nepavyko.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{subscription.plan} · {new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR' }).format(subscription.price)} / mėn.</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2 py-1 font-semibold ${lifecycle[1]}`}>{lifecycle[0]}</span><span className="text-slate-600">{subscription.endsAt ? `iki ${new Date(subscription.endsAt).toLocaleDateString('lt-LT')}` : ''}{subscription.cancelAtPeriodEnd ? ' · atšaukiama laikotarpio pabaigoje' : ''}</span></p>
        {subscription.status === 'Laukiama sąskaitos' && <p className="mt-1 text-xs font-semibold text-amber-800">Laukia sąskaitos išrašymo</p>}
        {subscription.orderCode && <p className="mt-1 text-xs font-semibold text-slate-700">Užsakymas {subscription.orderCode} · {subscription.paymentStatus} · {subscription.orderMonths} mėn.</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" aria-label={`${detailsOpen ? 'Slėpti' : 'Peržiūrėti'} prenumeratos informaciją: ${organizationName}`} aria-expanded={detailsOpen} className="grid size-9 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" onClick={() => setDetailsOpen((open) => !open)}><Eye size={16} /></button>
        <button type="button" aria-label={`Koreguoti prenumeratą: ${organizationName}`} aria-pressed={editing} className={`grid size-9 place-items-center rounded-md border ${editing ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`} onClick={() => setEditing((open) => !open)}><Pencil size={16} /></button>
      </div>
    </div>
    {detailsOpen && <dl className="grid gap-2 rounded-md bg-slate-50 p-3 text-xs sm:grid-cols-2">
      <div><dt className="text-slate-500">Įmonė / workspace</dt><dd className="font-semibold">{organizationName}</dd></div>
      <div><dt className="text-slate-500">Užsakymo ID</dt><dd className="break-all font-mono">{subscription.id}</dd></div>
      <div><dt className="text-slate-500">Galioja nuo</dt><dd>{subscription.startsAt ? new Date(subscription.startsAt).toLocaleString('lt-LT') : 'Dar nenustatyta'}</dd></div>
      <div><dt className="text-slate-500">Galioja iki</dt><dd>{subscription.endsAt ? new Date(subscription.endsAt).toLocaleString('lt-LT') : 'Dar nenustatyta'}</dd></div>
      {subscription.orderCode && <><div><dt className="text-slate-500">Užsakymo kodas</dt><dd className="font-mono">{subscription.orderCode}</dd></div><div><dt className="text-slate-500">Apmokėta</dt><dd>{subscription.paidAt ? new Date(subscription.paidAt).toLocaleString('lt-LT') : 'Ne'}</dd></div></>}
    </dl>}
    {subscription.orderCode && subscription.paymentStatus === 'Laukiama apmokėjimo' && <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm text-amber-950">{subscription.isPlanChange
        ? <>Gavę pavedimą pagal kodą <strong>{subscription.orderCode}</strong>, patvirtinkite plano pakeitimo sąskaitą. Pakeistas planas galios iki {subscription.endsAt ? new Date(subscription.endsAt).toLocaleDateString('lt-LT') : 'dabartinio laikotarpio pabaigos'}.</>
        : <>Gavę pavedimą pagal kodą <strong>{subscription.orderCode}</strong>, patvirtinkite jį. Galiojimo pabaiga skaičiuojama nuo išankstinės sąskaitos išrašymo datos ({subscription.orderMonths} mėn.).</>}</p>
      {!subscription.isPlanChange && <label className="block max-w-xs text-sm font-medium">Arba nurodykite tikslią galiojimo pabaigą<input className={`${inputClass} mt-1`} type="date" min={subscription.orderedAt?.slice(0, 10)} value={paymentEndDate} onChange={(event) => setPaymentEndDate(event.target.value)} /></label>}
      <button type="button" className={buttonClass} disabled={confirmingPayment} onClick={confirmPayment}>{confirmingPayment ? 'Tvirtinama…' : subscription.isPlanChange ? 'Patvirtinti kainų skirtumo apmokėjimą' : `Patvirtinti apmokėjimą · ${subscription.orderMonths} mėn.`}</button>
    </div>}
    {editing && <form onSubmit={submit} className="space-y-3 border-t border-slate-100 pt-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">Būsena<select className={`${inputClass} mt-1`} value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Laukia sąskaitos</option><option value="active">Aktyvi</option><option value="canceled">Atšaukta</option><option value="expired">Pasibaigusi</option></select></label>
        <label className="text-sm font-medium">Planas<select className={`${inputClass} mt-1`} value={planCode} onChange={(event) => {
          const selected = availablePlans.find((plan) => plan.code === event.target.value);
          setPlanCode(event.target.value);
          if (selected) setAmount((selected.amount_cents / 100).toFixed(2));
        }}>{availablePlans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
        <label className="text-sm font-medium">Kaina €/mėn.<input className={`${inputClass} mt-1`} type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <label className="text-sm font-medium">Galioja nuo<input className={`${inputClass} mt-1`} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
        <label className="text-sm font-medium">Galioja iki<input className={`${inputClass} mt-1`} type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={cancelAtPeriodEnd} onChange={(event) => setCancelAtPeriodEnd(event.target.checked)} />Atšaukti laikotarpio pabaigoje</label>
      </div>
      <div className="flex flex-wrap gap-2"><button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Saugoma…' : 'Išsaugoti prenumeratą'}</button><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => setEditing(false)}>Atšaukti</button></div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>}
    {error && !editing && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}
