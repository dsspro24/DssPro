import { useState } from 'react';
import { CreditCard, Download, RotateCcw, Trash2 } from 'lucide-react';

export function SubscriptionCard({ subscription, plans, employeeCount, readOnly, locked, adminRestoreRequired = false, busy, cloudMode, managerName = '', now = 0, onOrder, onCancelOrder, onChangePlan, onAddCompany, onDemoAction, onOpenInvoice, inputClass, buttonClass }) {
  const isPlanSelectable = (plan) => plan.active !== false || plan.code === subscription?.planCode;
  const addonPlans = plans.filter((plan) => plan.code.startsWith('additional_workspace_') && isPlanSelectable(plan));
  const primaryPlans = plans.filter((plan) => !plan.code.startsWith('additional_workspace') && isPlanSelectable(plan));
  const planOptions = subscription?.isAddon ? addonPlans : primaryPlans;
  const availablePlans = planOptions.filter((plan) => plan.employee_limit >= employeeCount);
  const [selectedPlanCode, setSelectedPlanCode] = useState(
    subscription?.planCode ?? availablePlans[0]?.code ?? 'up_to_20',
  );
  const [selectedAddonPlanCode, setSelectedAddonPlanCode] = useState(subscription?.isAddon
    ? subscription.planCode
    : addonPlans[0]?.code ?? 'additional_workspace_20');
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [companyManagerName, setCompanyManagerName] = useState(managerName);
  const [companyBillingAddress, setCompanyBillingAddress] = useState('');
  const [companyVatCode, setCompanyVatCode] = useState('');
  const [orderMonths, setOrderMonths] = useState('1');
  const pendingOrder = subscription?.paymentStatus === 'Laukiama apmokėjimo'
    && Boolean(subscription.preinvoiceNumber)
    && subscription.status !== 'Atšaukta';
  const awaitingOrder = subscription?.status === 'Laukiama sąskaitos' && !subscription.orderCode;
  const canOrder = !adminRestoreRequired && !pendingOrder && (!subscription || subscription.status !== 'Aktyvi' || cloudMode);
  const effectivePlanCode = availablePlans.some((plan) => plan.code === selectedPlanCode)
    ? selectedPlanCode
    : availablePlans[0]?.code ?? '';
  const currentPlanCode = subscription?.isRenewal && pendingOrder
    ? subscription.paidPlanCode ?? subscription.planCode
    : subscription?.planCode;
  const currentPlan = plans.find((plan) => plan.code === currentPlanCode);
  const selectedPlan = planOptions.find((plan) => plan.code === selectedPlanCode);
  const effectiveAddonPlanCode = addonPlans.some((plan) => plan.code === selectedAddonPlanCode)
    ? selectedAddonPlanCode
    : addonPlans[0]?.code ?? '';
  const selectedAddonPlan = addonPlans.find((plan) => plan.code === effectiveAddonPlanCode);
  const pendingPlanChange = subscription?.isPlanChange && subscription.paymentStatus === 'Laukiama apmokėjimo';
  const canChangePlan = cloudMode && subscription?.status === 'Aktyvi' && !pendingOrder;
  const activeSubscription = subscription?.status === 'Aktyvi';
  const activeEmployeeLimit = currentPlan?.employee_limit;
  const subscriptionRemainingTime = subscription?.endsAt
    ? new Date(subscription.endsAt).getTime() > now
      ? ` · liko ${Math.ceil((new Date(subscription.endsAt).getTime() - now) / 86_400_000)} d.`
      : ' · galiojimas pasibaigė'
    : '';
  const formatPrice = (price) => new Intl.NumberFormat('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price ?? 0);

  const handleOrder = (event) => {
    event.preventDefault();
    if (cloudMode) {
      onOrder(effectivePlanCode, Number(orderMonths));
      return;
    }
    if (subscription) onDemoAction(subscription.id, subscription.status === 'Aktyvi' ? 'renew' : 'restore');
  };

  const submitAdditionalCompany = (event) => {
    event.preventDefault();
    onAddCompany({
      companyName,
      companyCode,
      managerName: companyManagerName,
      billingAddress: companyBillingAddress,
      vatCode: companyVatCode,
      planCode: effectiveAddonPlanCode,
    });
    setCompanyName('');
    setCompanyCode('');
    setCompanyManagerName(managerName);
    setCompanyBillingAddress('');
    setCompanyVatCode('');
    setShowAddCompany(false);
  };

  return <div className="space-y-4" data-readonly-allowed={readOnly || locked ? '' : undefined}>
    <p className="text-xs text-slate-500">
      Aktyvūs darbuotojai: {employeeCount}{typeof activeEmployeeLimit === 'number' ? ` / ${activeEmployeeLimit}` : ''}. Archyvuoti darbuotojai į plano limitą neįskaičiuojami.
    </p>
    {subscription
      ? <>
        <p className="text-lg font-bold">{subscription.isRenewal && pendingOrder ? subscription.paidPlanName ?? subscription.plan : subscription.plan} · {formatPrice(subscription.isRenewal && pendingOrder ? subscription.paidPrice ?? subscription.price : subscription.price)} €/mėn.</p>
        <p className={`text-sm font-semibold ${subscription.status === 'Laukiama sąskaitos' ? 'text-amber-800' : 'text-slate-700'}`}>
          Būsena: {subscription.cancelAtPeriodEnd ? 'Atšaukiama laikotarpio pabaigoje' : awaitingOrder ? 'Laukiama užsakymo' : subscription.status === 'Laukiama sąskaitos' ? 'Laukiama apmokėjimo' : subscription.status}
          {subscription.endsAt ? ` · galioja iki ${new Date(subscription.endsAt).toLocaleDateString('lt-LT')}${subscriptionRemainingTime}` : ''}
        </p>
        {adminRestoreRequired
          ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">2 mėn. peržiūros laikotarpis baigėsi. Dėl prieigos atkūrimo kreipkitės į DSS Pro administratorių.</p>
          : (subscription.status === 'Laukiama sąskaitos' || locked) && <p className="text-sm text-slate-600">Pasirinkite prenumeratos laikotarpį ir pateikite užsakymą.</p>}
        {subscription.isInitialTrialAccess && subscription.paymentStatus !== 'Apmokėta' && (subscription.status !== 'Aktyvi' || locked) && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">Pirmojo užsakymo 5 dienų prieiga jau panaudota. Naujas užsakymas prieigos nesuteiks, kol apmokėjimo nepatvirtins DSS Pro administratorius.</p>}
        {subscription.paymentStatus === 'Laukiama apmokėjimo' && subscription.status !== 'Atšaukta' && <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p>{subscription.isPlanChange
          ? <>Plano pakeitimą aktyvavome iškart. Atsisiųskite kainų skirtumo išankstinę sąskaitą ir apmokėkite per 5 dienas; kitu atveju bus grąžintas ankstesnis planas.</>
          : subscription.isRenewal
            ? <>Pratęsimo užsakymas <strong>{subscription.orderCode}</strong> pateiktas pasirinkus planą „{subscription.plan}“. Dabartinis planas galioja iki {subscription.endsAt ? new Date(subscription.endsAt).toLocaleDateString('lt-LT') : 'esamo laikotarpio pabaigos'}; apmokėjus laikotarpis bus pratęstas {subscription.orderMonths} mėn. Jei prenumerata baigsis iki apmokėjimo patvirtinimo, pratęsimas prasidės nuo patvirtinimo datos. Išankstinę sąskaitą apmokėkite per 5 dienas.</>
            : subscription.isReactivation
              ? <>Šiam užsakymui 5 dienų laikina prieiga netaikoma. Apmokėjus išankstinę sąskaitą, prenumerata bus aktyvuota DSS Pro administratoriui patvirtinus mokėjimą.</>
              : subscription.isInitialTrialAccess
                ? <>Pirmasis užsakymas <strong>{subscription.orderCode}</strong> suteikia 5 dienų prieigą. Per šį laiką apmokėkite išankstinę sąskaitą; nepatvirtinus mokėjimo prieiga bus užblokuota.</>
                : <>Užsakymas <strong>{subscription.orderCode}</strong> pateiktas. 5 dienų laikina prieiga šiam užsakymui netaikoma. Apmokėjus išankstinę sąskaitą, prieiga bus atkurta DSS Pro administratoriui patvirtinus mokėjimą.</>}</p>{subscription.preinvoiceNumber && onOpenInvoice && <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-amber-800 px-3 py-2 font-semibold text-amber-950 hover:bg-amber-100" onClick={() => onOpenInvoice(subscription.id, 'preinvoice')}><Download size={15} />Atsisiųsti išankstinę sąskaitą</button>}{!subscription.isPlanChange && onCancelOrder && <button type="button" className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-rose-700 px-3 py-2 font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50" disabled={busy} onClick={() => { if (window.confirm('Atšaukti šį neapmokėtą užsakymą? Išankstinė sąskaita liks sąskaitų istorijoje.')) onCancelOrder(subscription.id); }}>Atšaukti užsakymą</button>}</div>}
        {subscription.status === 'Atšaukta' && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{subscription.isInitialTrialAccess && readOnly
          ? 'Pirmasis užsakymas ir jo išankstinė sąskaita atšaukti – sąskaitos peržiūrėti ar apmokėti nebegalima. Iki peržiūros laikotarpio pabaigos įmonės duomenis galite peržiūrėti tik skaitymo režimu ir atsisiųsti PDF. Naujas užsakymas 5 dienų prieigos nesuteiks.'
          : 'Šis užsakymas atšauktas. Išankstinės sąskaitos peržiūrėti ar apmokėti nebegalima; jos įrašas paliktas sąskaitų istorijoje.'}</p>}
        {subscription.paymentStatus === 'Apmokėta' && <p className="text-sm text-emerald-800">Mokėjimas užsakymui {subscription.orderCode} patvirtintas.</p>}
        {readOnly && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">Prenumerata pasibaigė. 2 mėn. peržiūros laikotarpiu galima peržiūrėti duomenis ir atsisiųsti PDF.</p>}
      </>
      : <p className="text-sm text-slate-600">Prenumeratos įrašas dar nesukurtas. Pateikite užsakymą.</p>}

    {canChangePlan && <form onSubmit={(event) => { event.preventDefault(); if (selectedPlan && selectedPlan.code !== subscription.planCode && selectedPlan.employee_limit >= employeeCount) onChangePlan(selectedPlan.code); }} className="space-y-3 rounded-md border border-slate-200 p-3">
      <label className="block text-sm font-medium">Keisti darbuotojų skaičiaus planą
        <select className={`${inputClass} mt-1`} value={selectedPlanCode} onChange={(event) => setSelectedPlanCode(event.target.value)}>
          {planOptions.map((plan) => <option key={plan.code} value={plan.code} disabled={plan.employee_limit < employeeCount && plan.code !== subscription.planCode}>{plan.name} · {formatPrice(plan.amount_cents / 100)} €/mėn.{plan.employee_limit < employeeCount && plan.code !== subscription.planCode ? ' · nepakanka aktyvių darbuotojų limitui' : ''}</option>)}
        </select>
      </label>
      <p className="text-xs text-slate-500">Pakeitimas įsigalioja iškart; kaina perskaičiuojama už likusį laikotarpį.</p>
      {selectedPlan?.code !== subscription.planCode && <button type="submit" className={buttonClass} disabled={busy || !selectedPlan || selectedPlan.employee_limit < employeeCount}><CreditCard size={16} />{busy ? 'Keičiama…' : `${selectedPlan && currentPlan && selectedPlan.amount_cents < currentPlan.amount_cents ? 'Sumažinti' : 'Atnaujinti'} planą`}</button>}
    </form>}
    {pendingPlanChange && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Palaukite, kol bus patvirtintas plano pakeitimo sąskaitos apmokėjimas, arba apmokėkite ją per 5 dienas.</p>}

    {subscription?.isAddon
      ? <div className="space-y-3">
        <p className="text-sm text-slate-600">Papildomos įmonės planas pagal aktyvių darbuotojų skaičių. Šios darbo srities duomenys atskirti nuo kitų įmonių.</p>
        {canOrder && <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">Darbuotojų skaičiaus planas<select className={`${inputClass} mt-1`} value={effectiveAddonPlanCode} onChange={(event) => setSelectedAddonPlanCode(event.target.value)}>{addonPlans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} · {formatPrice(plan.amount_cents / 100)} €/mėn.</option>)}</select></label>
          <label className="text-sm font-medium"><span className="block">Laikotarpis (mėn.)</span><input className={`${inputClass} mt-2 w-16 max-w-16`} type="number" min="1" max="36" step="1" required value={orderMonths} onChange={(event) => setOrderMonths(event.target.value)} /></label>
          <button type="button" className={buttonClass} disabled={busy || !effectiveAddonPlanCode || !Number.isInteger(Number(orderMonths)) || Number(orderMonths) < 1 || Number(orderMonths) > 36} onClick={() => onOrder(effectiveAddonPlanCode, Number(orderMonths))}><RotateCcw size={16} />{activeSubscription ? 'Pratęsti prenumeratą' : 'Užsakyti papildomos įmonės prenumeratą'}</button>
        </div>}
        {activeSubscription && canOrder && <p className="text-xs text-slate-600">Išankstinę sąskaitą galite užsisakyti dabar. Apmokėjus mėnesiai bus pridėti prie esamos galiojimo pabaigos.</p>}
      </div>
      : canOrder ? <form onSubmit={handleOrder} className="space-y-3">
        <label className="block text-sm font-medium">Darbuotojų skaičiaus planas
          <select className={`${inputClass} mt-1`} value={effectivePlanCode} onChange={(event) => setSelectedPlanCode(event.target.value)} disabled={!availablePlans.length}>
            {availablePlans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} · {formatPrice(plan.amount_cents / 100)} €/mėn.</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium"><span className="block">Užsakymo laikotarpis (mėn.)</span><input className={`${inputClass} mt-2 w-16 max-w-16`} type="number" min="1" max="36" step="1" required value={orderMonths} onChange={(event) => setOrderMonths(event.target.value)} /></label>
        <p className="text-xs text-slate-500">Aktyvūs darbuotojai: {employeeCount}.</p>
        <button type="submit" className={buttonClass} disabled={busy || !availablePlans.length}>
          <CreditCard size={16} />{busy ? 'Pateikiama…' : activeSubscription ? 'Pratęsti prenumeratą' : 'Užsakyti prenumeratą'}
        </button>
        {activeSubscription && <p className="text-xs text-slate-600">Išankstinę sąskaitą galite užsisakyti dabar. Apmokėjus mėnesiai bus pridėti prie esamos galiojimo pabaigos.</p>}
      </form> : <p className="text-sm text-slate-600">{pendingOrder ? 'Pirmiausia apmokėkite arba atšaukite esamą išankstinę sąskaitą.' : 'Užsakymą galėsite pateikti pasibaigus aktyviam laikotarpiui.'}</p>}

    {cloudMode && !readOnly && !locked && <div className="border-t border-slate-200 pt-4">
      {!showAddCompany
        ? <button type="button" className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50" onClick={() => setShowAddCompany(true)}>+ Pridėti įmonę</button>
        : <form onSubmit={submitAdditionalCompany} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Naujos įmonės pavadinimas<input className={`${inputClass} mt-1`} value={companyName} onChange={(event) => setCompanyName(event.target.value)} required /></label>
          <label className="text-sm font-medium">Įmonės kodas<input className={`${inputClass} mt-1`} value={companyCode} onChange={(event) => setCompanyCode(event.target.value)} required /></label>
          <label className="text-sm font-medium sm:col-span-2">Vadovo vardas ir pavardė<input className={`${inputClass} mt-1`} autoComplete="name" value={companyManagerName} onChange={(event) => setCompanyManagerName(event.target.value)} required /></label>
          <label className="text-sm font-medium sm:col-span-2">Adresas<textarea className={`${inputClass} mt-1 min-h-20`} maxLength={500} value={companyBillingAddress} onChange={(event) => setCompanyBillingAddress(event.target.value)} required /></label>
          <label className="text-sm font-medium sm:col-span-2">PVM mokėtojo kodas<input className={`${inputClass} mt-1`} maxLength={40} value={companyVatCode} onChange={(event) => setCompanyVatCode(event.target.value)} /></label>
          <label className="text-sm font-medium sm:col-span-2">Papildomos įmonės planas<select className={`${inputClass} mt-1`} value={effectiveAddonPlanCode} onChange={(event) => setSelectedAddonPlanCode(event.target.value)} required>{addonPlans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} · {formatPrice(plan.amount_cents / 100)} €/mėn.</option>)}</select></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" className={buttonClass} disabled={busy || !selectedAddonPlan}>Sukurti darbo sritį · {formatPrice((selectedAddonPlan?.amount_cents ?? 0) / 100)} €/mėn.</button><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => setShowAddCompany(false)}>Atšaukti</button></div>
        </form>}
    </div>}
  </div>;
}

export function CompanyBillingDetailsEditor({ initialAddress, initialVatCode, onSave, inputClass, buttonClass }) {
  const [address, setAddress] = useState(initialAddress);
  const [vatCode, setVatCode] = useState(initialVatCode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ billingAddress: address.trim(), vatCode: vatCode.trim() });
    } catch (saveError) {
      setError(saveError.message || 'Įmonės rekvizitų išsaugoti nepavyko.');
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={save} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
    <h3 className="text-sm font-semibold">Duomenys sąskaitoms</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">PVM mokėtojo kodas<input className={`${inputClass} mt-1`} maxLength={40} value={vatCode} onChange={(event) => setVatCode(event.target.value)} placeholder="LT123456789" /></label>
      <label className="text-sm font-medium sm:col-span-2">Adresas<textarea className={`${inputClass} mt-1 min-h-20`} maxLength={500} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Gatvė, miestas, pašto kodas, šalis" /></label>
    </div>
    <p className="text-xs text-slate-500">Šie duomenys bus įrašyti į naujų prenumeratų išankstines ir galutines sąskaitas. Jau išrašytos sąskaitos nekeičiamos.</p>
    <button type="submit" className={buttonClass} disabled={saving}>{saving ? 'Saugoma…' : 'Išsaugoti rekvizitus'}</button>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </form>;
}

