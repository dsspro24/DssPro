import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CircleCheck, GraduationCap } from 'lucide-react';

const lessons = [
  {
    id: 'res-chemical-safety-test',
    category: 'Cheminė sauga',
    title: 'Saugus darbas su cheminėmis medžiagomis',
    pages: [
      {
        title: '1. Pažinkite medžiagą prieš pradėdami',
        paragraphs: [
          'Cheminės medžiagos gali būti degios, ėsdinančios, nuodingos, dirginančios ar kitaip pavojingos. Rizika priklauso ne vien nuo medžiagos pavadinimo, bet ir nuo jos kiekio, koncentracijos, naudojimo būdo bei darbo aplinkos.',
          'Prieš darbą perskaitykite pakuotės etiketę ir saugos duomenų lapą. Etiketėje ieškokite pavojingumo piktogramų, įspėjamojo žodžio ir nurodymų. Saugos duomenų lape pateikiama informacija apie rizikas, apsaugos priemones, laikymą, pirmąją pagalbą ir veiksmus avarijos atveju.',
        ],
        bullets: [
          'Naudokite tik aiškiai paženklintą ir nepažeistą pakuotę.',
          'Žinokite, kur rasti saugos duomenų lapą ir į ką kreiptis iškilus klausimams.',
          'Nenaudokite nežinomos medžiagos ir nemaišykite produktų savo nuožiūra.',
        ],
        takeaway: 'Prieš naudodami produktą perskaitykite jo etiketę ir saugos nurodymus.',
      },
      {
        title: '2. Saugus naudojimas ir laikymas',
        paragraphs: [
          'Dirbkite pagal darbo vietos instrukciją ir saugos duomenų lape nurodytas sąlygas. Užtikrinkite reikiamą vėdinimą, naudokite konkrečiam darbui parinktas asmenines apsaugos priemones ir saugokite, kad medžiaga nepatektų ant odos, į akis ar į aplinką.',
          'Medžiagas laikykite tam skirtoje, tvarkingoje vietoje, sandariai uždarytas ir originaliose arba tinkamai paženklintose talpyklose. Laikymo sąlygos ir atskyrimas priklauso nuo produkto savybių – vadovaukitės etikete, saugos duomenų lapu ir įmonės tvarka.',
        ],
        bullets: [
          'Nenaudokite maisto ar gėrimų taros chemikalams laikyti.',
          'Nelaikykite medžiagų praėjimuose ar prie šilumos šaltinių, jei tai draudžia nurodymai.',
          'Pastebėję nesandarumą, pažeistą pakuotę ar netinkamą ženklinimą, sustabdykite darbą ir praneškite atsakingam asmeniui.',
        ],
        takeaway: 'Apsaugos priemonės ir laikymo sąlygos parenkamos pagal konkrečią medžiagą.',
      },
      {
        title: '3. Išsiliejimas, kontaktas ir pagalba',
        paragraphs: [
          'Išsiliejus ar išsiskyrus medžiagai, perspėkite šalia esančius ir laikykitės įmonės avarinės tvarkos. Nevalykite išsiliejimo, jei nesate apmokyti, nežinote medžiagos arba neturite tinkamų priemonių. Esant pavojui pasitraukite į saugią vietą ir kvieskite pagalbą.',
          'Medžiagai patekus ant odos ar į akis, vadovaukitės saugos duomenų lapo pirmosios pagalbos nurodymais ir nedelsdami praneškite atsakingam asmeniui. Sunkaus sužalojimo, apsinuodijimo ar tiesioginio pavojaus atveju skambinkite 112. Įvykį užregistruokite pagal įmonės tvarką.',
        ],
        bullets: [
          'Neleiskite medžiagai patekti į kanalizaciją ar aplinką.',
          'Neimprovizuokite neutralizavimo ar valymo būdų.',
          'Atliekas tvarkykite pagal produkto nurodymus ir įmonės tvarką.',
        ],
        takeaway: 'Pirmiausia apsaugokite žmones, tada veikite pagal instrukcijas ir kvieskite pagalbą.',
      },
    ],
  },
  {
    id: 'res-work-at-height-test',
    category: 'Darbas aukštyje',
    title: 'Saugus darbas aukštyje',
    pages: [
      {
        title: '1. Suplanuokite darbą ir įvertinkite pavojus',
        paragraphs: [
          'Kritimas iš aukščio gali sukelti sunkius sužalojimus net ir dirbant palyginti nedideliame aukštyje. Prieš pradėdami įvertinkite darbo vietą, paviršiaus būklę, oro sąlygas, darbo trukmę, įrankius ir galimybę saugiai patekti bei pasitraukti.',
          'Darbus turi atlikti apmokyti ir tam paskirti darbuotojai, laikydamiesi įmonės instrukcijų. Kur įmanoma, rinkitės kolektyvines apsaugos priemones, pavyzdžiui, aptvarus ar tinkamai įrengtą darbo platformą. Pavojingą zoną apačioje pažymėkite ir neleiskite į ją patekti pašaliniams.',
        ],
        bullets: [
          'Patikrinkite, ar darbą galima atlikti nuo žemės arba saugesnės platformos.',
          'Numatykite, kaip bus keliami įrankiai ir medžiagos.',
          'Atidėkite darbą, jei sąlygos nesaugios arba neaiškios.',
        ],
        takeaway: 'Saugus darbas prasideda nuo tinkamo planavimo, o ne nuo lipimo.',
      },
      {
        title: '2. Kopėčios, pastoliai ir platformos',
        paragraphs: [
          'Prieš naudodami kopėčias, pastolius ar platformą, apžiūrėkite, ar jie nepažeisti, stabilūs ir tinkamai pastatyti. Naudokite tik konkrečiam darbui skirtą ir patikrintą įrangą. Savadarbės paaukštinimo priemonės, tokios kaip dėžės ar kėdės, nėra saugus pakaitalas.',
          'Ant pastolių dirbkite tik tada, kai jie sumontuoti ir naudojami pagal nustatytą tvarką. Nešalinkite aptvarų ar kitų apsaugos elementų. Kopėčias statykite ant tvirto, lygaus pagrindo ir naudokite taip, kad išlaikytumėte pusiausvyrą; nebandykite pasiekti per toli persisverdami.',
        ],
        bullets: [
          'Nenaudokite apgadintos, nestabilios ar nepatikrintos įrangos.',
          'Neperkraukite platformų ir neužstatykite priėjimo.',
          'Pastebėję trūkumą, pažymėkite įrangą kaip netinkamą ir praneškite atsakingam asmeniui.',
        ],
        takeaway: 'Jei įranga nestabili arba pažeista, ant jos nedirbkite.',
      },
      {
        title: '3. Apsauga nuo kritimo ir veiksmai pavojaus atveju',
        paragraphs: [
          'Kai kolektyvinės apsaugos nepakanka, naudokite darbui tinkamai parinktą ir patikrintą asmeninę apsaugos nuo kritimo sistemą. Diržai ir jungtys turi būti nepažeisti, tinkamai užsegti ir prijungti prie numatyto tvirtinimo taško. Vadovaukitės mokymuose ir darbo vietos instrukcijoje pateiktais reikalavimais.',
          'Prieš darbą sutarkite, kaip bus iškviesta pagalba ir išgelbėtas kabantis darbuotojas. Pastebėję apsaugos trūkumą, pavojingas oro sąlygas ar pasikeitusią darbo vietą, sustokite, saugiai pasitraukite ir informuokite vadovą. Nesiimkite gelbėjimo veiksmų, kuriems nesate paruošti.',
        ],
        bullets: [
          'Nenaudokite priemonių, kurių patikros būklė ar tinkamumas nežinomi.',
          'Nedirbkite vieni, jei pagal darbo pobūdį būtina užtikrinti stebėjimą ar pagalbą.',
          'Apie incidentą ar vos neįvykusį nelaimingą atsitikimą praneškite nedelsdami.',
        ],
        takeaway: 'Apsaugos priemonė veikia tik tada, kai tinkamai parinkta, patikrinta ir naudojama.',
      },
    ],
  },
  {
    id: 'res-fire-knowledge-test',
    category: 'Priešgaisrinė sauga',
    title: 'Gaisro prevencija ir evakuacija',
    pages: [
      {
        title: '1. Kaip mažinti gaisro riziką',
        paragraphs: [
          'Gaisrą dažnai sukelia neatsargus darbas su atvira liepsna, netvarkinga elektros įranga, netinkamas šildymas arba degių medžiagų laikymas. Darbo vietoje laikykitės gaisrinės saugos instrukcijų ir konkrečiai zonai nustatytų apribojimų.',
          'Evakuacijos keliai, išėjimai ir priėjimai prie gesinimo priemonių turi būti neužstatyti. Nenaudokite pažeistų elektros laidų, nepalikite be priežiūros pavojingų įrenginių, o pastebėję gedimą praneškite atsakingam asmeniui.',
        ],
        bullets: [
          'Žinokite artimiausią evakuacijos išėjimą ir susirinkimo vietą.',
          'Susipažinkite su gaisro pavojaus signalu ir įmonės perspėjimo tvarka.',
          'Laikykite degias medžiagas tik joms skirtose vietose.',
        ],
        takeaway: 'Tvarkinga darbo vieta ir neužstatyti išėjimai padeda išvengti gaisro bei greičiau evakuotis.',
      },
      {
        title: '2. Ką daryti pastebėjus gaisrą',
        paragraphs: [
          'Pastebėję gaisrą ar dūmus, nedelsdami perspėkite aplinkinius ir įjunkite pavojaus signalą pagal įmonės tvarką. Skambindami 112 aiškiai nurodykite adresą, kas dega, ar yra nukentėjusiųjų ir kaip su jumis susisiekti. Neužlaikykite evakuacijos bandydami gelbėti daiktus.',
          'Evakuokitės artimiausiu saugiu keliu, vadovaukitės ženklais ir atsakingų asmenų nurodymais. Jei įmanoma tai padaryti nerizikuojant, uždarykite duris už savęs. Pasiekę susirinkimo vietą praneškite, ar matėte likusių žmonių, ir negrįžkite į pastatą, kol to neleis atsakingi asmenys.',
        ],
        bullets: [
          'Nenaudokite lifto, jei evakuacijos plane nenurodyta kitaip.',
          'Neikite per dūmus; jei kelias uždūmintas, rinkitės kitą saugų išėjimą.',
          'Padėkite kitiems tik nekeliamas pavojus jums patiems.',
        ],
        takeaway: 'Įspėkite, kvieskite pagalbą ir evakuokitės – žmonių saugumas svarbiau už turtą.',
      },
      {
        title: '3. Gesintuvai ir saugus elgesys',
        paragraphs: [
          'Gesintuvą naudokite tik tada, jei gaisras nedidelis, žinote, kaip elgtis, turite tinkamą gesinimo priemonę ir už savęs išsaugote laisvą pasitraukimo kelią. Vadovaukitės gesintuvo ženklinimu ir mokymuose išmokta tvarka.',
          'Jei ugnis plinta, patalpa prisipildo dūmų arba nesate tikri, kad galite veikti saugiai, pasitraukite ir palikite gesinimą ugniagesiams. Netinkama gesinimo priemonė gali padidinti pavojų, todėl neimprovizuokite ir nebandykite gesinti elektros ar kitų specifinių gaisrų priemone, kuri tam neskirta.',
        ],
        bullets: [
          'Gesinimas neturi trukdyti evakuacijai ir pagalbos iškvietimui.',
          'Dūmai yra pavojingi – neikite į uždūmintą patalpą gelbėti turto.',
          'Po įvykio informuokite atsakingą asmenį net ir tada, kai gaisras užgesintas.',
        ],
        takeaway: 'Gesintuvą naudokite tik saugiomis sąlygomis; kitu atveju evakuokitės.',
      },
    ],
  },
  {
    id: 'res-excavation-safety-test',
    category: 'Darbai iškasose ir pylimuose',
    title: 'Saugus darbas iškasose',
    pages: [
      {
        title: '1. Pasiruoškite kasimo darbams',
        paragraphs: [
          'Prieš kasant būtina žinoti darbo ribas, grunto sąlygas ir galimų požeminių tinklų vietas. Darbų vadovas turi organizuoti darbą pagal projektą, leidimus ir įmonėje nustatytą tvarką. Nepradėkite kasimo, jei nėra aišku, kur gali būti kabeliai, vamzdynai ar kitos komunikacijos.',
          'Aptikę nežymėtą kabelį, vamzdį, įtartiną objektą ar sprogmenį primenantį daiktą, sustabdykite darbus, jo nelieskite ir neleiskite artintis kitiems. Informuokite vadovą ir veikite pagal nustatytą pranešimo bei avarinę tvarką.',
        ],
        bullets: [
          'Patikrinkite darbo vietos aptvėrimą, ženklus ir saugų priėjimą.',
          'Įsitikinkite, kad darbuotojai žino darbų planą ir pavojingas zonas.',
          'Sustokite, jei reali situacija neatitinka turimų brėžinių ar nurodymų.',
        ],
        takeaway: 'Neaiškios požeminės komunikacijos – priežastis sustabdyti kasimą ir išsiaiškinti.',
      },
      {
        title: '2. Apsauga nuo grunto griūties',
        paragraphs: [
          'Iškasos sienos gali griūti dėl grunto savybių, vibracijos, vandens, oro sąlygų ar netinkamos apkrovos prie krašto. Apsaugos būdą – šlaitavimą, tvirtinimą ar kitą sprendimą – turi nustatyti atsakingi specialistai pagal konkrečias sąlygas. Niekada neįeikite į iškasą, kuri neapsaugota taip, kaip reikalaujama.',
          'Iškastą gruntą, medžiagas ir techniką laikykite nuo krašto taip, kaip nurodyta darbo plane. Apsaugokite kraštus nuo žmonių ar transporto priemonių įkritimo. Naudokite numatytus saugius įėjimo ir išėjimo būdus, o ne lipkite nestabiliomis sienomis.',
        ],
        bullets: [
          'Nekeiskite tvirtinimo konstrukcijų ir nešalinkite jų be leidimo.',
          'Neikite po pakabintu kroviniu ir nestovėkite ekskavatoriaus veikimo zonoje.',
          'Pastebėję įtrūkimus, grunto slinkimą ar vandens kaupimąsi, pasitraukite ir perspėkite kitus.',
        ],
        takeaway: 'Jei iškasa atrodo nestabili, visi darbuotojai turi pasitraukti į saugią vietą.',
      },
      {
        title: '3. Patikra, ryšys ir avariniai veiksmai',
        paragraphs: [
          'Darbo vietą turi tikrinti už tai atsakingas asmuo prieš pradedant darbus ir pasikeitus sąlygoms, pavyzdžiui, po stipraus lietaus, vibracijos ar grunto pokyčių. Darbuotojai turi žinoti, kam pranešti ir kaip iškviesti pagalbą. Dirbant giliose ar riboto matomumo vietose svarbu laikytis nustatytos stebėjimo ir ryšio tvarkos.',
          'Pajutę grunto judėjimą, išgirdę neįprastą garsą ar pastebėję konstrukcijos gedimą, nedelsdami perspėkite kitus ir pasitraukite numatytu keliu. Griūties atveju neikite į nestabilią iškasą gelbėti žmogaus, jei nesate tam parengti – kvieskite 112 ir vykdykite gelbėtojų nurodymus.',
        ],
        bullets: [
          'Negrįžkite į pavojingą zoną, kol jos saugumas nepatvirtintas.',
          'Apie incidentą ir vos neįvykusią griūtį praneškite atsakingam vadovui.',
          'Pirmąją pagalbą teikite tik tiek, kiek saugu jums ir nukentėjusiajam.',
        ],
        takeaway: 'Įtarus griūtį – perspėkite, pasitraukite ir kvieskite profesionalią pagalbą.',
      },
    ],
  },
  {
    id: 'res-manual-handling-test',
    category: 'Krovinių kėlimas rankomis',
    title: 'Saugus krovinių kėlimas ir nešimas',
    pages: [
      {
        title: '1. Įvertinkite krovinį ir pasirinkite būdą',
        paragraphs: [
          'Prieš keldami įvertinkite krovinio svorį, dydį, formą, stabilumą ir suėmimo vietas. Patikrinkite, ar krovinys nepažeistas ir ar jo turinys nepavojingas. Įvertinkite savo savijautą, kelią, atstumą ir vietą, kurioje krovinį padėsite.',
          'Jei krovinys sunkus, nepatogus ar kelia abejonių, rinkitės vežimėlį, kėlimo mechanizmą arba paprašykite pagalbos. Leistina apkrova priklauso nuo darbo sąlygų ir rizikos vertinimo, todėl nesivadovaukite vien universaliu kilogramų skaičiumi.',
        ],
        bullets: [
          'Pašalinkite kliūtis, slidžias vietas ir užtikrinkite pakankamą apšvietimą.',
          'Iš anksto suplanuokite maršrutą ir krovinio padėjimo vietą.',
          'Nekelkite krovinio, jei negalite jo saugiai suimti ar matyti kelio.',
        ],
        takeaway: 'Mechaninė pagalba ar darbas dviese dažnai saugesnis už kėlimą vienam.',
      },
      {
        title: '2. Kelkite ir nuleiskite valdydami judesį',
        paragraphs: [
          'Atsistokite stabiliai, prisiartinkite prie krovinio ir tvirtai jį suimkite. Kelkite tolygiai, laikydami krovinį kuo arčiau kūno. Judėkite kojomis ir visu kūnu, o ne staigiai sukdami liemenį su svoriu rankose. Nuleiskite krovinį kontroliuojamai.',
          'Neskubėkite ir netraukite krovinio staigiu judesiu. Jei keliant atsiranda skausmas, prarandate pusiausvyrą ar krovinys pasislenka, saugiai jį padėkite ir kreipkitės pagalbos. Naudokite darbo pobūdžiui tinkamas pirštines ir kitus nurodytus apsauginius drabužius.',
        ],
        bullets: [
          'Laikykite pėdas stabiliai ir venkite pasilenkimo bei persisukimo vienu metu.',
          'Neuždenkite kroviniu savo matymo lauko.',
          'Nepalikite krovinio nestabilioje ar nepažymėtoje vietoje.',
        ],
        takeaway: 'Valdomas, artimas ir tolygus judesys mažina nugaros bei sąnarių apkrovą.',
      },
      {
        title: '3. Perkelkite ir sandėliuokite saugiai',
        paragraphs: [
          'Nešdami krovinį eikite laisvu, lygiu maršrutu ir žiūrėkite, kur statote kojas. Jei krovinys nepatogus, didelis ar ilgas, susitarkite dėl bendrų veiksmų ir komandų su pagalbininku. Neperduokite krovinio kitam žmogui neįspėję.',
          'Kraukite krovinius tik į numatytas vietas, stabiliai ir taip, kad jie negalėtų nuslysti ar apvirsti. Neužstatykite praėjimų, išėjimų ar gesinimo priemonių. Naudokite tik tinkamus vežimėlius ir kėlimo įrenginius; darbą su jais atlikite tik turėdami reikiamą pasirengimą ir leidimą.',
        ],
        bullets: [
          'Neikite po keliamu ar nestabiliai sukrautu kroviniu.',
          'Nedelsdami praneškite apie pavojingą krovinį, netvarkingą įrangą ar patirtą skausmą.',
          'Po nelaimingo atsitikimo informuokite vadovą pagal įmonės tvarką.',
        ],
        takeaway: 'Saugus kėlimas apima visą procesą – nuo krovinio įvertinimo iki jo stabilaus padėjimo.',
      },
    ],
  },
  {
    id: 'res-workplace-conduct-test',
    category: 'Pagarbi ir saugi darbo aplinka',
    title: 'Smurto, priekabiavimo ir diskriminacijos prevencija',
    pages: [
      {
        title: '1. Atpažinkite netinkamą elgesį',
        paragraphs: [
          'Psichologinis smurtas gali pasireikšti žeminimu, bauginimu, grasinimais, apkalbomis, izoliavimu ar nuolatiniu nepagrįstu profesinių gebėjimų menkinimu. Pasikartojantis ir į darbuotoją nukreiptas elgesys gali rodyti sisteminį spaudimą, tačiau situacijos vertinamos pagal visus faktus ir aplinkybes.',
          'Priekabiavimas – tai nepageidaujamas elgesys, kuris žemina žmogaus orumą arba kuria bauginančią, priešišką ar įžeidžiančią aplinką. Netinkamas elgesys gali būti žodinis, fizinis ar vykstantis elektroninėmis priemonėmis. Vien tai, kad įvykis nutiko vieną kartą, savaime nereiškia, jog jį galima ignoruoti.',
        ],
        bullets: [
          'Dalykinė pastaba apie konkretų darbo rezultatą nėra tas pats, kas asmens žeminimas.',
          'Vertinkite elgesio turinį, pasikartojimą, poveikį ir aplinkybes.',
          'Jei abejojate, pasitarkite su įmonėje atsakingu asmeniu.',
        ],
        takeaway: 'Nenuvertinkite patirto elgesio – apie rūpestį galima pranešti ir paprašyti įvertinti situaciją.',
      },
      {
        title: '2. Lygybė ir pagarbus bendravimas',
        paragraphs: [
          'Diskriminacija – nepalankus ar nevienodas elgesys, susijęs su teisės aktuose saugomu asmens požymiu, pavyzdžiui, lytimi, amžiumi, negalia, kilme, tautybe, kalba, įsitikinimais ar kitais pagrindais. Tikslūs teisiniai pagrindai ir išimtys nustatomi teisės aktuose.',
          'Užduotys, darbo vertinimas ir atlygis turi būti grindžiami objektyviais, su darbu susijusiais kriterijais. Vienodos ir pagrįstos darbo saugos taisyklės taikomos visiems. Tačiau diskriminacijos ar priekabiavimo negalima atmesti vien todėl, kad elgesys pavadintas juoku, pastaba ar vadovavimu – svarbu vertinti aplinkybes ir poveikį.',
        ],
        bullets: [
          'Kritiką išsakykite pagarbiai, konkrečiai ir apie darbą, ne apie asmens vertę.',
          'Neskleiskite įžeidžiančių komentarų, vaizdų ar žinučių apie kolegas.',
          'Pastebėję neteisingą ar žeminantį elgesį, neplatinkite jo toliau ir ieškokite pagalbos.',
        ],
        takeaway: 'Pagarbus bendravimas ir vienodi, su darbu susiję kriterijai padeda kurti saugią aplinką.',
      },
      {
        title: '3. Pranešimas, pagalba ir tyrimas',
        paragraphs: [
          'Patyrę ar pastebėję smurtą, priekabiavimą ar diskriminaciją, užsirašykite datą, vietą, kas įvyko, kas dalyvavo ir kas galėjo matyti. Išsaugokite susijusias žinutes ar laiškus. Rinkite ir dalykitės duomenimis atsakingai, nepažeisdami kitų asmenų privatumo ar įmonės tvarkos.',
          'Kreipkitės į įmonėje nurodytą atsakingą asmenį, tiesioginį vadovą arba naudokite nustatytą pranešimo kanalą. Jei vadovas susijęs su situacija, rinkitės kitą įmonės tvarkoje numatytą kanalą. Pranešimas turi būti nagrinėjamas konfidencialiai ir nešališkai, o su juo susiję asmenys neturi patirti keršto už sąžiningą kreipimąsi.',
        ],
        bullets: [
          'Esant tiesioginiam fiziniam pavojui, pirmiausia pasitraukite į saugią vietą ir kvieskite 112.',
          'Pateikite turimą informaciją ir liudininkų duomenis; galutinį aplinkybių vertinimą atlieka tyrimą vykdantys asmenys.',
          'Sužinokite, kur įmonėje galima gauti pagalbą ir kokia yra pranešimo nagrinėjimo tvarka.',
        ],
        takeaway: 'Praneškite saugiu kanalu kuo anksčiau – nereikia pačiam atlikti tyrimo ar įrodyti visų aplinkybių.',
      },
    ],
  },
];

