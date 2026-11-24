import { useEffect } from 'react';
import { ArrowLeft, Mail, MessageSquareText } from 'lucide-react';

const EMAIL = 'dsspro@inbox.lt';

function setContactMetadata() {
  const title = 'Kontaktai | DSS Pro';
  const description = 'Susisiekite su DSS Pro el. paštu klausimais apie sistemą, planus, registraciją ar bendradarbiavimą.';
  const canonical = 'https://www.dsspro.lt/kontaktai';
  const originalTitle = document.title;
  const entries = [
    ['name', 'description', description],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', canonical],
  ];
  const originals = entries.map(([attribute, key, content]) => {
    const element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    return { element, attribute, key, content: element?.content, existed: Boolean(element), nextContent: content };
  });
  entries.forEach(([attribute, key, content]) => {
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.content = content;
  });
  let canonicalLink = document.querySelector('link[rel="canonical"]');
  const createdCanonical = !canonicalLink;
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    document.head.append(canonicalLink);
  }
  const originalCanonical = canonicalLink.href;
  canonicalLink.href = canonical;
  document.title = title;
  return () => {
    document.title = originalTitle;
    originals.forEach(({ element, attribute, key, content, existed }) => {
      if (existed) element.content = content;
      else document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
    });
    if (createdCanonical) canonicalLink.remove();
    else canonicalLink.href = originalCanonical;
  };
}

export default function ContactPage() {
  useEffect(() => setContactMetadata(), []);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
          <a href="/" className="text-xl font-black tracking-tight text-[#0c4a3b]" aria-label="DSS Pro pradžia">DSS<span className="ml-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-sm font-bold text-emerald-800">Pro</span></a>
          <a href="/" className="text-sm font-semibold text-slate-600 hover:text-emerald-800">Į DSS Pro svetainę</a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <a href="/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950"><ArrowLeft size={16} />Į pradžią</a>
        <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Kontaktai</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Susisiekite su DSS Pro</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Rašykite mums dėl DSS Pro sistemos, planų, registracijos, individualaus plano ar bendradarbiavimo klausimų.</p>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 p-6 sm:p-8">
            <span className="grid size-12 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><Mail size={22} /></span>
            <h2 className="mt-5 text-xl font-bold text-slate-950">El. paštas</h2>
            <p className="mt-2 leading-7 text-slate-600">Greičiausias būdas susisiekti.</p>
            <a href={`mailto:${EMAIL}`} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#0c4a3b] px-5 py-3 text-sm font-bold text-white hover:bg-emerald-900">{EMAIL}</a>
          </article>
          <article className="rounded-2xl border border-slate-200 p-6 sm:p-8">
            <span className="grid size-12 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><MessageSquareText size={22} /></span>
            <h2 className="mt-5 text-xl font-bold text-slate-950">Pagalba ir klausimai</h2>
            <p className="mt-2 leading-7 text-slate-600">Rašydami nurodykite, ar klausimas susijęs su paskyra, darbuotojų kvietimais, prenumerata ar kitu sistemos klausimu.</p>
          </article>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 px-5 py-6 text-center text-xs text-slate-500">
        <nav aria-label="Poraštės nuorodos" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <a href="/apie-mus" className="font-semibold text-emerald-800">Apie mus</a>
          <a href="/tinklarastis" className="font-semibold text-emerald-800">Tinklaraštis</a>
          <a href="/vdi-testai" className="font-semibold text-emerald-800">VDI testai</a>
          <a href="/naudojimo-salygos" className="font-semibold text-emerald-800">Naudojimo sąlygos</a>
          <a href="/privatumo-politika" className="font-semibold text-emerald-800">Privatumo politika</a>
        </nav>
        <p className="mt-3">© 2026 DSS Pro. Visos teisės saugomos.</p>
      </footer>
    </div>
  );
}
