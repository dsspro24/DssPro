# DSS Pro vietinis demo

DSS Pro yra darbuotojų saugos ir sveikatos procesų sistema. Įprasta vietinė demonstracinė darbo sritis naudoja naršyklės `localStorage`, o landing puslapio „Išbandyti be registracijos“ sandbox pakeitimus laiko tik React atmintyje ir išvalo atnaujinus puslapį.

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
- **Turinio kūrėjas:** įkelkite HTML ir nuotrauką, kurkite testų klausimus, nustatykite galiojimą, tvarkykite biblioteką, cloud prenumeratas ir jų kainas.

Izoliuotame sandbox galima persijungti tarp vienos fiktyvios įmonės vadovo, DSS specialisto ir aštuonių darbuotojų. Darbuotojo ir DSS PIN, parašai bei rodomas IP yra tik demo įrašai, ne teisiškai patvirtinti elektroniniai parašai. Prenumeratos veiksmai nekeičia realių mokėjimų, o kvietimai neišsiunčia el. laiškų.

Viešo demo vadovo bibliotekoje rodomi tik statiniame `public/demo-content.json` pakete esantys šablonai; bendrieji pradiniai demo šablonai į sandbox neįtraukiami. Sandbox pakeitimai lieka tik skirtuko React atmintyje ir pradingsta uždarius arba atnaujinus puslapį; demo nekeičia ir neskaito Supabase duomenų. Prisijungęs turinio kūrėjas gali bendroje bibliotekoje pažymėti šablonus „Įtraukti į izoliuotą demo“ ir pasirinkti „Eksportuoti demo paketą“. Eksportuotame faile HTML bei nuotraukos įterpiami tiesiogiai, o paskyrų, įmonių ir parašų duomenys neįtraukiami. Prieš publikuodami peržiūrėkite eksportą, tada pakeiskite `public/demo-content.json` jo turiniu ir iš naujo įdiekite svetainę.

## Supabase cloud režimas

Kai nustatyti `VITE_SUPABASE_URL` ir `VITE_SUPABASE_ANON_KEY`, aplikacija vietoje demo įjungia vadovo registraciją ir prisijungimą. Vadovas gali sukurti įmonę; įmonės darbo būsena saugoma Supabase ir apsaugota RLS taisyklėmis. Vieša (anon) užklausa įmonių įrašų nemato.

## Tinklaraštis

Viešas tinklaraštis pasiekiamas adresu `/tinklarastis`, o straipsniai – `/tinklarastis/<slug>`. Tinklaraščio puslapis ir jo administravimo skiltis įkeliami atskirai nuo įprastos darbo srities. Prisijungęs turinio kūrėjas gali kurti, redaguoti, skelbti, slėpti juodraščiuose ir ištrinti straipsnius. Viešai pasiekiami tik paskelbti įrašai; prieigą užtikrina `blog_posts` RLS taisyklės.

Pradinius straipsnius ir lentelę sukuria `supabase/migrations/20261109130000_blog_posts.sql`. Naudojimo sąlygų puslapis yra `/naudojimo-salygos`; jų juodraščio būseną ir viešai rodomus paslaugos teikėjo rekvizitus turinio kūrėjas tvarko skiltyje „Teisinė informacija“. Privatumo politika pateikiama adresu `/privatumo-politika`, o slapukų sutikimas registracijos metu ir analitikos pasirinkimas pateikiami atskirai. Kūrėjas toje pačioje skiltyje gali peržiūrėti registruotų paskyrų sąlygų bei prisijungusių naudotojų slapukų pasirinkimų žurnalą; žurnale rodoma po 20 įrašų viename puslapyje. Analitikos pasirinkimas galioja 180 dienų; sutikimų įrašai saugomi 2 metus ir po to automatiškai ištrinami. Sutikimų lentelę, RLS taisykles ir pradinį kūrėjo RPC sukuria `supabase/migrations/20261112125000_privacy_consent_records.sql`, serverinį puslapiavimą — `supabase/migrations/20261112130700_paginate_privacy_consent_records.sql`, o 2 metų saugojimo taisyklę — `supabase/migrations/20261112134700_privacy_consent_retention.sql`. Pritaikykite migracijas Supabase'e prieš įjungdami šias funkcijas. Anoniminio lankytojo slapukų pasirinkimas iki prisijungimo lieka jo naršyklėje, todėl kūrėjo žurnale nerodomas.

