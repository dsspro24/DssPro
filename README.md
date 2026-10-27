# DSS Pro vietinis demo

DSS Pro yra darbuotojų saugos ir sveikatos procesų demonstracinė sistema. Duomenys laikomi naršyklės `localStorage`; prisijungimo, laiškų siuntimo, mokėjimų ar serverio nėra.

## Paleidimas

```bash
npm install
npm run dev
```

Atidarykite Vite parodytą vietinį adresą. Tailwind CSS įkompiliuojamas kartu su aplikacija, išorinis Tailwind CDN nenaudojamas.

## Demo rolės

- **Darbuotojas:** pasirinkite demo darbuotoją, suveskite AAP dydžius, nustatykite PIN, atlikite priskirtus testus ir pasirašykite dokumentus.
- **AAP šablonas:** kūrėjo bibliotekoje jau paruošta dviejų dalių AAP apskaitos kortelė ir išdavimo žiniaraštis. Vadovas prieš kvietimą įveda darbo sutarties Nr.; jis rodomas prie darbuotojo ir dokumente. Įmonės bibliotekoje vadovas gali pakeisti AAP priemones, išdavimo pagrindus, kiekius, terminus ir kainas. Darbuotojas pasirašo PIN, tada vadovas patvirtina įmonės PIN. Parašo įraše fiksuojamas pasirašymo būdas, vietinis laikas iki sekundės ir demo IP. Po darbuotojo parašo visas dokumentas ir AAP pozicijų versija užrakinami; vėlesni pakeitimai galioja tik naujiems dokumentams. Viršelio nuotrauka yra vietinė: `public/courses/aap-equipment.jpg`.
- **DSS specialistas:** pasirinkite demo specialisto paskyrą, priimkite įmonės kvietimą, peržiūrėkite žurnalus ir pasirašykite po darbuotojo PIN patvirtinimo.
- **Įmonės vadovas:** tvarkykite įmonės DSS specialistus ir komisiją, darbuotojus, biblioteką, priskyrimus, ataskaitas ir prenumeratą.
- **Turinio kūrėjas:** įkelkite HTML ir nuotrauką, kurkite testų klausimus, nustatykite galiojimą, tvarkykite biblioteką bei demo prenumeratas.

Rolių ir demo naudotojų pasirinkikliai palikti testavimui. Darbuotojo ir DSS PIN, parašai bei rodomas IP yra tik vietinio demo įrašai, ne teisiškai patvirtinti elektroniniai parašai. Prenumeratos veiksmai nekeičia realių mokėjimų, o kvietimai neišsiunčia el. laiškų.

## Supabase cloud režimas

Kai nustatyti `VITE_SUPABASE_URL` ir `VITE_SUPABASE_ANON_KEY`, aplikacija vietoje demo įjungia vadovo registraciją ir prisijungimą. Vadovas gali sukurti įmonę; įmonės darbo būsena saugoma Supabase ir apsaugota RLS taisyklėmis. Vieša (anon) užklausa įmonių įrašų nemato.

Lokaliam cloud bandymui nukopijuokite `.env.example` į `.env.development.local` ir įrašykite Supabase URL bei anon raktą. `service_role` rakto į `VITE_` kintamuosius ar naršyklę dėti negalima.

Supabase migracijoms:

```bash
npx supabase login
npx supabase link --project-ref wickbchyltkpmudopnwc
npx supabase db push --linked
npx supabase functions deploy invite-employee --project-ref wickbchyltkpmudopnwc
npx supabase functions deploy invite-dss-specialist --project-ref wickbchyltkpmudopnwc
```

Vercel projekte Supabase URL ir anon raktas nustatyti `production`, `preview` ir `development` aplinkoms. GitHub `main` pushai automatiškai paleidžia Vercel deploy.

Cloud režime veikia vadovo ir DSS specialisto registracija bei bendras prisijungimas. Registruojantis DSS specialistui įmonės duomenų nereikia: patvirtinęs el. paštą jis patenka į savo darbo sritį, kur gali naudotis paskyros ir bendromis sistemos funkcijomis, kol neturi prižiūrimų įmonių. Vadovas gali pakviesti DSS specialistą el. paštu; kvietimas nesuteikia prieigos, kol specialistas neprisijungęs jo nepriima. Specialistas gali kvietimo atsisakyti. Vadovas gali patvirtinęs pašalinti specialistą iš įmonės; panaikinama tik jo prieiga prie tos įmonės, o jo paskyra ir ankstesni parašai išsaugomi.

