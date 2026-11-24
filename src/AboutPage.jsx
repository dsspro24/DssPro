import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, FileCheck2, ShieldCheck, Users } from 'lucide-react';

const SITE_URL = 'https://www.dsspro.lt';

function setAboutMetadata() {
  const title = 'Apie DSS Pro | Darbuotojų saugos procesų sistema';
  const description = 'Sužinokite, kaip DSS Pro padeda įmonėms tvarkyti darbuotojų instruktavimus, testus, saugos žurnalus, parašus ir dokumentus.';
  const canonical = `${SITE_URL}/apie-mus`;
  const metaTags = {
    description,
    'og:title': title,
    'og:description': description,
    'og:url': canonical,
  };
  const originalTitle = document.title;
  const originals = [];
  Object.entries(metaTags).forEach(([key, value]) => {
    const property = key.startsWith('og:');
    const selector = property ? `meta[property="${key}"]` : `meta[name="${key}"]`;
    const element = document.head.querySelector(selector);
    originals.push({ element, property, key, content: element?.content, existed: Boolean(element) });
    const target = element ?? document.createElement('meta');
    target.setAttribute(property ? 'property' : 'name', key);
    target.content = value;
    if (!element) document.head.append(target);
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
    originals.forEach(({ element, property, key, content, existed }) => {
      if (existed) element.content = content;
      else document.head.querySelector(property ? `meta[property="${key}"]` : `meta[name="${key}"]`)?.remove();
    });
    if (createdCanonical) canonicalLink.remove();
    else canonicalLink.href = originalCanonical;
  };
}

export default function AboutPage() {
  useEffect(() => setAboutMetadata(), []);

  const features = [
    { icon: Users, title: 'Darbuotojų ir įmonių valdymas', text: 'Pakvieskite komandą, priskirkite prieigas ir susiekite darbuotojus su jų įmonės darbo vieta.' },
    { icon: BookOpen, title: 'Instruktavimai ir testai', text: 'Organizuokite mokymus, žinių patikrinimus ir stebėkite jų atlikimo būseną.' },
    { icon: FileCheck2, title: 'Žurnalai ir parašai', text: 'Tvarkykite DSS dokumentus, rinkite parašus ir eksportuokite paruoštus PDF įrašus.' },
    { icon: ShieldCheck, title: 'Kasdienė saugos tvarka', text: 'Vienoje vietoje matykite terminus, užduotis, ataskaitas ir svarbias darbuotojo saugos veiklas.' },
  ];

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
        <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Apie DSS Pro</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Darbuotojų saugos procesai vienoje vietoje</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">DSS Pro – internetinė sistema įmonėms, kurios nori tvarkyti darbuotojų instruktavimus, testus, DSS žurnalus, parašus ir su saugos procesais susijusius dokumentus aiškiau ir patogiau.</p>

        <section className="mt-10 grid gap-5 md:grid-cols-2" aria-label="DSS Pro galimybės">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-slate-200 p-6">
              <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><Icon size={21} /></span>
              <h2 className="mt-5 text-xl font-bold text-slate-950">{title}</h2>
              <p className="mt-2 leading-7 text-slate-600">{text}</p>
            </article>
          ))}
        </section>

        <section className="mt-10 rounded-2xl bg-[#0c4a3b] p-6 text-white sm:p-8">
          <h2 className="text-2xl font-bold">Patogiau vadovui, darbuotojui ir DSS specialistui</h2>
          <p className="mt-3 max-w-3xl leading-7 text-emerald-50">DSS Pro skirta kasdieninei organizacijai: užduotims, terminams, parašams ir dokumentams stebėti. Sistemą galima pradėti nemokama DSS specialisto paskyra arba išbandyti be registracijos.</p>
          <a href="/kontaktai" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#0c4a3b]">Susisiekti <ArrowRight size={16} /></a>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 px-5 py-6 text-center text-xs text-slate-500">
        <nav aria-label="Poraštės nuorodos" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <a href="/kontaktai" className="font-semibold text-emerald-800">Kontaktai</a>
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
