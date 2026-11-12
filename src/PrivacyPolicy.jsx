import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { supabase } from './lib/supabase.js';
import { PRIVACY_POLICY_VERSION } from './lib/legalVersions.js';

const defaultProvider = { provider_name: '', registration_number: '', address: '', contact_email: 'dsspro@inbox.lt', terms_status: 'draft' };

export default function PrivacyPolicy() {
  const [provider, setProvider] = useState(defaultProvider);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.from('site_legal_settings')
      .select('provider_name, registration_number, address, contact_email, terms_status')
      .eq('id', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError(`Paslaugos teikėjo duomenų įkelti nepavyko: ${error.message}`);
        else if (data) setProvider({ ...defaultProvider, ...data });
      })
      .catch((error) => {
        if (active) setLoadError(`Paslaugos teikėjo duomenų įkelti nepavyko: ${error.message || String(error)}`);
      });
    return () => { active = false; };
  }, []);

  return <div className="min-h-screen bg-white text-slate-900">
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" className="text-xl font-black text-[#0c4a3b]">DSS Pro</a>
        <a href="/" className="text-sm font-semibold text-slate-600 hover:text-emerald-800">Į DSS Pro svetainę</a>
      </div>
    </header>
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <a href="/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ArrowLeft size={16} />Į pradžią</a>
      <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Prieš naudojant šią politiką kaip galutinę, ją būtina patikrinti.</strong> Patvirtinkite paslaugos teikėjo rekvizitus, konkrečius duomenų saugojimo terminus ir realius „Google Tag Manager“ nustatymus. Teisinį tekstą turėtų peržiūrėti Lietuvos duomenų apsaugos specialistas.</p>
      {loadError && <p role="alert" className="mb-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{loadError}</p>}
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><ShieldCheck size={23} /></span>
        <div><p className="text-sm font-bold uppercase tracking-wide text-emerald-800">DSS Pro</p><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Privatumo politika</h1></div>
      </div>
      <p className="mt-4 text-sm text-slate-500">Versija {PRIVACY_POLICY_VERSION} · atnaujinta 2026 m. lapkričio 12 d.</p>

      <article className="mt-8 max-w-none space-y-8 text-base leading-7 text-slate-700">
        <section>
          <h2 className="text-xl font-bold text-slate-950">1. Kas atsako už duomenis</h2>
          <p className="mt-2">DSS Pro paslaugos teikėjas ir duomenų valdytojas yra {provider.provider_name || 'šiame puslapyje nurodytinas paslaugos teikėjas'}{provider.registration_number ? ` (įm. / veiklos Nr. ${provider.registration_number})` : ''}{provider.address ? `, adresas ${provider.address}` : ''}. Kontaktai dėl privatumo: <a className="font-semibold text-emerald-800 underline" href={`mailto:${provider.contact_email || 'dsspro@inbox.lt'}`}>{provider.contact_email || 'dsspro@inbox.lt'}</a>. Įmonės darbuotojų duomenų atžvilgiu įmonė paprastai nustato tvarkymo tikslus ir veikia kaip duomenų valdytoja, o DSS Pro tvarko tuos duomenis įmonės nurodymu kaip duomenų tvarkytojas. Konkretūs vaidmenys priklauso nuo duomenų tvarkymo tikslo ir turi būti nustatyti sutartyse.</p>
          {provider.address && <p className="mt-2">Paslaugos teikėjo adresas: {provider.address}.</p>}
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">2. Kokius duomenis tvarkome</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li><strong>Paskyros ir prisijungimo duomenys:</strong> vardas ir pavardė, el. pašto adresas, paskyros tipas ir būsenos, paskyros identifikatorius, autentifikavimo bei el. pašto patvirtinimo įrašai. Slaptažodį valdo „Supabase Auth“; DSS Pro negali jo matyti įskaitomo teksto forma.</li>
            <li><strong>Pasirašymo patvirtinimai:</strong> keturių skaitmenų PIN kodas priimamas paskyros sukūrimo ar keitimo metu ir saugomas kaip kriptografinė maiša, o ne įskaitomas kodas. PIN nėra slaptažodžio pakaitalas.</li>
            <li><strong>Įmonės ir atsiskaitymo duomenys:</strong> įmonės pavadinimas, įmonės kodas, PVM kodas, atsiskaitymo adresas, vadovo kontaktai, prenumeratos planas, kaina, užsakymo kodas, laikotarpiai, mokėjimo būsena, sąskaitų rekvizitai ir jų momentinės kopijos. Šiuo metu kortelės duomenų DSS Pro nerenka ir kortelių mokėjimų neapdoroja.</li>
            <li><strong>Darbuotojų ir DSS specialistų duomenys, kuriuos pateikia įmonė:</strong> vardas, pavardė, el. paštas, pareigos, darbo sutarties numeris, pakvietimo ir paskyros susiejimo būsena, priskirti dokumentai, užduočių atlikimo būsena, testų atsakymai bei rezultatai, darbuotojo įvesti AAP dydžiai, medicininės pažymos galiojimo pabaigos data ir archyvo įrašai. Sistema neskirta diagnozėms ar išsamiems medicininiams dokumentams įkelti; neįveskite jų, jei tai nėra būtina ir teisėta.</li>
            <li><strong>Dokumentai ir parašų įrašai:</strong> instruktavimų, testų, žurnalų, AAP išdavimo ir kitų įmonės pasirinktų dokumentų duomenys; pasirašiusio asmens vardas ar rolė, parašo vaizdas, parašo laikas, dokumento identifikatoriai ir versija. Kai tai numato konkreti funkcija, parašo įraše gali būti saugomas IP adresas.</li>
            <li><strong>Pakvietimai ir pranešimai:</strong> gavėjo vardas, el. paštas, įmonė, kvietimo būsena bei datos; taip pat sistemos laiškų, pvz., paskyros patvirtinimo ir prenumeratos priminimų, siuntimo duomenys.</li>
            <li><strong>Techniniai ir saugumo duomenys:</strong> IP adresas, užklausų laikas, sesijos ir paskyros identifikatoriai, įrenginio bei naršyklės techninė informacija, klaidų ir saugumo įvykių įrašai. Dalis jų gali būti registruojama infrastruktūros paslaugų teikėjų žurnaluose.</li>
            <li><strong>Demonstraciniai duomenys:</strong> be registracijos naudojama demo aplinka gali saugoti fiktyvius arba naudotojo įvestus duomenis šios naršyklės saugykloje. Demo aplinka nėra skirta tikriems darbuotojų ar sveikatos duomenims.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">3. Tikslai ir teisiniai pagrindai</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Paskyrai sukurti, prisijungimui ir paslaugai teikti – sutarties vykdymas arba veiksmai prieš sudarant sutartį.</li>
            <li>Darbuotojų ir įmonės darbo eigos dokumentams tvarkyti – įmonės, kaip valdytojos, nurodymai; DSS Pro tvarkytojo vaidmenyje duomenų nenaudoja nepriklausomiems tikslams.</li>
            <li>Sąskaitoms, prenumeratoms ir apskaitos įrašams tvarkyti – sutartis ir teisės aktuose nustatytos pareigos.</li>
            <li>Sistemai apsaugoti, sukčiavimui tirti ir paslaugos veikimui palaikyti – teisėtas interesas ir, kai taikoma, teisinė pareiga.</li>
            <li>Privalomų Naudojimo sąlygų sutikimo versijai ir laikui įrodyti – sutarties sudarymo bei teisinių reikalavimų administravimas.</li>
            <li>Pasirenkamai svetainės analitikai – jūsų atskiras sutikimas. Jo atsisakymas neturi riboti pagrindinių paslaugos funkcijų.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">4. „Google Tag Manager“ ir analitika</h2>
          <p className="mt-2">Svetainėje naudojamas „Google Tag Manager“ konteineris <strong>GTM-NHTMXQTT</strong>. Jis gali įkelti „Google Analytics“ žymas pagal konteineryje nustatytą konfigūraciją. Šiame programos kode vardai, pavardės, el. pašto adresai, slaptažodžiai, PIN kodai, darbuotojų dokumentai ir testų duomenys nėra sąmoningai siunčiami į „Google Analytics“. Analitika įjungiama tik pasirinkus analitinius slapukus; atsisakius pasirinkimo, konteineris neįkeliamas.</p>
          <p className="mt-2">Jei sutinkate, „Google“ žymos gali tvarkyti puslapio adresą ir nukreipimo šaltinį, apsilankymo laiką, puslapio peržiūros ar kitus konteineryje įjungtus įvykius, apytikslę vietą, naršyklės, operacinės sistemos ir įrenginio charakteristikas bei pseudoniminius slapukų identifikatorius. „Google“ IP adresą gali naudoti ryšiui ir apytikslei vietai nustatyti; tikslus saugojimas priklauso nuo „Google“ produkto ir paskyros nustatymų. Faktinės žymos ir jų saugojimo terminai priklauso nuo GTM/Analytics administratoriaus konfigūracijos, kurią prieš paskelbiant šią politiką būtina patikrinti.</p>
          <p className="mt-2">Analitikos sutikimą galite bet kada atšaukti pasirinkę „Slapukų nustatymai“ ir išvalydami naršyklės slapukus. Atšaukimas nekeičia ankstesnio tvarkymo teisėtumo ir nedaro įtakos būtinam prisijungimui.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">5. Slapukai ir naršyklės saugykla</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-slate-50"><tr><th className="p-3">Kategorija</th><th className="p-3">Paskirtis</th><th className="p-3">Pasirinkimas</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                <tr><td className="p-3 font-semibold">Būtini</td><td className="p-3">Prisijungimo sesija, saugumas, paslaugos ir jūsų sutikimo pasirinkimo išsaugojimas. Dalį būsenos programėlė saugo naršyklės vietinėje saugykloje.</td><td className="p-3">Visada aktyvūs</td></tr>
                <tr><td className="p-3 font-semibold">Analitiniai</td><td className="p-3">Gali būti naudojami „Google Tag Manager“ ir jo įkeliamos žymos, įskaitant „Google Analytics“ slapukus, pvz., `_ga` ir `_ga_*`, jei jie įjungti GTM.</td><td className="p-3">Tik pasirinkus</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">Pasirinkimai saugomi naršyklės `localStorage` rakte `dsspro-cookie-preferences-v1`; tai nėra prisijungimo slapukas. Prisijungusio paskyros naudotojo pasirinkimo įrašas taip pat saugomas DSS Pro sutikimų žurnale. Anoniminio lankytojo pasirinkimas iki prisijungimo lieka tik jo naršyklėje.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">6. Kam duomenis perduodame</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>„Supabase“ – autentifikavimui, duomenų bazei, failų saugyklai ir serverinėms funkcijoms.</li>
            <li>„Vercel“ – svetainės talpinimui ir techninei infrastruktūrai.</li>
            <li>„Google“ – tik pasirinkus analitiką ir tik per aukščiau nurodytą GTM/Analytics konfigūraciją.</li>
            <li>„Resend“ – kai siunčiami sistemos el. laiškai, pvz., prenumeratos priminimai.</li>
          </ul>
          <p className="mt-2">Paslaugų teikėjai tvarko duomenis pagal savo sąlygas ir mūsų nurodymus, kai jie veikia kaip tvarkytojai. Jų infrastruktūra ar pagalba gali būti už Europos ekonominės erdvės ribų; tokiu atveju perdavimas turi būti grindžiamas taikytinais teisės aktais ir tinkamomis apsaugos priemonėmis. Konkrečias regionų ir perdavimo sąlygas reikia tikrinti paslaugų paskyrose bei sutartyse.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">7. Saugojimo trukmė</h2>
          <p className="mt-2">Paskyros duomenys saugomi paskyros ir paslaugos naudojimo laikotarpiu. Įmonės pateiktų darbuotojų ir dokumentų duomenų saugojimo terminą nustato įmonė, kaip valdytoja; pasibaigus paslaugai jie gali likti pagal sutartį, įmonės nurodymus, archyvo funkciją ir teisės aktuose nustatytus terminus. Sąskaitų dokumentai saugomi teisės aktų reikalaujamą laiką. Saugumo žurnalai, atsarginės kopijos ir „Google“ analitikos duomenys saugomi atitinkamo infrastruktūros ar analitikos paslaugų teikėjo ir paskyros nustatytą laiką.</p>
          <p className="mt-2">Sutikimų įrašai saugomi tiek, kiek reikia sutikimo faktui, versijai ir atšaukimui įrodyti bei teisiniams reikalavimams apginti. Šiuo metu konkrečių automatinių ištrynimo terminų visoms kategorijoms sistema nenustato; prieš paskelbiant politiką teikėjas turi nustatyti ir patvirtinti taikomą saugojimo grafiką.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">8. Jūsų teisės</h2>
          <p className="mt-2">Priklausomai nuo tvarkymo vaidmens ir taikytinų teisės aktų, galite prašyti susipažinti su savo duomenimis, juos ištaisyti, ištrinti, apriboti jų tvarkymą, nesutikti su tvarkymu, gauti perkeliamus duomenis ar atšaukti sutikimą. Dėl įmonės valdomų darbuotojų duomenų pirmiausia kreipkitės į savo darbdavį. Dėl DSS Pro valdomų paskyros ar analitikos duomenų kreipkitės į aukščiau nurodytą paslaugos teikėją. Taip pat galite pateikti skundą Valstybinei duomenų apsaugos inspekcijai.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">9. Saugumas ir nepilnamečiai</h2>
          <p className="mt-2">Taikomos prieigos kontrolės, autentifikavimo, duomenų bazių RLS ir kitos techninės priemonės, tačiau jokia sistema negali garantuoti absoliutaus saugumo. Įmonė turi suteikti prieigą tik įgaliotiems asmenims ir neįvesti perteklinių duomenų. Paslauga skirta profesiniam naudojimui, o ne vaikų paskyroms ar vaikų duomenims tvarkyti.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">10. Politikos pakeitimai ir kontaktai</h2>
          <p className="mt-2">Atnaujinę šią politiką pakeisime versijos datą ir prireikus paprašysime iš naujo pasirinkti analitinius slapukus arba patvirtinti atnaujintas Naudojimo sąlygas. Dėl privatumo klausimų rašykite <a className="font-semibold text-emerald-800 underline" href={`mailto:${provider.contact_email || 'dsspro@inbox.lt'}`}>{provider.contact_email || 'dsspro@inbox.lt'}</a>.</p>
          <p className="mt-2">Prieš skelbiant šią redakciją būtina užpildyti paslaugos teikėjo rekvizitus, GTM/GA4 naudojamų žymų sąrašą ir konkrečius duomenų saugojimo terminus bei gauti teisinę peržiūrą. Šis tekstas aprašo šiame kode nustatytą duomenų tvarkymą, bet savaime nėra teisinė konsultacija.</p>
        </section>
      </article>
    </main>
    <footer className="border-t border-slate-200 bg-slate-50 px-5 py-6 text-center text-xs text-slate-500">
      <nav className="flex justify-center gap-5"><a href="/naudojimo-salygos" className="font-semibold text-emerald-800">Naudojimo sąlygos</a><a href="/privatumo-politika" className="font-semibold text-emerald-800">Privatumo politika</a></nav>
      <p className="mt-2">© 2026 DSS Pro</p>
    </footer>
  </div>;
}