Vadovas įmonės nustatymuose gali atskirai suteikti DSS specialistui teisę tvarkyti įmonės darbo sritį arba bet kada ją atšaukti. Gavęs teisę specialistas gali tvarkyti darbuotojus, dokumentus, priskyrimus ir DSS komisiją; jis išlieka DSS specialistu ir gali pasirašyti tik kaip DSS specialistas. Vadovo parašo PIN keitimas ir vadovo vardu pasirašymas lieka tik vadovui.

Turinio kūrėjas bibliotekos šablonus gali pažymėti kaip numatytuosius įmonėms: jie priskiriami esamoms įmonėms ir automatiškai priskiriami kuriant naują įmonę. Vadovas gali pakeisti savo įmonės pasirinkimus. Įvadinio ir darbo vietos instruktavimo žurnaluose galima nustatyti, ar instruktavo vadovas, ar DSS specialistas; protokolo komisijos narių parašai nustatomi atskirai.

Cloud parašų istorija kraunama iš normalizuotos `document_signatures` lentelės puslapiais po 25 įrašus. Ekrane pirmiausia rodomi parašo metaduomenys, o saugyklos URL ir vaizdas įkeliami tik paspaudus „Peržiūrėti parašą“. Darbo eigos būsenos ir kitos funkcijos kol kas tebenaudoja darbo srities `signatures` metaduomenis.

`organization_data` JSON darbo sritis paliekama dabartiniams nustatymams ir suderinamumui su dar neperkeltomis funkcijomis. Didesnės istorijos ir sąrašai gali būti palaipsniui perkeliami į normalizuotas lenteles atskirais, suderinamais žingsniais; vienu pakeitimu visos darbo srities schema nekeičiama. Šiuo metu parašų istorijos skaitymas jau naudoja normalizuotą lentelę, tačiau kitos parašų darbo eigos dalys dar remiasi JSON metaduomenimis.

Vadovo ir DSS specialisto darbo sričių įkėlimas bendrų šablonų nebeskaito iš kiekvienos įmonės `organization_data.resources` JSON kopijos: bendri šablonai imami iš katalogo, o įmonės dokumentai iš `organization_documents`. Likę darbo srities duomenys ir jų autosave dar palaiko esamą JSON formatą; šis suderinamumo sluoksnis bus šalinamas atskirais etapais. Esamoje nuotolinėje DB `resources` laukas sudarė apie 38 KB vienai darbo sričiai, todėl pirmas etapas pašalina šį dubliuotą lauką iš vadovo ir DSS darbo sričių įkėlimo atsako.

Parašų istorijos puslapiavimą palaiko indeksai pagal įmonę ir datą, įmonę bei darbuotoją ir įmonę bei pasirašiusį naudotoją. Protokolo dalyvių paieškai pagal įmonę ir darbuotoją taip pat yra atskiras indeksas. Šios lentelės turi įjungtą tenant-scoped RLS; narių tikrinimą aptarnauja `organization_memberships` pirminis raktas ir darbuotojo dalinis unikalus indeksas. Dabartinė duomenų bazė maža, todėl `EXPLAIN` gali pagrįstai rinktis nuoseklų lentelės skenavimą; tai nėra apkrovos bandymas ar įrodymas, kaip veiks planas prie SaaS masto.

Darbuotojo profilio tipas atpažįstamas prisijungus. Darbuotojų paskyrų kūrimas, kvietimai, jų dokumentų cloud prieiga ir realaus elektroninio parašo patvirtinimas taip pat dar nėra prijungti.

## Vietiniai duomenys

Naršyklės raktas: `dsspro-local-demo-v1`. Norėdami pradėti nuo pradinių duomenų, pašalinkite šį raktą iš vietinės svetainės saugyklos ir atnaujinkite puslapį.