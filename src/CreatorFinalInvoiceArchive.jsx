import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from './lib/supabase.js';

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100';

function formatInvoiceDate(value) {
  return value ? new Date(value).toLocaleDateString('lt-LT') : '—';
}

export default function CreatorFinalInvoiceArchive({ onOpenInvoice }) {
  const [yearSummaries, setYearSummaries] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [page, setPage] = useState(1);
  const [invoices, setInvoices] = useState([]);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState('');
  const pageSize = 25;

  useEffect(() => {
    let active = true;
    supabase.rpc('creator_subscription_invoice_years')
      .then(({ data, error: loadError }) => {
        if (loadError) throw loadError;
        if (!active) return;
        const summaries = data ?? [];
        setYearSummaries(summaries);
        if (!summaries.length) setLoadingInvoices(false);
        setSelectedYear((current) => current || String(
          summaries.find((summary) => summary.invoice_year === new Date().getFullYear())?.invoice_year
          ?? summaries[0]?.invoice_year
          ?? new Date().getFullYear(),
        ));
      })
      .catch((loadError) => {
        if (active) {
          setLoadingInvoices(false);
          setError(loadError.message || 'Sąskaitų metų užkrauti nepavyko.');
        }
      })
      .finally(() => {
        if (active) setLoadingYears(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedYear) return undefined;
    let active = true;
    const startDate = `${selectedYear}-01-01`;
    const endDate = `${Number(selectedYear) + 1}-01-01`;
    supabase.from('workspace_subscriptions')
      .select('id, organization_id, final_invoice_number, final_invoice_data, plan_name, order_months, organizations(name)', { count: 'exact' })
      .not('final_invoice_data', 'is', null)
      .gte('final_invoice_data->>issueDate', startDate)
      .lt('final_invoice_data->>issueDate', endDate)
      .order('final_invoice_data->>issueDate', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
      .then(({ data, count, error: loadError }) => {
        if (loadError) throw loadError;
        if (!active) return;
        setInvoices(data ?? []);
        setInvoiceCount(count ?? 0);
      })
      .catch((loadError) => {
        if (active) {
          setInvoices([]);
          setInvoiceCount(0);
          setError(loadError.message || 'Sąskaitų užkrauti nepavyko.');
        }
      })
      .finally(() => {
        if (active) setLoadingInvoices(false);
      });
    return () => { active = false; };
  }, [selectedYear, page]);

  const selectedSummary = yearSummaries.find((summary) => String(summary.invoice_year) === selectedYear);
  const pageCount = Math.max(1, Math.ceil(invoiceCount / pageSize));
  const total = new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR' })
    .format((Number(selectedSummary?.total_amount_cents) || 0) / 100);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm text-slate-600">Pasirinktų metų visų įmonių SF suma</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{loadingYears ? 'Skaičiuojama…' : total}</p>
      </div>
      <label className="text-sm font-medium">Metai
        <select className={`${inputClass} mt-1 min-w-36`} value={selectedYear} disabled={loadingYears} onChange={(event) => { setLoadingInvoices(true); setError(''); setSelectedYear(event.target.value); setPage(1); }}>
          {!yearSummaries.length && <option value={selectedYear}>{selectedYear || new Date().getFullYear()}</option>}
          {yearSummaries.map((summary) => <option key={summary.invoice_year} value={String(summary.invoice_year)}>{summary.invoice_year} · {summary.invoice_count} SF</option>)}
        </select>
      </label>
    </div>
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loadingInvoices ? <p className="py-6 text-center text-sm text-slate-500">Kraunamos sąskaitos…</p>
      : invoices.length > 0 ? <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
        {invoices.map((invoice) => {
          const invoiceData = invoice.final_invoice_data ?? {};
          const organizationName = Array.isArray(invoice.organizations)
            ? invoice.organizations[0]?.name
            : invoice.organizations?.name;
          const amount = Number(invoiceData.totalAmountCents);
          return <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 bg-white px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{invoice.final_invoice_number || invoiceData.invoiceNumber || 'SF'} <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">Sąskaita faktūra</span></p>
              <p className="mt-1 text-xs text-slate-500">{organizationName || 'Įmonė'} · {invoice.plan_name}{invoice.order_months > 1 ? ` · ${invoice.order_months} mėn.` : ''} · {formatInvoiceDate(invoiceData.issueDate)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {Number.isFinite(amount) && <strong className="text-sm tabular-nums">{new Intl.NumberFormat('lt-LT', { style: 'currency', currency: invoiceData.currency ?? 'EUR' }).format(amount / 100)}</strong>}
              <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50" onClick={() => onOpenInvoice(invoice.id, 'final')}><Download size={15} />Peržiūrėti / atsisiųsti</button>
            </div>
          </div>;
        })}
      </div> : <p className="rounded-md border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Pasirinktais metais sąskaitų faktūrų nėra.</p>}
    {invoiceCount > pageSize && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
      <span className="text-slate-500">Rodoma {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, invoiceCount)} iš {invoiceCount}</span>
      <nav className="flex items-center gap-2" aria-label="Sąskaitų puslapiavimas">
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => { setLoadingInvoices(true); setPage((value) => Math.max(1, value - 1)); }}>Atgal</button>
        <span>{page} / {pageCount}</span>
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2 disabled:opacity-40" disabled={page >= pageCount} onClick={() => { setLoadingInvoices(true); setPage((value) => Math.min(pageCount, value + 1)); }}>Toliau</button>
      </nav>
    </div>}
  </div>;
}