Prieš skelbiant privatumo politiką užpildykite paslaugos teikėjo rekvizitus, patikrinkite realias GTM/GA4 žymas bei jų sutikimo režimą ir nustatykite konkrečius duomenų saugojimo terminus. Politikos aprašas negali atspėti GTM konteinerio paskyros nustatymų; prieš viešinimą būtina juos patikrinti ir gauti teisinę peržiūrą.

Pritaikykite migracijas įprasta Supabase migracijų komanda, pateikta žemiau. Vercel perrašo tinklaraščio, sąlygų ir privatumo politikos URL į aplikaciją, kad tiesioginės nuorodos veiktų.

SEO techniniai failai: `/robots.txt` nurodo `/sitemap.xml`, o Vercel API funkcija `api/sitemap.js` sudaro sitemap iš pagrindinio puslapio, privatumo politikos, paskelbtų straipsnių ir tik paskelbtų naudojimo sąlygų. Kita Vercel funkcija `api/blog.js` pateikia tinklaraščio sąrašą ir paskelbtus straipsnius su turiniu, SEO metaduomenimis bei struktūriniais duomenimis jau pradiniame HTML atsakyme; po to React tęsia darbą su tuo pačiu serverio pateiktu turiniu. HTML apvalkalas skaitomas iš viešo kanoninio `https://www.dsspro.lt/` adreso, nes apsaugotas Vercel deployment adresas gali grąžinti autentifikavimo puslapį, o ne programos failus. Funkcijoms Vercel aplinkoje reikia `VITE_SUPABASE_URL` ir `VITE_SUPABASE_ANON_KEY` (arba jų serverinių `SUPABASE_URL` / `SUPABASE_ANON_KEY` atitikmenų), pritaikytų blogo bei teisinių nustatymų migracijų ir Vercel maršrutų konfigūracijos. Po deploy sitemap pateikite „Google Search Console“ ir patikrinkite URL indeksavimą.

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

Cloud prenumeratos užsakomos rankiniu būdu: iki 20 aktyvių darbuotojų – 29,99 €/mėn., iki 50 – 49,99 €/mėn., iki 75 – 59,99 €/mėn., iki 200 – 129,99 €/mėn. Papildoma įmonė turi atskirą workspace ir kainuoja pagal darbuotojų ribą: iki 20 – 19,99 €, iki 50 – 34,99 €, iki 75 – 44,99 €, iki 200 – 89,99 €/mėn. Vadovas pasirenka planą ir laikotarpį, gauna unikalų pavedimo kodą bei išankstinę sąskaitą ir iškart 5 dienoms – pilną prieigą. Įmonės nustatymuose vadovas gali nurodyti sąskaitos adresą ir PVM mokėtojo kodą; šie duomenys įrašomi į išankstinės bei galutinės sąskaitų momentines kopijas. Gavęs apmokėjimą kūrėjas patvirtina užsakymą; galiojimas ir galutinė sąskaita skaičiuojami nuo išankstinės sąskaitos datos. Jei per 5 dienas neapmokama, darbo sritis tampa tik skaitoma; dar 2 mėn. galima peržiūrėti duomenis ir atsisiųsti PDF. Stripe integracija neprijungta. Sąskaitų rekvizitai ir PVM nustatymai tvarkomi kūrėjo skiltyje „Prenumeratos“; PVM režimas išjungtas pagal nutylėjimą. Sąskaitų duomenys saugomi kaip JSON, o PDF sugeneruojamas naršyklėje atsisiuntimo metu ir failas nelaikomas saugykloje. Kūrėjo skiltyje papildomos įmonės rodomos prie pagrindinės įmonės, užsakymai turi peržiūros ir redagavimo veiksmus, kainas ir galiojimo datas galima koreguoti. Atšaukus apmokėtą prenumeratą, prieiga lieka iki jos pabaigos. Vėliau prieiga užblokuojama, o duomenys paliekami sistemoje.
Aktyviai prenumeratai likus maždaug 3 dienoms iki pabaigos įmonės vadovui siunčiamas vienkartinis el. pašto priminimas per Resend. Siuntimą vykdo Supabase Edge Function kas valandą; laiškas siunčiamas tik pasibaigsiančioms aktyvioms prenumeratoms (įskaitant pradinę 5 dienų bandomąją prieigą), o siuntimo būsena registruojama prenumeratos įraše.
Turinio kūrėjas prenumeratą gali aktyvinti rankiniu būdu pasirinkęs pradžios ir pabaigos datą. Tokiam aktyvinimui prieiga galioja pagal būseną bei pasirinktas datas, nepriklausomai nuo ankstesnio mokėjimo statuso; tai nekeičia mokėjimo būsenos ar sąskaitų. Pasibaigus rankiniu būdu nustatytam laikotarpiui taikomas įprastas dviejų mėnesių peržiūros režimas. Jei rankinio aktyvinimo migracija jau buvo pritaikyta, įdiekite ir `supabase/migrations/20261112115000_prioritize_manual_subscription_access.sql`: ši papildoma migracija užtikrina, kad rankiniu būdu aktyvinta prenumerata būtų parenkama pirmiau už naujesnį laukiantį užsakymą. Supabase pakeitimams pritaikyti naudokite `npx supabase db push --linked`.

