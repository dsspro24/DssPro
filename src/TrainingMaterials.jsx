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
          'Cheminės medžiagos gali būti sprogiosios, oksiduojančios, ypač degios, labai degios, degios arba nedegios, taip pat ėsdinančios, nuodingos ar dirginančios. Rizika priklauso ne vien nuo medžiagos pavadinimo, bet ir nuo jos kiekio, koncentracijos, naudojimo būdo bei darbo aplinkos.',
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
          'Pagal šiame mokymo teste nurodytą tvarką cheminės medžiagos laikomos gerai vėdinamoje, užrakinamoje patalpoje, jų etiketės atsuktos į praėjimo pusę. Nuo šildymo įrenginių laikykite bent 1 m atstumu. Šie skaičiai nepakeičia konkretaus produkto saugos duomenų lapo ar įmonės patvirtintos laikymo schemos – jei joje nustatytas griežtesnis reikalavimas, vadovaukitės juo.',
        ],
        bullets: [
          'Nenaudokite maisto ar gėrimų taros chemikalams laikyti.',
          'Dezinfekavimo priemonių atsargas laikykite tik sandarioje, nepažeistoje taroje.',
          'Perkeldami pakuotę jos nevilkite ir nemėtykite – saugokite, kad ji neįtrūktų ir etiketė nenusitrintų.',
          'Pastebėję nesandarumą, pažeistą pakuotę ar netinkamą ženklinimą, sustabdykite darbą ir praneškite atsakingam asmeniui.',
        ],
        takeaway: 'Laikykite užrakintoje, vėdinamoje vietoje, etikete į praėjimą, bent 1 m nuo šildymo įrenginių; visada patikrinkite konkretaus produkto nurodymus.',
      },
      {
        title: '3. Išsiliejimas, kontaktas ir pagalba',
        paragraphs: [
          'Medžiagai patekus ant odos, nutraukite kontaktą, atsargiai nusivilkite užterštus drabužius ir plaukite odą vandeniu bei muilu, jei tai nurodo saugos duomenų lapas. Patekus į akis, nedelsdami pradėkite plauti švariu tekančiu vandeniu; šiame teste nurodytas maždaug 10 minučių plovimas ir kreipimasis į gydytoją. Konkretus plovimo laikas bei tolesni veiksmai priklauso nuo medžiagos, todėl vadovaukitės jos saugos duomenų lapu ir skubios pagalbos specialistų nurodymais.',
          'Prarijus medžiagos, nutraukite tolesnį jos patekimą, nesukelkite vėmimo ir skubiai kvieskite medicinos pagalbą; turėkite produkto pakuotę arba saugos duomenų lapą. Išsiliejus medžiagai perspėkite šalia esančius. Degius ar sprogius likučius pilkite tik į tam skirtas, paženklintas atliekų talpas – niekada į kanalizaciją ar gruntą. Nevalykite išsiliejimo, jei nesate apmokyti arba neturite tinkamų priemonių.',
        ],
        bullets: [
          'Su cheminėmis medžiagomis dirba tik apmokyti ir instruktuoti darbuotojai.',
          'Darbo drabužius laikykite atskirai nuo kasdienių; po darbo nusiplaukite.',
          'Valgykite, gerkite ir rūkykite tik tam specialiai įrengtose, darbo zonai skirtose vietose.',
          'Žinokite, kur yra pirmosios pagalbos priemonės ir pirminės gaisro gesinimo priemonės, bei kaip jomis naudotis.',
        ],
        takeaway: 'Oda – nuplauti; akys – iškart plauti ir kreiptis pagalbos; prarijus – nesukelti vėmimo, skubiai kviesti pagalbą.',
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
          'Šiame mokymo teste darbais aukštyje laikomi darbai nuo 1,1 m, o aukštalipių darbais – nuo 5 m. Teste taip pat tikrinama, kad dirbant 5 m aukštyje ir aukščiau reikalinga galiojanti medicininė pažyma. Šiuos mokomosios programos slenksčius būtina sieti su darbų pobūdžiu ir galiojančiais įmonės dokumentais – prieš konkretų darbą patikrinkite darbų vadovo nurodymus ir profesinės rizikos vertinimą.',
          'Kritimas iš aukščio gali sukelti sunkius sužalojimus net ir dirbant mažesniame aukštyje. Įvertinkite darbo vietą, paviršiaus būklę, oro sąlygas, darbo trukmę, įrankius ir galimybę saugiai patekti bei pasitraukti. Kur įmanoma, rinkitės kolektyvines apsaugos priemones, pavyzdžiui, aptvarus ar tinkamai įrengtą platformą, ir pažymėkite pavojingą zoną apačioje.',
        ],
        bullets: [
          'Patikrinkite, ar darbą galima atlikti nuo žemės arba saugesnės platformos.',
          'Dirbant aukštyje naudokite darbui tinkamą apsauginį šalmą; apsaugos nuo kritimo sistemą rinkitės pagal rizikos vertinimą.',
          'Numatykite, kaip bus keliami įrankiai ir medžiagos bei kaip apsaugosite kitus nuo krintančių daiktų.',
          'Atidėkite darbą, jei sąlygos nesaugios arba neaiškios.',
        ],
        takeaway: 'Mokymo teste ribos yra 1,1 m darbams aukštyje ir 5 m aukštalipių darbams bei medicininei pažymai; darbo vietoje tikrinkite galiojančius nurodymus.',
      },
      {
        title: '2. Kopėčios, pastoliai ir platformos',
        paragraphs: [
          'Prieš naudodami kopėčias, lipynes, pastolius ar paklotus, apžiūrėkite, ar jie nepažeisti, stabilūs ir tinkamai pastatyti. Dėžės ir kėdės nėra paaukštinimo priemonės. Kopėčias statykite ant tvirto pagrindo; nesiekite per toli ir nenaudokite jų užduotims, kai reikia tempti laidus, prilaikyti sunkias detales, virinti ar dirbti šalia neapsaugotų judančių mašinų dalių.',
          'Šiame teste nurodyta, kad 2 m ir didesniame aukštyje dirbant naudojamas apsauginis diržas. Naudokite tik nepažeistą diržą su atliktos patikros / bandymo žyma ir prijunkite prie numatyto tvirtinimo taško. Ant pastolių nedirbkite arti veikiančių elektros tiekimo linijų, jei nėra užtikrinta sauga.',
        ],
        bullets: [
          'Nenaudokite apgadintos, nestabilios ar nepatikrintos įrangos.',
          'Neperkraukite platformų ir neužstatykite priėjimo; krovinių padavimo angas apsaugokite iš visų keturių pusių.',
          'Pastebėję trūkumą, pažymėkite įrangą kaip netinkamą ir praneškite atsakingam asmeniui.',
        ],
        takeaway: 'Nuo 2 m naudokite patikrintą diržą pagal testo mokymo programą; niekada nekeiskite kopėčių ar pastolių savadarbėmis priemonėmis.',
      },
      {
        title: '3. Apsauga nuo kritimo ir veiksmai pavojaus atveju',
        paragraphs: [
          'Esant vėjo greičiui 12–15 m/s, taip pat smarkiai lyjant, sningant, esant plikledžiui ar blogam matomumui, darbus aukštyje nutraukite, kaip nurodyta testo medžiagoje ir darbų saugos tvarkoje. Vertinkite ne vien vėjo greitį, bet ir gūsius, darbo pobūdį, platformos gamintojo apribojimus bei vadovo nurodymus.',
          'Pastolius išmontuokite aukštais iš viršaus į apačią. Išmontuotus elementus atsargiai nuleiskite virvėmis ar kėlimo mechanizmu – nemeskite žemyn ir nepalikite darbo vietoje. Prieš darbą sutarkite, kaip bus iškviesta pagalba ir išgelbėtas kabantis darbuotojas.',
        ],
        bullets: [
          'Nenaudokite priemonių, kurių patikros būklė ar tinkamumas nežinomi.',
          'Nedirbkite vieni, jei pagal darbo pobūdį būtina užtikrinti stebėjimą ar pagalbą.',
          'Įvykus nelaimei pakeliui į darbą ar iš jo, apie ją praneškite patys arba paprašykite tai padaryti kitą asmenį.',
          'Po smūgio į galvą galvos skausmas ar vėmimas yra priežastis skubiai kreiptis medicininės pagalbos; įtariant lūžį galūnę raminkite ir nebandykite jos atstatyti.',
          'Apie incidentą ar vos neįvykusį nelaimingą atsitikimą praneškite nedelsdami.',
        ],
        takeaway: 'Kai vėjas pasiekia 12–15 m/s arba sąlygos pavojingos, darbus sustabdykite; pastolius ardykite nuo viršaus, elementus nuleiskite saugiai.',
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
          'Gaisrų klasė C reiškia dujų gaisrus. Gaisro klasė svarbi renkantis gesinimo priemonę: putų gesintuvu negalima gesinti įtampą turinčių elektros prietaisų, žmogaus veido ar šarminių metalų. Gesintuvo etiketėje visada patikrinkite, kokiems gaisrams jis tinka.',
          'Pagal šiame teste tikrinamas bendrąsias taisykles evakuacijos kelio plotis turi būti bent 1,2 m, o praėjimo aukštis – bent 2 m. Tai nėra leidimas susiaurinti konkretaus pastato kelią: jei evakuacijos plane ar pastato reikalavimuose nustatyta daugiau, vadovaukitės griežtesniu reikalavimu. Bendrosios gaisrinės saugos taisyklės taikomos pastatus ir įrenginius eksploatuojant, statant, rekonstruojant ar techniškai pertvarkant. Evakuaciniai išėjimai turi būti aiškiai pažymėti ir laisvi.',
        ],
        bullets: [
          'Žinokite artimiausią evakuacijos išėjimą ir susirinkimo vietą.',
          'Susipažinkite su gaisro pavojaus signalu ir įmonės perspėjimo tvarka.',
          'Laidai ir kabeliai su pažeista izoliacija nenaudojami; šildymui rinkitės tik leidžiamus, uždaro tipo pramoninius prietaisus.',
          'Tarp elektros šviestuvų ir sandėliuojamų degių medžiagų palikite bent 0,5 m; lengvuosius automobilius aikštelėje statykite palikdami bent 0,6 m tarpą.',
        ],
        takeaway: 'Žinokite gaisro klasę ir gesintuvo paskirtį; evakuacijos praėjimuose turi likti bent 1,2 m pločio ir 2 m aukščio laisvas kelias.',
      },
      {
        title: '2. Ką daryti pastebėjus gaisrą',
        paragraphs: [
          'Pastebėję gaisrą ar dūmus, perspėkite aplinkinius, aktyvuokite signalą ir skambinkite 112. Pagal šiame teste mokomą seką pirmiausia kviečiami ugniagesiai, tuomet evakuojami žmonės, o gesinti bandoma tik jei tai saugu. Jei kyla tiesioginis pavojus, nedelskite evakuacijos – laikykitės vietos plano ir skubiosios pagalbos operatoriaus nurodymų.',
          'Evakuacinių durų atidarymo kryptis ir išimtys priklauso nuo patalpos bei žmonių skaičiaus. Teste minima išimtis patalpoms, kuriose nuolat būna ne daugiau kaip 15 žmonių; konkrečiame pastate vadovaukitės patvirtintu evakuacijos planu. Visuomeninės paskirties pastate, kai aukštų daugiau kaip du, teste nurodyta ne mažiau kaip du evakuaciniai išėjimai; išėjimų skaičius ir išdėstymas vis tiek turi atitikti konkrečiam pastatui taikomus reikalavimus. Degių medžiagų ant rampų nepalikite ne darbo metu.',
          'Krypties ir informacijos ženklai turi būti gerai matomi iš bet kurios patalpos vietos. Masinio žmonių buvimo patalpa teste apibrėžta kaip patalpa, kurioje vienu metu gali būti daugiau kaip 50 žmonių. Žinokite, ar jūsų darbo vieta tokia yra, nes žmonių skaičius svarbus planuojant evakuaciją.',
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
          'Šiuolaikiniuose gesintuvuose naudojamos putos, dujos arba milteliai – priemonę rinkite pagal gaisro klasę ir įrenginio ženklinimą. Pirminėms gaisro gesinimo priemonėms taip pat priskiriami gesintuvai, smėlis ir nedegus audeklas. Jomis naudokitės tik apmokyti ir tik tada, kai gaisras nedidelis, turite laisvą pasitraukimo kelią ir gesinimas nekelia pavojaus.',
          'Teste minimas bent 0,6 m tarpas tarp aikštelėje statomų lengvųjų automobilių. Ant rampų degių medžiagų nepalikite ne darbo metu, neužstatykite privažiavimo ugniagesiams. Gaisro ir sprogimo pavojingumo kategorijos pagal testą žymimos Asg, Bsg, Cg, Dg ir Eg; konkrečios darbo vietos kategoriją nustato atsakingi asmenys, o darbuotojas privalo žinoti jam taikomus apribojimus.',
        ],
        bullets: [
          'Gesinimas neturi trukdyti evakuacijai ir pagalbos iškvietimui.',
          'Dūmai yra pavojingi – neikite į uždūmintą patalpą gelbėti turto.',
          'Sunkiai degios medžiagos, veikiamos uždegimo šaltinio, gali degti, smilkti ar anglėti, bet pašalinus šaltinį šie procesai savaime nutrūksta.',
          'Po įvykio informuokite atsakingą asmenį net ir tada, kai gaisras užgesintas.',
        ],
        takeaway: 'Skambinkite 112, saugiai organizuokite evakuaciją ir gesinkite tik turėdami tinkamą priemonę bei saugų pasitraukimo kelią.',
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
          'Kasimo darbams prieš pradžią būtinas išduotas leidimas, o darbo vietą turi patikrinti atsakingas darbų vadovas. Patikrinkite brėžinius ir požeminių kabelių bei vamzdynų vietas. Sušalusį gruntą virš kabelio atkaskite tik rankiniu kastuvu; nenaudokite laužtuvo ir nešildykite atvira liepsna. Radę schemoje nepažymėtą kabelį ar vamzdį, nedelsdami nutraukite darbus, nieko nejudinkite ir kvieskite darbų vadovą.',
          'Pagal tvirtinimo būdą tranšėjos būna ramstomos ir neramstomos. Šiame teste nurodyta, kad atraminės konstrukcijos būtinos gilesnėse nei 1,25 m iškasose. Tai nėra pagrindas savarankiškai spręsti, kad seklesnė iškasa saugi: grunto tipas, vanduo, vibracija, šlaitai ir kitos aplinkybės gali reikalauti papildomo tvirtinimo. Vadovaukitės projektu, leidimu ir darbų vadovo nurodymais.',
        ],
        bullets: [
          'Patikrinkite darbo vietos aptvėrimą, ženklus ir saugų priėjimą.',
          'Radę sprogmenį primenantį daiktą jo nelieskite, pasitraukite ir skambinkite 112; informuokite vadovą bei policiją.',
          'Nepradėkite kasimo, kol nėra leidimo ir atsakingo asmens patikros.',
        ],
        takeaway: 'Kasimui būtinas leidimas; 1,25 m gilesnėse iškasose numatykite atramines konstrukcijas, o aptikę nežinomą kabelį – nedelsdami sustokite.',
      },
      {
        title: '2. Apsauga nuo grunto griūties',
        paragraphs: [
          'Pagal testą iškastą gruntą nuo iškasos briaunos kraukite ne arčiau kaip 1,5 m. Taip sumažinama papildoma apkrova prie krašto ir rizika, kad gruntas nuslinks atgal į iškasą. Technikai, medžiagoms ir transportui taip pat reikia saugaus atstumo pagal darbų planą – nepriartinkite jų savarankiškai.',
          'Iškasos sienos gali griūti dėl grunto savybių, vibracijos, vandens, oro sąlygų ar apkrovos prie krašto. Apsaugos būdą – šlaitavimą, tvirtinimą ar kitą sprendimą – nustato atsakingi specialistai pagal konkrečias sąlygas. Naudokite tik numatytus saugius įėjimo ir išėjimo būdus. Jei šlaitas pradeda slinkti, nedelsdami perspėkite kitus ir pasitraukite iš iškasos; tik saugioje vietoje kvieskite darbų vadovą. Negrįžkite tvirtinti šlaito, kol neįvertintas pavojus.',
        ],
        bullets: [
          'Nekeiskite tvirtinimo konstrukcijų ir nešalinkite jų be leidimo.',
          'Neikite po pakabintu kroviniu ir nestovėkite ekskavatoriaus veikimo zonoje.',
          'Laikykite iškastą gruntą bent 1,5 m nuo briaunos ir stebėkite, ar neatsiranda įtrūkimų ar grunto slinkimo.',
        ],
        takeaway: 'Gruntą kraukite bent 1,5 m nuo krašto; pastebėję slinkimą, iškart išeikite ir perspėkite kitus.',
      },
      {
        title: '3. Patikra, ryšys ir avariniai veiksmai',
        paragraphs: [
          'Gilioje iškasoje darbuotojai neturi dirbti be numatyto ryšio ir stebėjimo. Dirbant dviese, vienas gali iškviesti pagalbą ir padėti organizuoti gelbėjimą, jei kitas susižalotų; tai nereiškia, kad reikia lįsti į griūvančią iškasą. Darbo vietą atsakingas vadovas tikrina prieš kasimą ir pasikeitus sąlygoms.',
          'Rankos sužalojimo atveju, jei kraujuoja, uždėkite spaudžiamąjį tvarstį ir praneškite vadovui; esant stipriam kraujavimui ar rimtam sužalojimui kvieskite 112. Kilus kibirkščiavimui ar ugniai šalia iškasos, perspėkite kitus, skambinkite 112, o gesintuvą naudokite tik jei tai saugu ir turite tinkamą gesintuvą. Pajutę grunto judėjimą ar pastebėję konstrukcijos gedimą, pasitraukite numatytu keliu ir negrįžkite, kol vieta nepatikrinta.',
        ],
        bullets: [
          'Negrįžkite į pavojingą zoną, kol jos saugumas nepatvirtintas.',
          'Apie incidentą ir vos neįvykusią griūtį praneškite atsakingam vadovui.',
          'Esant pavojui ar sprogmeniui kvieskite 112 ir policiją; nespręskite grėsmės savarankiškai.',
        ],
        takeaway: 'Patikra – darbų vadovo atsakomybė; dirbant gilioje iškasoje antras žmogus padeda iškviesti pagalbą, bet neina į griūties zoną.',
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
          'Šiame teste krovinių kėlimo rankomis riba pateikiama kaip 5–25 kg. Tai mokymo testo diapazonas, o ne garantija, kad kiekvienas darbuotojas gali saugiai kelti 25 kg: saugi apkrova priklauso nuo darbuotojo, krovinio, padėties, dažnio ir rizikos vertinimo. Prieš keldami įvertinkite svorį, dydį, formą, stabilumą, suėmimo vietas ir savo galimybes. Darbuotojas turi gauti tikslią informaciją apie krovinio svorį ir turinį.',
          'Jei krovinys sunkesnis kaip 25 kg ir jį reikia kelti aukščiau kaip 3 m, pagal testo medžiagą naudokite kėlimo mechanizmą, o ne kelkite rankomis. Darbui su mechanizmu būtinas atitinkamas pasirengimas / pažymėjimas; vien vadovo leidimo ar skubos nepakanka. Jei krovinys nepatogus arba kyla abejonių, rinkitės mechaninę pagalbą ir vadovaukitės darbo vietos rizikos vertinimu.',
        ],
        bullets: [
          'Krovinys turi būti stabilus, tinkamai įpakuotas ir parengtas kėlimui.',
          'Smulkiems kroviniams perkelti naudokite tam tinkamus kėlimo ar transportavimo mechanizmus, o ne atsitiktinius vamzdžius ar metalo gabalus.',
          'Krovinių pernešimo maršrutas turi būti gerai apšviestas, stabilus, neslidus ir neužkrautas atliekomis.',
          'Krovinius kraukite vadovo nurodytoje, iš anksto numatytoje sandėliavimo vietoje; palikite bent 0,8 m tarp krovinio ir sienos.',
        ],
        takeaway: 'Teste: 5–25 kg rankinio kėlimo diapazonas; sunkesniam nei 25 kg kroviniui, keliamam aukščiau nei 3 m, numatytas kėlimo mechanizmas; sandėlyje palikite 0,8 m nuo sienos.',
      },
      {
        title: '2. Kelkite ir nuleiskite valdydami judesį',
        paragraphs: [
          'Atsistokite stabiliai, prisiartinkite prie krovinio ir tvirtai jį suimkite. Teste saugus kėlimo būdas apibūdinamas kaip kėlimas tiesia nugara, sulenktais keliais, laikant krovinį kuo arčiau kūno ir jį nuleidžiant tolygiai. Venkite staigaus liemens sukimo su svoriu rankose.',
          'Krovinius ant pečių nešantys darbuotojai turi išlaikyti saugų atstumą vienas nuo kito ir judėti suderintai. Stumkite vežimėlį taip, kad matytumėte kelią, valdytumėte krovinį ir galėtumėte sustoti; testo medžiagoje nurodyta jį stumti iš šono arba galo, ne stovint priešais judėjimo kryptį.',
        ],
        bullets: [
          'Krovikams parūpinkite pirštines ir apsauginę avalynę pagal darbo riziką.',
          'Naudokite tik inventoriaus kopėčias su tinkamais neslystančiais antgaliais – ne dėžes, ne kėdes ir ne pažeistas kopėčias.',
          'Pastebėję skausmą, nestabilumą ar kliūtį, sustokite ir paprašykite pagalbos.',
        ],
        takeaway: 'Kelkite kontroliuojamai, tiesia nugara ir sulenktais keliais; krovinį laikykite prie kūno ir nuleiskite tolygiai.',
      },
      {
        title: '3. Perkelkite ir sandėliuokite saugiai',
        paragraphs: [
          'Judant automašinai nestovėkite jos parkavimosi zonoje ir nelipkite į ją ar iš jos. Krovinio pakrovimą ar iškrovimą derinkite su vairuotoju ir atsakingu vadovu, kad transporto priemonė būtų saugiai sustabdyta.',
          'Nesaugiai sukrautą krovinį taisykite tik sustabdę darbą ir įvertinę, kaip saugiai jį stabilizuoti; nestovėkite po nestabiliu kroviniu. Krovinius dėkite į vadovo nurodytą, iš anksto numatytą vietą. Po įvykio ar susižalojimo praneškite vadovui, net jei sužalojimas atrodo nedidelis.',
        ],
        bullets: [
          'Neikite po keliamu ar nestabiliai sukrautu kroviniu.',
          'Kėlimo mechanizmus valdykite tik turėdami reikiamą pažymėjimą ir įgaliojimą.',
          'Pakeliui į darbą ar iš jo įvykus nelaimei, apie ją praneškite patys arba paprašykite kito asmens tai padaryti.',
        ],
        takeaway: 'Saugus krovinių darbas apima tinkamą maršrutą, AAP, autorizuotą mechanizmų naudojimą ir pranešimą apie nelaimes.',
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
          'Psichologinis smurtas darbe gali būti tikslinis, sistemingas, ilgesnį laiką pasikartojantis elgesys, kuriuo darbuotojas bauginamas ar žeminamas, jo gebėjimai menkinami arba jis atskiriamas kolektyvo. Pavyzdžiai: grasinimai, šmeižtas, pasikartojantis sarkazmas, viešas žeminimas, sąmoningas ignoravimas ir izoliavimas. Vienkartinis įvykis savaime nebūtinai atitinka sistemingo mobingo apibrėžimą, tačiau tai nereiškia, kad jis priimtinas ar apie jį negalima pranešti.',
          'Priekabiavimas – nepriimtinas elgesys arba jo grėsmė, galinti sukelti fizinį, psichologinį, seksualinį ar ekonominį poveikį, sukurti įžeidžiančią aplinką ar padaryti žalą. Jis gali pasireikšti žodžiais, veiksmais, fiziniu elgesiu ar elektroninėmis žinutėmis. Vertinamas konkretus elgesys ir jo aplinkybės, o ne vien tai, ar asmuo teigia „juokavęs“.',
        ],
        bullets: [
          'Pagrįsta, dalykiška pastaba apie darbo rezultatą ir skirtinga nuomonė savaime nėra smurtas.',
          'Pagrįsti ir vienodai taikomi aprangos, AAP ar saugos taisyklių reikalavimai nėra diskriminacija vien dėl to, kad jie primenami.',
          'Informacijos ar etiketo stoka gali paaiškinti netinkamą bendravimą, bet nepadaro nuolatinio bauginimo ar žeminimo priimtinu.',
        ],
        takeaway: 'Mobingui būdingas pasikartojantis sistemingas elgesys; priekabiavimas ar kitas netinkamas elgesys vertinamas ir pagal konkretaus įvykio aplinkybes.',
      },
      {
        title: '2. Lygybė ir pagarbus bendravimas',
        paragraphs: [
          'Diskriminacija – nepalankus ar nevienodas elgesys dėl saugomo asmens požymio, pavyzdžiui, amžiaus, lyties, negalios, rasės, įsitikinimų ar pažiūrų, tautybės, pilietybės, kilmės, kalbos ar tikėjimo. Tikslūs pagrindai ir išimtys nustatomi teisės aktuose. Darbo užduotys, krūvis, atlygis ir premijos turi būti skirstomi pagal aiškius, objektyvius su darbu susijusius kriterijus, o ne asmenines savybes.',
          'Neadekvatus, nepagrįstas krūvis vienam darbuotojui arba atlygio ir priedų skirstymas ne pagal darbo rezultatus gali būti požymiai, kuriuos verta ištirti. Vien darbo rezultatų vertinimas ar pagrįsta, visiems taikoma pastaba dėl netvarkingos aprangos arba AAP nenaudojimo savaime dar neįrodo diskriminacijos. Svarbu, ar reikalavimas pagrįstas, taikomas nuosekliai ir nėra pretekstas persekioti konkretų žmogų.',
        ],
        bullets: [
          'Vadovai turėtų paaiškinti darbo krūvio, atlygio ir priedų skirstymo kriterijus.',
          'Pagrįstą pastabą pateikite konkrečiai ir pagarbiai, aptardami darbo reikalavimą, o ne menkindami asmenį.',
          'Saugos reikalavimus ir AAP naudokite pagal instrukciją – jų vienodas taikymas visiems yra svarbus.',
        ],
        takeaway: 'Pagarbus bendravimas ir vienodi, su darbu susiję kriterijai padeda kurti saugią aplinką.',
      },
      {
        title: '3. Pranešimas, pagalba ir tyrimas',
        paragraphs: [
          'Patyrę ar pastebėję smurtą, priekabiavimą ar diskriminaciją, užsirašykite datą, laiką, vietą, kas įvyko, kas dalyvavo ir kas galėjo matyti ar girdėti. Išsaugokite SMS žinutes, el. laiškus ir kitą tiesiogiai su situacija susijusią informaciją. Liudininkai taip pat gali patvirtinti, ką patys matė ar girdėjo. Nerenkite įrodymų pažeisdami įstatymus ar kitų asmenų privatumą.',
          'Praneškite įmonėje nurodytam atsakingam asmeniui arba tiesioginiam vadovui ir pateikite rašytinį pranešimą pagal įmonės tvarką. Jei vadovas susijęs su situacija, rinkitės kitą nurodytą kanalą. Pranešimą nagrinėjant būtini konfidencialumas ir nešališkumas: duomenimis dalijamasi tik tiek, kiek tyrimui reikia, ir išvados neturi remtis vien vadovo asmenine nuomone.',
        ],
        bullets: [
          'Esant tiesioginiam fiziniam pavojui, pirmiausia pasitraukite į saugią vietą ir kvieskite 112.',
          'Skundas išorės institucijai ar medicininiai dokumentai gali būti svarbūs aplinkybių kontekste, tačiau jie nebūtinai tiesiogiai parodo konkretų elgesį; tyrimą atliekantys asmenys vertina visą turimą informaciją.',
          'Įmonėje riziką mažina aiškios elgesio taisyklės, reguliarūs mokymai ir saugus, konfidencialus pranešimo kanalas.',
          'Konstruktyvus nesutarimas ar vienkartinė pagrįsta darbo pastaba nėra savaime mobingas, bet grasinimus, žeminimą ar kitą netinkamą elgesį vis tiek verta aptarti ir pranešti.',
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
      <p className="text-xs leading-5 text-slate-500">Skaitinės ribos pateiktos pagal šiuo metu sistemoje esantį testą. Prieš naudojant mokymuose, jas turi patvirtinti atsakingas DSS specialistas pagal galiojančius teisės aktus, darbo vietos rizikos vertinimą ir įmonės instrukcijas.</p>
    </section>
  );
}