export function SubscriptionInvoiceArchive({ subscriptions, organizationName, onOpenInvoice, onDeleteInvoice, deletingInvoiceId = '', hidePaidPreinvoice = false, hideCanceledPreinvoice = false, inputClass }) {
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [page, setPage] = useState(1);
  const [loadingInvoice, setLoadingInvoice] = useState('');
  const [error, setError] = useState('');
  const pageSize = 20;
  const invoices = subscriptions.flatMap((subscription) => [
    ...(subscription.preinvoiceNumber && !(hidePaidPreinvoice && subscription.finalInvoiceNumber) ? [{
      key: `${subscription.id}:preinvoice`,
      subscriptionId: subscription.id,
      type: 'preinvoice',
      number: subscription.preinvoiceNumber,
      date: subscription.preinvoiceDate ?? subscription.orderedAt ?? subscription.createdAt,
      title: 'Išankstinė sąskaita',
      subscription,
    }] : []),
    ...(subscription.finalInvoiceNumber ? [{
      key: `${subscription.id}:final`,
      subscriptionId: subscription.id,
      type: 'final',
      number: subscription.finalInvoiceNumber,
      date: subscription.finalInvoiceDate ?? subscription.paidAt,
      title: 'Sąskaita faktūra',
      subscription,
    }] : []),
  ]).filter((invoice) => invoice.date).sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const currentYear = String(new Date().getFullYear());
  const years = [...new Set([currentYear, ...invoices.map((invoice) => String(new Date(invoice.date).getFullYear()))])].sort((a, b) => Number(b) - Number(a));
  const effectiveYear = years.includes(selectedYear) ? selectedYear : currentYear;
  const yearInvoices = invoices.filter((invoice) => String(new Date(invoice.date).getFullYear()) === effectiveYear);
  const pageCount = Math.max(1, Math.ceil(yearInvoices.length / pageSize));
  const visibleInvoices = yearInvoices.slice((page - 1) * pageSize, page * pageSize);

  const openInvoice = async (invoice) => {
    setLoadingInvoice(invoice.key);
    setError('');
    try {
      await onOpenInvoice(invoice.subscriptionId, invoice.type);
    } catch (openError) {
      setError(openError.message || 'Sąskaitos atidaryti nepavyko.');
    } finally {
      setLoadingInvoice('');
    }
  };

  const deleteInvoice = async (invoice) => {
    if (!onDeleteInvoice) return;
    if (invoice.type === 'preinvoice' && invoice.subscription.paymentStatus === 'Laukiama apmokėjimo') return;
    if (!window.confirm(`Ar tikrai ištrinti ${invoice.title.toLocaleLowerCase('lt')} „${invoice.number}“ iš įmonės „${organizationName}“?\n\nPrenumerata ir apmokėjimo istorija liks nepakeistos. Šio veiksmo atšaukti negalima.`)) return;
    setError('');
    try {
      await onDeleteInvoice(invoice.subscriptionId, invoice.type);
    } catch (deleteError) {
      setError(deleteError.message || 'Sąskaitos ištrinti nepavyko.');
    }
  };

  return <div className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <p className="text-sm text-slate-600">{invoices.length ? `${invoices.length} sąskait${invoices.length === 1 ? 'a' : 'os'} · naujausios pirmiausia` : 'Sąskaitų dar nėra.'}</p>
      <label className="text-sm font-medium">Metai<select className={`${inputClass} mt-1 min-w-28`} value={effectiveYear} onChange={(event) => { setSelectedYear(event.target.value); setPage(1); }}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
    </div>
    {visibleInvoices.length > 0 && <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
      {visibleInvoices.map((invoice) => <div key={invoice.key} className="flex flex-wrap items-center justify-between gap-3 bg-white px-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{invoice.number} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${invoice.type === 'final' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{invoice.title}</span>{invoice.type === 'preinvoice' && invoice.subscription.status === 'Atšaukta' && <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-900">Atšaukta · nemokėti</span>}</p>
          <p className="mt-1 text-xs text-slate-500">{new Date(invoice.date).toLocaleDateString('lt-LT')} · {invoice.subscription.plan}{invoice.subscription.orderMonths > 1 ? ` · ${invoice.subscription.orderMonths} mėn.` : ''}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!(hideCanceledPreinvoice && invoice.type === 'preinvoice' && invoice.subscription.status === 'Atšaukta') && <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50" disabled={loadingInvoice === invoice.key} onClick={() => openInvoice(invoice)}><Download size={15} />{loadingInvoice === invoice.key ? 'Atidaroma…' : 'Peržiūrėti / atsisiųsti'}</button>}
          {onDeleteInvoice && <button type="button" aria-label={`Ištrinti sąskaitą ${invoice.number}`} title={invoice.type === 'preinvoice' && invoice.subscription.paymentStatus === 'Laukiama apmokėjimo' ? 'Negalima ištrinti, kol laukiama apmokėjimo.' : undefined} className="grid size-10 place-items-center rounded-md border border-rose-300 text-rose-800 hover:bg-rose-50 disabled:opacity-40" disabled={deletingInvoiceId === invoice.subscriptionId || invoice.type === 'preinvoice' && invoice.subscription.paymentStatus === 'Laukiama apmokėjimo'} onClick={() => deleteInvoice(invoice)}><Trash2 size={15} /></button>}
        </div>
      </div>)}
    </div>}
    {invoices.length > 0 && yearInvoices.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Šiais metais sąskaitų nėra.</p>}
    {yearInvoices.length > pageSize && <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm"><span className="text-slate-500">Rodoma {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, yearInvoices.length)} iš {yearInvoices.length}</span><nav className="flex items-center gap-2" aria-label="Sąskaitų puslapiavimas"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Atgal</button><span>{page} / {pageCount}</span><button type="button" className="rounded-md border border-slate-300 px-3 py-2 disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Toliau</button></nav></div>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}