Priminimų įdiegimas:

1. Sugeneruokite stiprią atsitiktinę reikšmę, Supabase SQL Editor lange įrašykite ją į Vault ir naudokite tik serverio aplinkoje:

   ```sql
   select vault.create_secret('SUGENERUOTA_CRON_PASLAPTIS', 'subscription_expiration_reminder_cron_secret');
   ```

2. Nustatykite Resend API raktą, patvirtintą siuntėjo adresą ir tą pačią cron paslaptį Supabase Function aplinkoje. `SUPABASE_URL` ir `SUPABASE_SERVICE_ROLE_KEY` Supabase Edge Functions aplinkoje pateikiami automatiškai:

   ```powershell
   npx supabase secrets set RESEND_API_KEY="RESEND_API_RAKTAS" RESEND_FROM_EMAIL="DSS Pro <siuntejas@jusu-patvirtintas-domenas.lt>" SUBSCRIPTION_REMINDER_CRON_SECRET="SUGENERUOTA_CRON_PASLAPTIS" --project-ref wickbchyltkpmudopnwc
   ```

3. Prieš pritaikydami priminimo migraciją įdiekite Function: `npx supabase functions deploy subscription-expiration-reminder --project-ref wickbchyltkpmudopnwc`.
4. Pritaikykite `supabase/migrations/20261112110000_subscription_expiration_email_reminders.sql` įprasta Supabase migracijų komanda. Ji užregistruoja valandinį `pg_cron` darbą ir kviečia Edge Function, naudodama Vault saugomą cron paslaptį.

Function konfigūracijos paslaptis ir Vault reikšmė turi sutapti. Nepavykę laiškai žymimi kaip nesiųsti ir gali būti bandomi iš naujo; Resend idempotency raktas apsaugo nuo dubliuotų laiškų pakartotinio bandymo metu.
Sąskaitų archyvas vadovui rodo pasirinktos įmonės sąskaitas, o kūrėjui — tik atidarytos įmonės sąskaitas. Sąrašai filtruojami pagal metus, naujausios sąskaitos rodomos pirmiausia, o puslapiuose pateikiama iki 20 įrašų. Sąskaitos JSON užkraunamas tik atidarius konkretaus dokumento PDF veiksmą; sąrašai skaito tik sąskaitos numerį ir datą. Metų pasirinkimas pagal nutylėjimą nustatomas į einamuosius metus.

Kūrėjo prenumeratų valdymas grupuoja papildomas įmones prie pagrindinės, sąrašą galima ieškoti ir filtruoti pagal būseną; įmonių grupės puslapiuojamos po 20 ir iš pradžių sutrauktos. Aktyvios, per 5 dienas besibaigiančios, pasibaigusios ir apmokėjimo laukiančios prenumeratos pažymimos spalvomis. Kūrėjas gali atskirai ištrinti išankstinį arba galutinį sąskaitos dokumentą, patvirtinęs veiksmą; prenumerata ir apmokėjimo istorija lieka nepakeistos. Išankstinės sąskaitos negalima ištrinti, kol užsakymas laukia apmokėjimo, kad liktų galimybė sugeneruoti galutinę sąskaitą.

