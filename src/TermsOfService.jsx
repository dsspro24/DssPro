import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Save } from 'lucide-react';
import { supabase } from './lib/supabase.js';
import { TERMS_VERSION } from './lib/legalVersions.js';

const TERMS_PATH = '/naudojimo-salygos';
const SETTINGS_FIELDS = 'provider_name, registration_number, address, contact_email, terms_status, published_at, updated_at';
const defaultSettings = {
  provider_name: '',
  registration_number: '',
  address: '',
  contact_email: 'dsspro@inbox.lt',
  terms_status: 'draft',
  published_at: null,
  updated_at: null,
};

function updateTermsMetadata(isPublished) {
  const originalTitle = document.title;
  const values = [
    { attribute: 'name', key: 'description', content: isPublished ? 'DSS Pro naudojimo sąlygos įmonėms ir profesinei veiklai.' : 'DSS Pro naudojimo sąlygų projektas. Dar neįsigaliojo.' },
    { attribute: 'name', key: 'robots', content: isPublished ? 'index,follow' : 'noindex,nofollow' },
    { attribute: 'property', key: 'og:locale', content: 'lt_LT' },
    { attribute: 'property', key: 'og:site_name', content: 'DSS Pro' },
    { attribute: 'property', key: 'og:type', content: 'website' },
    { attribute: 'property', key: 'og:title', content: 'DSS Pro naudojimo sąlygos' },
    { attribute: 'property', key: 'og:description', content: isPublished ? 'DSS Pro naudojimo sąlygos įmonėms ir profesinei veiklai.' : 'DSS Pro naudojimo sąlygų projektas. Dar neįsigaliojo.' },
    { attribute: 'property', key: 'og:url', content: 'https://www.dsspro.lt/naudojimo-salygos' },
    { attribute: 'name', key: 'twitter:card', content: 'summary' },
  ];
  const previousTags = values.map(({ attribute, key }) => {
    const element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    return { attribute, key, element, content: element?.content, existed: Boolean(element) };
  });
  values.forEach(({ attribute, key, content }) => {
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.content = content;
  });
  let canonical = document.head.querySelector('link[rel="canonical"]');
  const hadCanonical = Boolean(canonical);
  const previousCanonical = canonical?.href ?? '';
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = 'https://www.dsspro.lt/naudojimo-salygos';
  document.title = `Naudojimo sąlygos | DSS Pro`;

  return () => {
    document.title = originalTitle;
    previousTags.forEach(({ attribute, key, element, content, existed }) => {
      if (existed) element.content = content;
      else document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
    });
    if (hadCanonical) canonical.href = previousCanonical;
    else canonical.remove();
  };
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('lt-LT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function TermsHeader() {
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
      <a href="/" className="text-xl font-black tracking-tight text-[#0c4a3b]" aria-label="DSS Pro pradžia">DSS<span className="ml-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-sm font-bold text-emerald-800">Pro</span></a>
      <a href="/" className="text-sm font-semibold text-slate-600 hover:text-emerald-800">Į DSS Pro svetainę</a>
    </div>
  </header>;
}

export default function TermsOfService() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState(supabase ? '' : 'Sąlygų rekvizitų įkelti nepavyko: duomenų bazė nesukonfigūruota.');

  useEffect(() => {
    let active = true;
    if (!supabase) return () => { active = false; };
    supabase.from('site_legal_settings').select(SETTINGS_FIELDS).eq('id', true).maybeSingle()
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) setError(`Sąlygų rekvizitų įkelti nepavyko: ${requestError.message}`);
        else if (data) setSettings({ ...defaultSettings, ...data });
        else setError('Sąlygų rekvizitų įkelti nepavyko: nustatymų įrašas nerastas.');
        setLoading(false);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(`Sąlygų rekvizitų įkelti nepavyko: ${requestError instanceof Error ? requestError.message : String(requestError)}`);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const isPublished = settings.terms_status === 'published';

  useEffect(() => updateTermsMetadata(isPublished), [isPublished]);

  return <div className="min-h-screen bg-white text-slate-900">
    <TermsHeader />
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <a href="/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950"><ArrowLeft size={16} />Į DSS Pro svetainę</a>
      {!isPublished && <div role="status" className="mb-7 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong className="block">Juodraštis – šios sąlygos dar neįsigaliojo.</strong>
        Paslaugos teikėjo rekvizitai dar nepatvirtinti. Kol administratoriaus nustatymuose sąlygos nepaskelbtos ir nepatikrintos pagal taikomus teisės aktus, šiame puslapyje pateiktas tekstas yra parengiamasis projektas.
      </div>}
      {error && <p role="alert" className="mb-7 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {(settings.provider_name || settings.registration_number || settings.address || settings.contact_email) && <section className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">{isPublished ? 'Paslaugos teikėjas' : 'Rengiami paslaugos teikėjo rekvizitai'}</p>
        {settings.provider_name && <h2 className="mt-2 text-lg font-bold">{settings.provider_name}</h2>}
        <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          {settings.registration_number && <div><dt className="inline text-slate-500">Įmonės / veiklos numeris: </dt><dd className="inline font-medium">{settings.registration_number}</dd></div>}
          {settings.address && <div><dt className="inline text-slate-500">Adresas: </dt><dd className="inline font-medium">{settings.address}</dd></div>}
          {settings.contact_email && <div><dt className="inline text-slate-500">El. paštas: </dt><dd className="inline font-medium"><a className="text-emerald-800 underline" href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a></dd></div>}
          {settings.published_at && <div><dt className="inline text-slate-500">Galioja nuo: </dt><dd className="inline font-medium">{formatDate(settings.published_at)}</dd></div>}
        </dl>
      </section>}

      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><FileText size={22} /></span>
        <div><p className="text-sm font-bold uppercase tracking-wide text-emerald-800">DSS Pro</p><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Naudojimo sąlygos</h1></div>
      </div>
      <p className="mt-4 text-sm text-slate-500">Versija {TERMS_VERSION}{isPublished && settings.updated_at ? ` · atnaujinta ${formatDate(settings.updated_at)}` : ''}</p>
      {loading && <p role="status" className="mt-5 text-sm text-slate-600">Įkeliami paslaugos teikėjo rekvizitai…</p>}

      <article className="mt-8 max-w-none space-y-8 text-base leading-7 text-slate-700">
        <section>
          <h2 className="text-xl font-bold text-slate-950">1. Kam skirtos šios sąlygos</h2>
          <p className="mt-2">Šios naudojimo sąlygos (toliau – Sąlygos) taikomos DSS Pro internetinei paslaugai, pasiekiamai adresu <a href="https://www.dsspro.lt" className="text-emerald-800 underline">www.dsspro.lt</a> (toliau – Paslauga). Paslauga skirta įmonėms ir asmenims, kurie ja naudojasi vykdydami profesinę ar verslo veiklą. Įmonės darbuotojai ir jos pakviesti DSS specialistai gali naudotis atskiromis paskyromis įmonės darbo užduotims atlikti.</p>
          <p className="mt-2">Sutartį įmonės vardu sudaro tinkamus įgaliojimus turintis atstovas. Sukurdamas paskyrą, pasirinkdamas mokamą planą ar naudodamasis Paslauga įmonės vardu, atstovas patvirtina, kad turi teisę įpareigoti atstovaujamą įmonę ir sutinka su tuo metu paskelbtomis Sąlygomis. Darbuotojai Paslauga naudojasi pagal įmonės suteiktas teises ir taikomas paskyros naudojimo taisykles.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">2. Kas yra ir kas nėra DSS Pro</h2>
          <p className="mt-2">DSS Pro yra programinė priemonė, skirta padėti įmonėms organizuoti darbuotojų saugos ir sveikatos procesus: valdyti mokymo bei supažindinimo užduotis, dokumentų šablonus, įrašus, parašus, ataskaitas ir susijusią informaciją. Paslaugos funkcijos priklauso nuo pasirinkto plano, paskyros teisių ir tuo metu veikiančių funkcijų.</p>
          <p className="mt-2"><strong>DSS Pro nėra teisės, darbo saugos, profesinės rizikos vertinimo, medicinos ar audito konsultacija ir nepakeičia kompetentingo specialisto.</strong> Sistema automatiškai nenustato, kokie dokumentai, mokymai, patikros, terminai ar apsaugos priemonės yra privalomi konkrečiai įmonei ar darbo vietai. Pateikti šablonai, straipsniai, testai, demonstraciniai duomenys ir automatiniai pranešimai yra pagalbinė priemonė, o ne oficialus institucijos patvirtinimas ar individuali išvada.</p>
          <p className="mt-2">Paslauga nėra skubių situacijų ar nelaimingų atsitikimų pranešimo kanalas. Kilus tiesioginiam pavojui, pirmiausia vadovaukitės savo įmonės procedūromis ir kreipkitės į atsakingas tarnybas.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">3. Įmonės ir jos naudotojų pareigos</h2>
          <p className="mt-2">Įmonė išlieka atsakinga už savo veiklai taikomų teisės aktų vykdymą, realių darbo sąlygų įvertinimą ir tinkamų prevencijos priemonių pasirinkimą. Įmonė, o ne vien programinė įranga, turi:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>nustatyti, kokie teisės aktų reikalavimai taikomi jos veiklai, darbo vietoms, darbuotojams ir konkretiems darbams, ir reguliariai patikrinti jų aktualią redakciją;</li>
            <li>paskirti kompetentingus ir įgaliotus asmenis, atlikti profesinės rizikos vertinimą ir nustatyti realias, darbuotojams tinkamas saugaus darbo priemones;</li>
            <li>prieš naudodama ar keisdama šablonus, mokomąją medžiagą, testus ir dokumentų formuluotes, patikrinti jų tikslumą, išsamumą, atitiktį faktinėms sąlygoms ir galiojantiems reikalavimams;</li>
            <li>įsitikinti, ar elektroninis įrašas, parašas, PIN patvirtinimas ar iš Paslaugos eksportuotas PDF konkrečiu atveju atitinka taikomus teisės aktus, įrodymų ir saugojimo reikalavimus;</li>
            <li>peržiūrėti įrašus ir terminus, prižiūrėti prieigos teises, laiku eksportuoti reikalingus dokumentus ir turėti tinkamus veiklos tęstinumo bei atsarginių kopijų procesus;</li>
            <li>užtikrinti, kad darbuotojai gautų reikiamus paaiškinimus, mokymus, priežiūrą ir praktines priemones – vien dokumento pažymėjimas ar užduoties būsena jų nepakeičia.</li>
          </ul>
          <p className="mt-3">Įmonė ir jos naudotojai privalo pateikti tikslią informaciją, teisėtai naudoti Paslaugą, saugoti prisijungimo duomenis ir PIN, nedelsdami pranešti apie įtariamą paskyros saugumo pažeidimą ir nesuteikti prieigos neįgaliotiems asmenims. Įmonė atsako už jai priskirtų naudotojų veiksmus ir jų prieigos teisių nustatymą.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">4. Asmens duomenys ir įmonės įkeliamas turinys</h2>
          <p className="mt-2">Įmonė privalo turėti teisėtą pagrindą į Paslaugą įvesti darbuotojų ar kitų asmenų duomenis, informuoti duomenų subjektus, teikti užklausas ir tvarkyti duomenis tik tiek, kiek reikia jos tikslams. Neįkelkite perteklinių, nesusijusių ar specialių kategorijų asmens duomenų, nebent tai būtina, teisėta ir tinkamai apsaugota.</p>
          <p className="mt-2">Priklausomai nuo konkretaus duomenų tvarkymo tikslo ir šalių vaidmenų, įmonė gali veikti kaip duomenų valdytoja, o Paslaugos teikėjas – kaip duomenų tvarkytojas. Tikslios tvarkymo sąlygos, duomenų kategorijos, saugojimas, subduomenų tvarkytojai ir duomenų subjektų užklausų tvarka turi būti apibrėžti atskirame privatumo pranešime ir, kai taikoma, duomenų tvarkymo susitarime. Šios Sąlygos savaime nėra toks susitarimas ir nepanaikina nė vienos šalies pareigų pagal duomenų apsaugos teisę.</p>
          <p className="mt-2">Įmonė atsako už savo įkeltų dokumentų, tekstų, vaizdų ir kitų medžiagų teisėtumą bei teises į juos. Įmonei priklausantys duomenys lieka jos arba atitinkamo teisių turėtojo nuosavybe.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">5. Planai, užsakymai ir atsiskaitymas</h2>
          <p className="mt-2">Mokamą planą įmonės vardu pasirenka vadovas. Kaina, darbuotojų riba, įtrauktos funkcijos, laikotarpis ir užsakymo sąlygos pateikiami Paslaugoje užsakymo metu. Jei taikomas mokėjimas pagal sąskaitą, užsakymo apmokėjimas ir aktyvavimas vyksta Paslaugoje tuo metu nurodyta tvarka. Šiuo metu mokėjimo patvirtinimą gali atlikti Paslaugos teikėjas rankiniu būdu.</p>
          <p className="mt-2">Jei konkrečiam naujam užsakymui suteikiama laikina prieiga, jos trukmė ir sąlygos nurodomos užsakymo lange. Šiuo metu tam tikriems pirmiesiems užsakymams gali būti suteikiama iki 5 dienų prieiga sąskaitai apmokėti. Prenumeratai pasibaigus, pagal sistemos veikimą gali būti suteikta iki 2 mėnesių tik skaitymo prieiga; po šio laikotarpio prieiga gali būti apribota. Šios funkcijos nepakeičia įmonės pareigos laiku atsisiųsti reikalingus dokumentus.</p>
          <p className="mt-2"><strong>Paslaugos kainos, planų sudėtis ir darbuotojų ribos gali keistis.</strong> Naujos kainos skelbiamos Paslaugoje ir taikomos tik po pakeitimo pateiktiems naujiems užsakymams arba vėlesniam prenumeratos laikotarpiui, apie kurį įmonė informuojama iš anksto jos paskyroje ar registruotu kontaktiniu el. paštu. Kaina už jau apmokėtą laikotarpį nedidinama atgaline data. Jei įmonė nesutinka su nauja kaina, ji gali iki naujo laikotarpio pradžios atsisakyti pratęsimo ar nutraukti Paslaugos naudojimą pagal taikomas užsakymo sąlygas; tokiu atveju prieiga baigiasi už jau apmokėtą laikotarpį, nebent privalomi teisės aktai numato kitaip. Mokesčių ar privalomų rinkliavų pakeitimai taikomi pagal teisės aktus ir nurodomi užsakymo metu.</p>
          <p className="mt-2">Automatinis periodinis nuskaitymas šiose Sąlygose nežadamas. Užsakymo pratęsimo, plano pakeitimo, atšaukimo, sąskaitų, mokesčių ir teisės atsisakyti konkretaus užsakymo sąlygos pateikiamos atitinkamame užsakymo procese ir taikomos pagal privalomus teisės aktus. Jei užsakymo informacija ir šios Sąlygos skirtųsi, konkrečiam užsakymui aiškiai pateikta informacija taikoma tik tiek, kiek neprieštarauja privalomiems teisės aktams.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">6. Paslaugos teikėjo įsipareigojimai ir prieinamumas</h2>
          <p className="mt-2">Paslaugos teikėjas siekia palaikyti Paslaugos veikimą, įgyvendinti pagrįstas technines ir organizacines apsaugos priemones, šalinti žinomus trūkumus ir atlikti priežiūros darbus. Iš anksto suplanuota priežiūra, saugumo incidentai, ryšio ar infrastruktūros sutrikimai ir nuo Paslaugos teikėjo nepriklausančios aplinkybės gali laikinai paveikti Paslaugos prieinamumą.</p>
          <p className="mt-2">Konkretaus nepertraukiamo veikimo lygio, konkretaus atsakymo laiko ar atkūrimo termino nežadama, nebent šalys tai atskirai susitarė raštu. Paslaugos teikėjas neprisiima pareigos patikrinti, ar kiekvienas įmonės įrašas, pasirinktas šablonas ar atliktas mokymas atitinka tos įmonės teisines pareigas. Ši nuostata neriboja Paslaugos teikėjo pareigų, kurių pagal taikomus teisės aktus negalima apriboti.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">7. Intelektinė nuosavybė</h2>
          <p className="mt-2">Paslaugos programinė įranga, dizainas, prekės ženklai ir Paslaugos teikėjo parengtas turinys saugomi pagal taikomus intelektinės nuosavybės teisės aktus. Kol laikomasi Sąlygų ir galioja suteikta prieiga, įmonei suteikiama ribota, neišimtinė ir neperleidžiama teisė naudotis Paslauga savo vidinei profesinei veiklai. Negalima kopijuoti ar platinti pačios Paslaugos, apeiti prieigos apribojimų ar naudoti jos neteisėtai.</p>
          <p className="mt-2">Įmonei suteikiamos teisės į jos duomenis ir įkeltą turinį lieka nepakeistos. Įmonė suteikia Paslaugos teikėjui tik tiek teisių į tokį turinį, kiek objektyviai reikia Paslaugai teikti, saugoti ir palaikyti pagal šalių susitarimą bei taikomą teisę.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">8. Prieigos ribojimas ir sutarties pabaiga</h2>
          <p className="mt-2">Paslaugos teikėjas gali laikinai apriboti paskyrą ar konkrečią funkciją, kai to reikia saugumui, teisės aktų vykdymui, kito asmens teisių apsaugai, esminio Sąlygų pažeidimo sustabdymui ar neapmokėtam užsakymui administruoti. Kai tai pagrįstai įmanoma, įmonė informuojama apie ribojimo priežastį ir veiksmus, reikalingus prieigai atkurti. Neatidėliotino saugumo ar teisės akto reikalavimo atveju ribojimas gali būti taikomas iš anksto neįspėjus.</p>
          <p className="mt-2">Įmonė gali nustoti naudotis Paslauga ir, jei įmanoma, uždaryti paskyrą nustatyta tvarka. Prenumeratos nutraukimas, duomenų eksportas ir saugojimas vykdomi pagal konkretaus plano sąlygas, privatumo pranešimą, duomenų tvarkymo susitarimą ir privalomus teisės aktus. Prieš uždarydama prieigą įmonė turėtų eksportuoti jai reikalingus duomenis.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">9. Atsakomybės ribos</h2>
          <p className="mt-2">Kiek leidžia taikomi teisės aktai, įmonė atsako už savo veiklos organizavimą, teisinių pareigų nustatymą, pateikiamų duomenų tikslumą ir sprendimus, priimamus remiantis Paslaugos informacija. Paslaugos naudojimas savaime nepatvirtina, kad įmonė įvykdė darbuotojų saugos, darbo teisės, dokumentų saugojimo ar duomenų apsaugos reikalavimus.</p>
          <p className="mt-2">Paslaugos teikėjas neatsako už pasekmes, kilusias vien dėl to, kad įmonė nepatikrino šablono, ignoravo aktualius teisės aktus, pateikė netikslius duomenis, netinkamai sukonfigūravo prieigas arba laikė Paslaugą vienintele savo dokumentų ar veiklos tęstinumo kopija. Tačiau Sąlygos <strong>nepanaikina ir neriboja Paslaugos teikėjo atsakomybės ar pareigų tiek, kiek jų negalima panaikinti ar apriboti pagal taikomus teisės aktus</strong>, įskaitant atsakomybę už tyčinius veiksmus, didelį neatsargumą ar kitus įstatyme nurodytus atvejus. Kiekvienu atveju atsakomybė vertinama pagal konkrečias aplinkybes ir privalomą teisę.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">10. Sąlygų keitimas ir taikytina teisė</h2>
          <p className="mt-2">Sąlygos gali būti keičiamos atnaujinant šį puslapį. Esminius pakeitimus Paslaugos teikėjas paskelbia Paslaugoje arba praneša įmonės paskyros kontaktiniu adresu. Nauja redakcija taikoma nuo joje nurodytos įsigaliojimo datos; ji atgaline data nekeičia jau įvykusių santykių. Jei įmonė nesutinka su esminiu pakeitimu, ji gali nustoti naudotis Paslauga ir spręsti prenumeratos klausimus pagal užsakymo bei privalomų teisės aktų sąlygas.</p>
          <p className="mt-2">Sąlygoms taikoma Lietuvos Respublikos teisė. Ginčai pirmiausia sprendžiami derybomis; nepavykus susitarti, jie nagrinėjami kompetentingame teisme pagal taikytinas jurisdikcijos taisykles. Privalomos teisės normos turi viršenybę prieš Sąlygas.</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-xl font-bold text-slate-950">11. Kontaktai</h2>
          <p className="mt-2">Dėl Paslaugos ar šių Sąlygų kreipkitės į <a className="font-semibold text-emerald-800 underline" href={`mailto:${settings.contact_email || 'dsspro@inbox.lt'}`}>{settings.contact_email || 'dsspro@inbox.lt'}</a>. Paslaugos teikėjo pavadinimas, veiklos / įmonės numeris ir adresas turi būti nurodyti bei patikrinti prieš paskelbiant šias Sąlygas kaip galiojančias.</p>
        </section>
      </article>
    </main>
    <footer className="border-t border-slate-200 bg-slate-50 px-5 py-6 text-center text-xs text-slate-500"><nav className="flex justify-center gap-5"><a href={TERMS_PATH} className="font-semibold text-emerald-800 hover:text-emerald-950">Naudojimo sąlygos</a><a href="/privatumo-politika" className="font-semibold text-emerald-800 hover:text-emerald-950">Privatumo politika</a></nav><p className="mt-2">© 2026 DSS Pro</p></footer>
  </div>;
}

export function TermsSettings() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(supabase ? '' : 'Supabase ryšys nesukonfigūruotas.');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    if (!supabase) return () => { active = false; };
    supabase.from('site_legal_settings').select(SETTINGS_FIELDS).eq('id', true).maybeSingle()
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) setError(`Teisinės informacijos įkelti nepavyko: ${requestError.message}`);
        else if (data) setSettings({ ...defaultSettings, ...data });
        else setError('Teisinės informacijos įrašo nėra. Pritaikykite naujausią Supabase migraciją.');
        setLoading(false);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(`Teisinės informacijos įkelti nepavyko: ${requestError instanceof Error ? requestError.message : String(requestError)}`);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const updateField = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }));
    setError('');
    setNotice('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!supabase) {
      setError('Supabase ryšys nesukonfigūruotas.');
      return;
    }
    const nextStatus = event.nativeEvent.submitter?.value ?? 'draft';
    const normalized = {
      provider_name: settings.provider_name.trim(),
      registration_number: settings.registration_number.trim(),
      address: settings.address.trim(),
      contact_email: settings.contact_email.trim(),
    };
    if (nextStatus === 'published' && Object.values(normalized).some((value) => !value)) {
      setError('Prieš skelbiant užpildykite paslaugos teikėjo pavadinimą, įmonės / veiklos numerį, adresą ir kontaktinį el. paštą.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setSaving(false);
      setError(`Administratoriaus paskyros nustatyti nepavyko: ${userError?.message ?? 'prisijungimo sesija nerasta.'}`);
      return;
    }
    const { data, error: saveError } = await supabase.from('site_legal_settings')
      .update({ ...normalized, terms_status: nextStatus, updated_by: userData.user.id })
      .eq('id', true)
      .select(SETTINGS_FIELDS)
      .maybeSingle();
    setSaving(false);
    if (saveError) {
      setError(`Teisinės informacijos išsaugoti nepavyko: ${saveError.message}`);
      return;
    }
    if (!data) {
      setError('Teisinės informacijos išsaugoti nepavyko: įrašas nerastas arba neturite administratoriaus teisių.');
      return;
    }
    setSettings({ ...defaultSettings, ...data });
    setNotice(nextStatus === 'published'
      ? 'Rekvizitai išsaugoti ir sąlygos paskelbtos. Prieš taikydami jas klientams, įsitikinkite, kad tekstą peržiūrėjo Lietuvos teisės specialistas.'
      : 'Rekvizitai išsaugoti. Sąlygos lieka juodraščiu ir dar negalioja.');
  };

  const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100';

  return <section className="max-w-3xl space-y-5">
    <div>
      <h2 className="text-2xl font-bold">Teisinė informacija</h2>
      <p className="mt-1 text-sm text-slate-600">Paslaugos teikėjo rekvizitai, rodomi viešose DSS Pro naudojimo sąlygose.</p>
    </div>
    {settings.terms_status === 'draft' && <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Sąlygos yra juodraštis ir dar negalioja.</strong> Įrašykite veiklos rekvizitus, patikrinkite visą sąlygų tekstą ir tik tada skelbkite. Rekomenduojama prieš paskelbimą gauti Lietuvos teisės specialisto peržiūrą.</p>}
    {settings.terms_status === 'published' && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Sąlygos paskelbtos nuo {formatDate(settings.published_at)}. Pakeitimus paskelbkite tik įvertinę jų taikymo datą klientams.</p>}
    {loading && <p role="status" className="rounded-lg bg-white p-4 text-sm text-slate-600">Įkeliami nustatymai…</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <form onSubmit={save} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <label className="block text-sm font-semibold">Paslaugos teikėjo juridinis pavadinimas / vardas, pavardė
        <input className={inputClass} value={settings.provider_name} onChange={(event) => updateField('provider_name', event.target.value)} maxLength={180} />
      </label>
      <label className="block text-sm font-semibold">Įmonės kodas arba individualios veiklos pažymos numeris
        <input className={inputClass} value={settings.registration_number} onChange={(event) => updateField('registration_number', event.target.value)} maxLength={100} />
      </label>
      <label className="block text-sm font-semibold">Registracijos / korespondencijos adresas
        <input className={inputClass} value={settings.address} onChange={(event) => updateField('address', event.target.value)} maxLength={300} />
      </label>
      <label className="block text-sm font-semibold">Kontaktinis el. paštas
        <input className={inputClass} type="email" value={settings.contact_email} onChange={(event) => updateField('contact_email', event.target.value)} maxLength={254} />
      </label>
      <p className="text-xs leading-5 text-slate-500">PVM mokėtojo kodą galima papildomai įtraukti į viešų sąlygų tekstą, jei jis bus suteiktas. Šiame puslapyje nurodyti rekvizitai nepakeičia sąskaitų nustatymuose esančių pardavėjo duomenų.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" value="draft" disabled={saving || loading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save size={16} />{saving ? 'Saugoma…' : 'Išsaugoti kaip juodraštį'}</button>
        <button type="submit" value="published" disabled={saving || loading} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{saving ? 'Saugoma…' : 'Išsaugoti ir paskelbti sąlygas'}</button>
        <a href={TERMS_PATH} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Peržiūrėti viešą puslapį</a>
      </div>
    </form>
  </section>;
}
