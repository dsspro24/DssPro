create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 5 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 180),
  excerpt text not null check (char_length(excerpt) between 20 and 320),
  category text not null default 'Darbuotojų sauga' check (char_length(category) between 2 and 80),
  content text not null check (char_length(content) between 100 and 30000),
  seo_title text not null default '' check (char_length(seo_title) <= 180),
  seo_description text not null default '' check (char_length(seo_description) <= 320),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index blog_posts_published_at_idx
  on public.blog_posts (published_at desc)
  where status = 'published';

alter table public.blog_posts enable row level security;

revoke all on public.blog_posts from anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

create policy "Public can read published blog posts"
  on public.blog_posts for select to anon
  using (status = 'published');

create policy "Authenticated users can read published blog posts and creators can read all"
  on public.blog_posts for select to authenticated
  using (status = 'published' or public.is_creator());

create policy "Creators can create blog posts"
  on public.blog_posts for insert to authenticated
  with check (public.is_creator() and created_by = (select auth.uid()));

create policy "Creators can update blog posts"
  on public.blog_posts for update to authenticated
  using (public.is_creator())
  with check (public.is_creator());

create policy "Creators can delete blog posts"
  on public.blog_posts for delete to authenticated
  using (public.is_creator());

create or replace function public.update_blog_post_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'published' then
    if tg_op = 'INSERT' then
      new.published_at := now();
    elsif old.status <> 'published' then
      new.published_at := now();
    end if;
  elsif new.status = 'draft' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.update_blog_post_timestamps() from public, anon, authenticated;

create trigger set_blog_post_timestamps
  before insert or update on public.blog_posts
  for each row execute function public.update_blog_post_timestamps();