Vadovas įmonės nustatymuose gali atskirai suteikti DSS specialistui teisę tvarkyti įmonės darbo sritį arba bet kada ją atšaukti. Gavęs teisę specialistas gali tvarkyti darbuotojus, dokumentus, priskyrimus ir DSS komisiją; jis išlieka DSS specialistu ir gali pasirašyti tik kaip DSS specialistas. Vadovo parašo PIN keitimas ir vadovo vardu pasirašymas lieka tik vadovui.

Turinio kūrėjas bibliotekos šablonus gali pažymėti kaip numatytuosius įmonėms: jie priskiriami esamoms įmonėms ir automatiškai priskiriami kuriant naują įmonę. Vadovas gali pakeisti savo įmonės pasirinkimus. Įvadinio ir darbo vietos instruktavimo žurnaluose galima nustatyti, ar instruktavo vadovas, ar DSS specialistas; protokolo komisijos narių parašai nustatomi atskirai.

Cloud parašų istorija kraunama iš normalizuotos `document_signatures` lentelės puslapiais po 25 įrašus. Ekrane pirmiausia rodomi parašo metaduomenys, o saugyklos URL ir vaizdas įkeliami tik paspaudus „Peržiūrėti parašą“. Darbo eigos būsenos ir kitos funkcijos kol kas tebenaudoja darbo srities `signatures` metaduomenis.

Nauji parašai saugomi kaip raiškai nepriklausomi SVG failai, kurių dydis ribojamas iki 10 KB; įmonės darbo srities JSON saugomas tik parašo metaduomenų ir failo kelias, o ne vaizdo turinys. „Supabase Storage“ migracija leidžia SVG ir palieka esamus PNG parašus suderinamus.

`organization_data` JSON darbo sritis paliekama dabartiniams nustatymams ir suderinamumui su dar neperkeltomis funkcijomis. Didesnės istorijos ir sąrašai gali būti palaipsniui perkeliami į normalizuotas lenteles atskirais, suderinamais žingsniais; vienu pakeitimu visos darbo srities schema nekeičiama. Šiuo metu parašų istorijos skaitymas jau naudoja normalizuotą lentelę, tačiau kitos parašų darbo eigos dalys dar remiasi JSON metaduomenimis.

Vadovo ir DSS specialisto darbo sričių įkėlimas bendrų šablonų nebeskaito iš kiekvienos įmonės `organization_data.resources` JSON kopijos: bendri šablonai imami iš katalogo, o įmonės dokumentai iš `organization_documents`. Likę darbo srities duomenys ir jų autosave dar palaiko esamą JSON formatą; šis suderinamumo sluoksnis bus šalinamas atskirais etapais. Esamoje nuotolinėje DB `resources` laukas sudarė apie 38 KB vienai darbo sričiai, todėl pirmas etapas pašalina šį dubliuotą lauką iš vadovo ir DSS darbo sričių įkėlimo atsako.

Parašų istorijos puslapiavimą palaiko indeksai pagal įmonę ir datą, įmonę bei darbuotoją ir įmonę bei pasirašiusį naudotoją. Protokolo dalyvių paieškai pagal įmonę ir darbuotoją taip pat yra atskiras indeksas. Šios lentelės turi įjungtą tenant-scoped RLS; narių tikrinimą aptarnauja `organization_memberships` pirminis raktas ir darbuotojo dalinis unikalus indeksas. Dabartinė duomenų bazė maža, todėl `EXPLAIN` gali pagrįstai rinktis nuoseklų lentelės skenavimą; tai nėra apkrovos bandymas ar įrodymas, kaip veiks planas prie SaaS masto.

Darbuotojo profilio tipas atpažįstamas prisijungus. Darbuotojų paskyrų kūrimas, kvietimai, jų dokumentų cloud prieiga ir realaus elektroninio parašo patvirtinimas taip pat dar nėra prijungti.

## Vietiniai duomenys

Naršyklės raktas: `dsspro-local-demo-v1`. Norėdami pradėti nuo pradinių duomenų, pašalinkite šį raktą iš vietinės svetainės saugyklos ir atnaujinkite puslapį.