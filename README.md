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
```

Vercel projekte Supabase URL ir anon raktas nustatyti `production`, `preview` ir `development` aplinkoms. GitHub `main` pushai automatiškai paleidžia Vercel deploy.

Cloud režime šiuo metu veikia vadovo autentifikacija, įmonės sukūrimas ir vadovo įmonės darbo būsenos saugojimas. Darbuotojų ir DSS specialistų atskiros paskyros, kvietimų siuntimas el. paštu, jų prieigos taisyklės bei realaus parašo patvirtinimas dar nėra prijungti; šių vaidmenų darbas ir PIN parašai lieka demo režimo funkcijos.

## Vietiniai duomenys

Naršyklės raktas: `dsspro-local-demo-v1`. Norėdami pradėti nuo pradinių duomenų, pašalinkite šį raktą iš vietinės svetainės saugyklos ir atnaujinkite puslapį.