import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';

const PAGE_SIZE = 20;

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('lt-LT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function PrivacyConsentAdmin() {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.rpc('creator_list_privacy_consent_records', {
      input_page_size: PAGE_SIZE,
      input_page_offset: page * PAGE_SIZE,
    }).then(({ data, error: requestError }) => {
      if (!active) return;
      if (requestError) {
        setError(`Sutikimų žurnalo įkelti nepavyko: ${requestError.message}`);
      } else {
        const pageRecords = data ?? [];
        if (!pageRecords.length && page > 0) {
          setPage(0);
          setLoading(true);
          return;
        }
        setRecords(pageRecords);
        setTotalRecords(Number(pageRecords[0]?.total_count ?? 0));
        setError('');
      }
      setLoading(false);
    }).catch((requestError) => {
      if (!active) return;
      setError(`Sutikimų žurnalo įkelti nepavyko: ${requestError.message || String(requestError)}`);
      setLoading(false);
    });
    return () => { active = false; };
  }, [page, refreshKey]);

  const refresh = () => {
    setError('');
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const firstRecord = totalRecords ? page * PAGE_SIZE + 1 : 0;
  const lastRecord = Math.min((page + 1) * PAGE_SIZE, totalRecords);

  return <section className="mt-8 space-y-4 border-t border-slate-200 pt-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 className="text-xl font-bold">Naudojimo sąlygų ir slapukų sutikimų žurnalas</h3><p className="mt-1 text-sm text-slate-600">Matomi registruotų paskyrų sutikimų įrašai. Anoniminio lankytojo pasirinkimas iki prisijungimo lieka jo naršyklėje.</p></div>
      <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={refresh} disabled={loading}>{loading ? 'Įkeliama…' : 'Atnaujinti'}</button>
    </div>
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loading && <p role="status" className="text-sm text-slate-500">Įkeliami sutikimai…</p>}
    {!loading && !error && !records.length && <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">Sutikimų įrašų dar nėra. Pritaikykite privatumo migraciją ir nauji registracijos / prisijungusių naudotojų pasirinkimai bus registruojami.</p>}
    {!loading && !error && records.length > 0 && <>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-slate-50"><tr>{['Naudotojas', 'Įrašas', 'Versija', 'Analitika', 'Užregistruota'].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{records.map((record) => <tr key={record.id}>
            <td className="px-3 py-2"><strong className="block">{record.full_name || '—'}</strong><span className="text-xs text-slate-500">{record.email || 'Paskyra ištrinta'}</span></td>
            <td className="px-3 py-2">{record.consent_type === 'terms' ? 'Naudojimo sąlygos' : 'Slapukų pasirinkimas'}</td>
            <td className="px-3 py-2">{record.consent_type === 'terms' ? `Sąlygos ${record.terms_version} · Privatumas ${record.privacy_policy_version}` : `Privatumas ${record.privacy_policy_version}`}</td>
            <td className="px-3 py-2">{record.consent_type === 'cookies' ? record.analytics ? 'Sutiko' : 'Atsisakė' : '—'}</td>
            <td className="px-3 py-2">{formatDate(record.recorded_at)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p aria-live="polite" className="text-slate-600">Rodoma {firstRecord}–{lastRecord} iš {totalRecords} įrašų · puslapis {page + 1} iš {totalPages}</p>
        <nav aria-label="Sutikimų žurnalo puslapiai" className="flex gap-2">
          <button type="button" className="rounded-md border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { setLoading(true); setPage((current) => current - 1); }} disabled={loading || page === 0}>Ankstesnis</button>
          <button type="button" className="rounded-md border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { setLoading(true); setPage((current) => current + 1); }} disabled={loading || page + 1 >= totalPages}>Kitas</button>
        </nav>
      </div>
    </>}
  </section>;
}