export function LazySubscriptionInvoiceArchive({ organizationId, organizationName, onLoadInvoices, onOpenInvoice, onDeleteInvoice, deletingInvoiceId = '', inputClass }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState('');

  const loadInvoices = async (refresh = false) => {
    if (loading || invoices && !refresh) return;
    setLoading(true);
    setError('');
    try {
      const loadedInvoices = await onLoadInvoices(organizationId);
      setInvoices(loadedInvoices);
      return loadedInvoices;
    } catch (loadError) {
      setError(loadError.message || 'Sąskaitų istorijos užkrauti nepavyko.');
      throw loadError;
    } finally {
      setLoading(false);
    }
  };

  const deleteInvoice = async (...args) => {
    await onDeleteInvoice(...args);
    await loadInvoices(true);
  };

  return <details className="rounded-md border border-slate-200 bg-white" onToggle={(event) => {
    const isOpen = event.currentTarget.open;
    setOpen(isOpen);
    if (isOpen && !invoices && !loading) {
      loadInvoices().catch((loadError) => setError(loadError.message || 'Sąskaitų istorijos užkrauti nepavyko.'));
    }
  }}>
    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">
      Sąskaitų istorija{loading ? ' · įkeliama…' : invoices ? ` · ${invoices.reduce((count, item) => count + Number(Boolean(item.preinvoiceNumber)) + Number(Boolean(item.finalInvoiceNumber)), 0)} dok.` : ''}
    </summary>
    {open && <div className="border-t border-slate-200 p-3">
      {loading && <p className="text-sm text-slate-500">Kraunama sąskaitų istorija…</p>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {invoices && <SubscriptionInvoiceArchive
        subscriptions={invoices}
        organizationName={organizationName}
        onOpenInvoice={onOpenInvoice}
        onDeleteInvoice={onDeleteInvoice ? deleteInvoice : undefined}
        deletingInvoiceId={deletingInvoiceId}
        inputClass={inputClass}
      />}
    </div>}
  </details>;
}