insert into public.blog_posts (
  title, slug, excerpt, category, content, seo_title, seo_description, status
) values
(
  'Darbuotojų saugos instruktažas: kaip jį organizuoti nuosekliai',
  'darbuotoju-saugos-instruktazas-kaip-organizuoti',
  'Praktinis vadovas, kaip pasiruošti instruktažui, pritaikyti jį darbui ir patikimai užfiksuoti darbuotojo supažindinimą.',
  'Instruktažai',
  $$## Instruktažas turi padėti dirbti saugiai

Darbuotojų saugos ir sveikatos instruktažas nėra vien parašas žurnale. Jo paskirtis – padėti darbuotojui suprasti, kokie pavojai kyla atliekant konkretų darbą, kaip jų išvengti ir ką daryti pasikeitus aplinkybėms. Todėl gera instruktažo tvarka prasideda nuo realių darbo sąlygų, o ne vien nuo bendro dokumento.

## Pasiruoškite pagal atliekamą darbą

Prieš instruktuodami įvertinkite darbuotojo pareigas, naudojamą įrangą, darbo vietą ir aktualius profesinės rizikos vertinimo rezultatus. Pateikite informaciją darbuotojui suprantama kalba ir tokiu būdu, kad jis galėtų užduoti klausimus. Kai darbas ar įranga keičiasi, patikrinkite, ar reikia atnaujinti instrukciją, mokymą arba supažindinimą.

Instruktaže aptarkite konkrečias saugaus darbo taisykles, taikomas apsaugos priemones, pavojingas zonas, incidentų ar avarinių situacijų veiksmus ir atsakingų asmenų kontaktus. Venkite abstrakčių formuluočių, kurios nepasako darbuotojui, ką jis turi daryti savo darbo vietoje.

## Užfiksuokite procesą ir patikrinkite supratimą

Dokumentuokite, kas, kada, su kokia instrukcija ar jos versija buvo supažindintas ir kokiu būdu tai patvirtinta. Įrašai turi atitikti įmonėje patvirtintą tvarką. Vien parašas neparodo, ar informacija buvo suprasta, todėl verta paprašyti darbuotojo savais žodžiais paaiškinti svarbiausius veiksmus arba aptarti praktinį pavyzdį.

Periodiškai peržiūrėkite instrukcijas, ypač kai keičiasi darbo procesai, įranga, darbo vieta ar galiojantys reikalavimai. Nustatykite, kas atsakingas už dokumentų versijas ir kaip darbuotojai informuojami apie pakeitimus.

## Trumpas pasiruošimo sąrašas

- Susiekite instruktažą su konkrečiu darbu ir nustatytais pavojais.
- Patikrinkite, ar naudojama aktuali dokumento versija.
- Skirkite laiko klausimams ir supratimo patikrinimui.
- Užfiksuokite supažindinimą pagal įmonėje nustatytą tvarką.
- Peržiūrėkite medžiagą po reikšmingų darbo ar teisės aktų pakeitimų.

## Ką verta prisiminti

Instruktažo turinį ir periodiškumą nustatykite pagal galiojančius teisės aktus, darbuotojo funkcijas, rizikos vertinimą ir įmonės patvirtintas procedūras. Šis straipsnis yra bendro pobūdžio informacija, o ne individuali teisinė konsultacija.

Šaltiniai: [Valstybinė darbo inspekcija](https://vdi.lrv.lt/) · [Teisės aktų registras](https://www.e-tar.lt/portal/lt/legalActSearch)$$,
  'Darbuotojų saugos instruktažas: praktinis vadovas | DSS Pro',
  'Sužinokite, kaip pasiruošti darbuotojų saugos instruktažui, pritaikyti jį konkrečiam darbui ir aiškiai užfiksuoti supažindinimą.',
  'published'
),
(
  'Profesinės rizikos vertinimas: nuo pavojų iki prevencijos',
  'profesines-rizikos-vertinimas-nuo-pavoju-iki-prevencijos',
  'Kaip atpažinti darbo vietos pavojus, įtraukti darbuotojus ir paversti vertinimo rezultatus praktiškomis saugos priemonėmis.',
  'Rizikos vertinimas',
  $$## Rizikos vertinimas – ne formalus dokumentas

Profesinės rizikos vertinimo tikslas – nustatyti, kas darbe gali sužaloti ar pakenkti darbuotojo sveikatai, įvertinti riziką ir pasirinkti jos mažinimo priemones. Vertinimas tampa naudingas tada, kai jo rezultatai naudojami kasdieniuose sprendimuose: planuojant darbus, parenkant įrangą, organizuojant mokymą ir tikrinant, ar priemonės veikia.

## Pradėkite nuo darbo vietos ir darbuotojų patirties

Apžiūrėkite darbo vietas ir užduotis skirtingomis darbo sąlygomis. Atsižvelkite į įrangą, medžiagas, darbo aplinką, ergonomiką, darbo organizavimą ir galimas avarines situacijas. Į vertinimą įtraukite darbuotojus – jie dažnai pastebi pasikartojančias kliūtis, skubėjimą ar nepatogius darbo būdus, kurių dokumentuose nesimato.

Vertinkite ne tik įprastą darbo eigą, bet ir priežiūrą, valymą, gedimų šalinimą, darbą šalia kitų procesų bei retai atliekamas užduotis. Įvardykite, kam pavojus gali kilti ir kokiomis aplinkybėmis.

## Pirmiausia mažinkite riziką jos šaltinyje

Planuodami priemones, pirmiausia svarstykite, ar pavojų galima pašalinti, pakeisti saugesniu procesu ar sumažinti techninėmis ir kolektyvinėmis apsaugos priemonėmis. Organizacinės taisyklės ir asmeninės apsaugos priemonės taip pat svarbios, tačiau neturėtų tapti vieninteliu atsaku, kai pavojų galima kontroliuoti patikimiau.

Kiekvienai priemonei priskirkite atsakingą asmenį ir įgyvendinimo terminą. Po pakeitimų patikrinkite, ar rizika iš tikrųjų sumažėjo ir ar neatsirado naujų pavojų. Išvadas paaiškinkite darbuotojams jiems suprantamu būdu.

## Kada vertinimą peržiūrėti?

Peržiūrėkite vertinimą, kai reikšmingai pasikeičia darbo vieta, technologija, įranga, naudojamos medžiagos ar užduotys, taip pat po incidentų ar pastebėjus, kad numatytos priemonės neveikia. Konkretų vertinimo ir dokumentavimo procesą nustatykite pagal galiojančius reikalavimus ir įmonės tvarką.

## Naudingi žingsniai

- Aprašykite realias užduotis ir darbo sąlygas.
- Pasitarkite su darbuotojais ir jų atstovais.
- Įvertinkite, kam ir kokiomis aplinkybėmis kyla pavojus.
- Numatyti priemones, atsakomybes ir įgyvendinimo terminus.
- Patikrinkite priemonių veiksmingumą ir atnaujinkite vertinimą pasikeitus sąlygoms.

Šaltiniai: [Valstybinė darbo inspekcija](https://vdi.lrv.lt/) · [Teisės aktų registras](https://www.e-tar.lt/portal/lt/legalActSearch)$$,
  'Profesinės rizikos vertinimas darbo vietoje | DSS Pro',
  'Praktiniai žingsniai, kaip nustatyti darbo vietos pavojus, parinkti prevencines priemones ir peržiūrėti rizikos vertinimą.',
  'published'
),
(
  'Asmeninės apsaugos priemonės: parinkimas, naudojimas ir priežiūra',
  'asmenines-apsaugos-priemones-parinkimas-naudojimas-prieziura',
  'Kaip parinkti AAP pagal konkrečius pavojus ir užtikrinti, kad darbuotojai žinotų, kaip jas naudoti ir prižiūrėti.',
  'Asmeninės apsaugos priemonės',
  $$## AAP turi atitikti pavojų ir darbuotojo užduotį

Asmeninės apsaugos priemonės (AAP) skirtos apsaugoti darbuotoją nuo likutinės rizikos, kurios nepavyko pašalinti kitomis priemonėmis. Todėl jų parinkimas turėtų remtis profesinės rizikos vertinimu, darbo pobūdžiu ir gamintojo pateikta informacija, o ne vien bendru sąrašu ar įpročiu.

## Parinkite tinkamą priemonę

Įvertinkite, nuo kokio konkretaus poveikio reikia apsaugoti, kokiomis sąlygomis priemonė bus naudojama ir ar ji suderinama su kitomis tuo pačiu metu dėvimomis priemonėmis. AAP turi tinkamai tikti darbuotojui, nevaržyti saugaus darbo ir būti tinkama konkrečiai aplinkai. Jei reikia, pasikonsultuokite su darbuotojais, kompetentingu DSS specialistu ir priemonių tiekėju.

Darbuotojui paaiškinkite, kokį pavojų priemonė mažina, kada ją dėvėti, kaip ją teisingai užsidėti ir nusivilkti, kokie jos apribojimai ir kaip atpažinti pažeidimą. Vien priemonės išdavimas nepatvirtina, kad žmogus moka ją naudoti.

## Priežiūra, patikra ir keitimas

Vadovaukitės gamintojo instrukcijomis dėl laikymo, valymo, patikrų ir naudojimo trukmės. Prieš naudojimą darbuotojas turėtų įsitikinti, kad priemonė nepažeista ir tinkama naudoti. Sugedusias, užterštas ar kitaip netinkamas priemones reikia pašalinti iš naudojimo ir pakeisti pagal įmonės tvarką.

Užtikrinkite, kad darbuotojams būtų aišku, į ką kreiptis dėl netinkamo dydžio, gedimo, trūkstamos priemonės ar pasikeitusių darbo sąlygų. AAP parinkimą peržiūrėkite, jei pasikeičia rizika, technologija ar gamintojo rekomendacijos.

## Įmonės kontrolinis sąrašas

- Susiekite kiekvieną priemonę su vertinime nustatytu pavojumi.
- Patikrinkite tinkamumą, suderinamumą ir darbuotojo poreikius.
- Apmokykite darbuotoją naudoti priemonę pagal paskirtį.
- Nustatykite laikymo, priežiūros ir keitimo tvarką.
- Periodiškai patikrinkite, ar priemonė tebėra tinkama atliekamam darbui.

Konkrečios AAP rūšys ir naudojimo taisyklės priklauso nuo darbo sąlygų, rizikos vertinimo ir gamintojo nurodymų. Straipsnis nepakeičia individualaus rizikos vertinimo.

Šaltiniai: [Valstybinė darbo inspekcija](https://vdi.lrv.lt/) · [Teisės aktų registras](https://www.e-tar.lt/portal/lt/legalActSearch)$$,
  'AAP parinkimas ir naudojimas: praktinis vadovas | DSS Pro',
  'Sužinokite, kaip parinkti asmenines apsaugos priemones pagal riziką, apmokyti darbuotojus ir organizuoti jų priežiūrą.',
  'published'
),
(
  'Nelaimingas atsitikimas darbe: pirmieji veiksmai ir prevencija',
  'nelaimingas-atsitikimas-darbe-pirmieji-veiksmai',
  'Aiškūs pirmieji veiksmai įvykus incidentui ir patarimai, kaip išsiaiškinti priežastis bei sumažinti pasikartojimo riziką.',
  'Incidentų valdymas',
  $$## Pirmiausia pasirūpinkite žmonėmis ir saugia aplinka

Įvykus nelaimingam atsitikimui ar pavojingam incidentui, pirmiausia pasirūpinkite nukentėjusiaisiais, prireikus kvieskite skubią pagalbą ir sustabdykite pavojingą veiklą, jei tai galima padaryti saugiai. Apie įvykį nedelsdami informuokite įmonėje nustatytus atsakingus asmenis. Darbuotojai turi iš anksto žinoti, kam ir kokiu būdu pranešti.

Nekeiskite įvykio vietos aplinkybių, išskyrus atvejus, kai tai būtina žmonių apsaugai ar papildomo pavojaus pašalinimui. Fiksuokite laiką, vietą, darbą, įrangą ir aplinkybes, tačiau informaciją rinkite pagarbiai ir neieškodami kaltų iš anksto.

## Išsiaiškinkite priežastis, ne tik pasekmes

Tyrimo tikslas – suprasti, kas lėmė įvykį ir kokios prevencinės priemonės gali užkirsti kelią jo pasikartojimui. Surinkite su įvykiu susijusius dokumentus, įrangos duomenis ir liudytojų paaiškinimus, laikydamiesi nustatytos tvarkos. Vertinkite ne tik tiesioginį veiksmą, bet ir darbo organizavimą, mokymą, įrangos būklę, aplinką bei ankstesnius rizikos signalus.

Teisės aktuose gali būti nustatyti pranešimo, tyrimo, registravimo ir dokumentų pateikimo reikalavimai. Įmonėje atsakingas asmuo turėtų nedelsdamas patikrinti, kokia procedūra taikoma konkrečiam įvykiui ir kokie terminai galioja.

## Paverskite išvadas veiksmais

Tyrimo išvados turi virsti konkrečiomis priemonėmis: nurodykite, kas jas įgyvendins, iki kada ir kaip bus patikrintas rezultatas. Jei reikia, atnaujinkite profesinės rizikos vertinimą, instrukcijas, mokymą ar įrangos priežiūros tvarką. Informuokite darbuotojus tiek, kiek reikia prevencijai, saugodami asmens duomenis ir konfidencialią informaciją.

## Iš anksto pasiruoškite

- Paskirkite atsakingus asmenis ir paruoškite pranešimo tvarką.
- Užtikrinkite, kad darbuotojai žinotų pirmuosius veiksmus ir kontaktus.
- Pažymėkite, kokie dokumentai bei duomenys turi būti išsaugoti.
- Stebėkite, ar prevencinės priemonės realiai įgyvendintos.
- Peržiūrėkite rizikos vertinimą, jei įvykis atskleidė naują pavojų.

Šis straipsnis yra bendro pobūdžio informacija. Įvykio tyrimo ir pranešimo veiksmus atlikite pagal konkrečiam atvejui galiojančius teisės aktus ir įmonės procedūras.

Šaltiniai: [Valstybinė darbo inspekcija](https://vdi.lrv.lt/) · [Bendrasis pagalbos centras](https://bpc.lrv.lt/) · [Teisės aktų registras](https://www.e-tar.lt/portal/lt/legalActSearch)$$,
  'Nelaimingas atsitikimas darbe: ką daryti? | DSS Pro',
  'Pirmieji veiksmai įvykus nelaimingam atsitikimui darbe, tyrimo paskirtis ir prevencijos priemonių įgyvendinimas.',
  'published'
)
on conflict (slug) do nothing;