export default function TrainingMaterials({ reviewedLessonIds = [], assignedTestIds = [], onMarkReviewed, onStartTest }) {
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId);
  const reviewedIds = new Set(reviewedLessonIds);

  const openLesson = (lesson) => {
    setSelectedLessonId(lesson.id);
    setPageIndex(0);
  };

  if (selectedLesson) {
    const page = selectedLesson.pages[pageIndex];
    const isReviewed = reviewedIds.has(selectedLesson.id);
    const hasAssignedTest = assignedTestIds.includes(selectedLesson.id);
    return (
      <section className="mx-auto max-w-4xl space-y-5">
        <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline" onClick={() => setSelectedLessonId('')}>
          <ArrowLeft size={16} />Visos temos
        </button>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-800">{selectedLesson.category}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedLesson.title}</h2>
            </div>
            {isReviewed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><CircleCheck size={15} />Peržiūrėta</span>}
          </div>
          <div className="mt-6 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Puslapis {pageIndex + 1} iš {selectedLesson.pages.length}</span>
            <span>{Math.round(((pageIndex + 1) / selectedLesson.pages.length) * 100)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Mokomosios medžiagos eiga" aria-valuemin={1} aria-valuemax={selectedLesson.pages.length} aria-valuenow={pageIndex + 1}>
            <div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${((pageIndex + 1) / selectedLesson.pages.length) * 100}%` }} />
          </div>
          <article className="min-h-[360px] py-7">
            <h3 className="text-lg font-bold text-slate-900">{page.title}</h3>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              {page.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <ul className="mt-5 space-y-2 text-sm leading-6 text-slate-700">
              {page.bullets.map((bullet) => <li className="flex gap-2" key={bullet}><Check size={16} className="mt-1 shrink-0 text-emerald-700" /><span>{bullet}</span></li>)}
            </ul>
            <p className="mt-6 rounded-lg border-l-4 border-emerald-700 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-950">{page.takeaway}</p>
          </article>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={pageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))}>
              <ArrowLeft size={15} />Ankstesnis
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {pageIndex === selectedLesson.pages.length - 1 && !isReviewed && <button type="button" className="inline-flex items-center gap-2 rounded-md border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50" onClick={() => onMarkReviewed(selectedLesson.id)}>
                <Check size={15} />Pažymėti kaip peržiūrėtą
              </button>}
              {hasAssignedTest && <button type="button" className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => onStartTest(selectedLesson.id)}>
                <GraduationCap size={16} />Spręsti testą
              </button>}
              {pageIndex < selectedLesson.pages.length - 1 && <button type="button" className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => setPageIndex((current) => Math.min(selectedLesson.pages.length - 1, current + 1))}>
                Kitas puslapis<ArrowRight size={15} />
              </button>}
            </div>
          </div>
          {!hasAssignedTest && <p className="mt-3 text-xs text-slate-500">Šios temos testas dar nepriskirtas. Peržiūrėti medžiagą galite ir savarankiškai.</p>}
        </div>
        <p className="text-xs leading-5 text-slate-500">Mokomoji medžiaga padeda pasiruošti, bet nepakeičia darbo vietos instrukcijų, saugos duomenų lapų ar įmonės nustatytos tvarkos.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <GraduationCap size={21} className="text-emerald-800" />
          <h2 className="text-xl font-bold text-slate-900">Mokomoji medžiaga</h2>
        </div>
        <p className="mt-1 text-sm text-slate-600">Pasirinkite temą ir peržiūrėkite trumpą trijų puslapių medžiagą. Testą galite spręsti ir jos neperskaitę.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {lessons.map((lesson) => {
          const isReviewed = reviewedIds.has(lesson.id);
          const hasAssignedTest = assignedTestIds.includes(lesson.id);
          return (
            <article key={lesson.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><BookOpen size={20} /></span>
                {isReviewed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><CircleCheck size={14} />Peržiūrėta</span>}
              </div>
              <p className="mt-4 text-xs font-semibold text-emerald-800">{lesson.category}</p>
              <h3 className="mt-1 flex-1 text-base font-bold leading-6 text-slate-900">{lesson.title}</h3>
              <p className="mt-2 text-xs text-slate-500">3 puslapiai · pasiruošimas testui</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => openLesson(lesson)}>
                  <BookOpen size={15} />Skaityti
                </button>
                {hasAssignedTest
                  ? <button type="button" className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => onStartTest(lesson.id)}>
                    <GraduationCap size={15} />Testas
                  </button>
                  : <span className="self-center text-xs text-slate-500">Testas nepriskirtas</span>}
              </div>
            </article>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-slate-500">Perskaitymo žymėjimas nėra privalomas, o testas lieka pasiekiamas iš užduočių ir čia, jei jis jums priskirtas. Esant tiesioginiam pavojui, pirmiausia vadovaukitės darbo vietos avarine tvarka.</p>
    </section>
  );
}
