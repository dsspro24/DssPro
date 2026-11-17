update public.creator_workspace_data as workspace
set data = jsonb_set(
  coalesce(workspace.data, '{}'::jsonb),
  '{resources}',
  (
    select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
    from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb))
      with ordinality as item(value, ordinality)
    where coalesce(item.value ->> 'id', '') not in (
      'res-computer-ergonomics-test',
      'res-computer-ergonomics-journal',
      'res-protocol-computer-ergonomics'
    )
  ) || jsonb_build_array(
    jsonb_build_object(
      'id', 'res-computer-ergonomics-test',
      'title', 'Darbo kompiuteriu (ergonomikos ir VDU) žinių patikrinimo testas',
      'type', 'Testas',
      'category', 'Ergonomika ir VDU',
      'image', '/courses/computer-ergonomics.svg',
      'duration', '10 klausimų',
      'html', $test_html$<!doctype html>
<html lang="lt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Darbo kompiuteriu (ergonomikos ir VDU) žinių patikrinimo testas</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; color: #1e293b; background: #f8fafc; font: 11px/1.45 Inter, system-ui, sans-serif; }
    @page { size: A4 portrait; margin: 15mm; }
    .document-page { max-width: 800px; margin: 0 auto 30px; padding: 35px 40px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
    .doc-header { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e2e8f0; text-align: center; }
    .company-name { color: #0f172a; font-size: 14px; font-weight: 700; text-transform: uppercase; }
    .doc-title { margin-top: 8px; color: #2563eb; font-size: 16px; font-weight: 800; text-transform: uppercase; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 20px; padding: 14px 18px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    .meta-label { color: #64748b; font-size: 9.5px; font-weight: 600; text-transform: uppercase; }
    .meta-value { min-height: 22px; padding: 4px 0 2px; border-bottom: 1px dashed #94a3b8; color: #0f172a; font-size: 11px; font-weight: 600; }
    .instructions { margin-bottom: 20px; padding: 10px 14px; border-left: 3px solid #2563eb; border-radius: 0 6px 6px 0; background: #eff6ff; color: #1e3a8a; font-size: 10.5px; }
    .question { margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9; break-inside: avoid; }
    .question-title { margin-bottom: 6px; color: #0f172a; font-size: 11px; font-weight: 700; }
    .options { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .options li { display: flex; gap: 8px; color: #334155; font-size: 10.5px; }
    .box { width: 13px; height: 13px; flex: 0 0 13px; margin-top: 1px; border: 1.5px solid #64748b; border-radius: 3px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 25px; padding-top: 15px; border-top: 2px solid #e2e8f0; break-inside: avoid; }
    .sign-line { height: 24px; border-bottom: 1px solid #475569; }
    .sign-caption { margin-top: 6px; color: #64748b; font-size: 9.5px; text-align: center; }
    @media print { body { padding: 0; background: none; } .document-page { max-width: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; } }
  </style>
</head>
<body>
  <main class="document-page">
    <header class="doc-header">
      <div class="company-name">{{ COMPANY_NAME }} (įm. kodas: {{ COMPANY_CODE }})</div>
      <div class="doc-title">Darbo kompiuteriu (ergonomikos ir VDU) žinių patikrinimo testas</div>
    </header>
    <section class="meta-grid">
      <div><div class="meta-label">Darbuotojo vardas, pavardė</div><div class="meta-value">{{ EMPLOYEE_NAME }}</div></div>
      <div><div class="meta-label">Pareigos / padalinys</div><div class="meta-value">{{ EMPLOYEE_POSITION }}</div></div>
      <div><div class="meta-label">Testo atlikimo data</div><div class="meta-value">{{ TEST_DATE }}</div></div>
      <div><div class="meta-label">Surinkti balai / įvertinimas</div><div class="meta-value">{{ SCORE }} / 10 (išlaikyta / neišlaikyta)</div></div>
    </section>
    <p class="instructions"><strong>Instrukcija:</strong> Pažymėkite po vieną teisingą atsakymo variantą. Testas išlaikomas teisingai atsakius į ne mažiau kaip 8 iš 10 klausimų (80 %).</p>
    <section class="question"><div class="question-title">1. Koks turi būti atstumas nuo darbuotojo akių iki kompiuterio ekrano (vaizduoklio)?</div><ul class="options"><li><span class="box"></span>a) Apie 20–30 cm (labai arti, kad mažiau vargtų akys).</li><li><span class="box"></span>b) Apie 50–70 cm (priklausomai nuo ekrano dydžio).</li><li><span class="box"></span>c) Atstumas neturi jokios reikšmės.</li></ul></section>
    <section class="question"><div class="question-title">2. Kaip turėtų būti nustatytas kompiuterio ekrano viršutinis kraštas akių lygio atžvilgiu?</div><ul class="options"><li><span class="box"></span>a) Ekrano viršutinis kraštas turi būti ties akių lygiu arba šiek tiek žemiau (žiūrint į ekraną šiek tiek žemyn).</li><li><span class="box"></span>b) Ekrano apačia turi būti aukščiau akių lygio.</li><li><span class="box"></span>c) Ekrano padėtis priklauso tik nuo stalo aukščio.</li></ul></section>
    <section class="question"><div class="question-title">3. Kokia turi būti taisyklinga sėdėsena dirbant su kompiuteriu biure?</div><ul class="options"><li><span class="box"></span>a) Kojos sulenktos per kelio sąnarį 90 laipsnių kampu, pėdos tvirtai remiasi į grindis (arba į kojų atramą), nugara atremta į kėdės atlošą.</li><li><span class="box"></span>b) Kojos užmestos viena ant kitos, nugara palinkusi į priekį.</li><li><span class="box"></span>c) Pusiau gulomis kėdėje, kad ilsėtųsi stuburas.</li></ul></section>
    <section class="question"><div class="question-title">4. Ką rekomenduoja darbuotojų saugos ir sveikatos taisyklės dirbantiems ilgas valandas prie kompiuterio (VDU)?</div><ul class="options"><li><span class="box"></span>a) Dirbti neatsitraukiant visą darbo dieną, kad greičiau baigtumėte darbus.</li><li><span class="box"></span>b) Daryti trumpas pertraukėles (pvz., 5–10 min. kas valandą) arba keisti veiklos pobūdį, mankštinti akis ir kūną.</li><li><span class="box"></span>c) Pertraukėles daryti tik kas 4 valandas.</li></ul></section>
    <section class="question"><div class="question-title">5. Kaip turėtų būti nukreiptas langas darbo vietos ir kompiuterio ekrano atžvilgiu, kad būtų išvengta atspindžių ir akių nuovargio?</div><ul class="options"><li><span class="box"></span>a) Ekranas turi būti tiesiogiai atsuktas į langą, o darbuotojas sėdi nugara į langą.</li><li><span class="box"></span>b) Langas turi būti šone (iš kairės arba dešinės pusės) darbo vietos atžvilgiu.</li><li><span class="box"></span>c) Šviesos šaltinio padėtis neturi jokios įtakos ekrano matomumui.</li></ul></section>
    <section class="question"><div class="question-title">6. Koks turi būti klaviatūros ir pelės naudojimo aukštis bei rankų padėtis?</div><ul class="options"><li><span class="box"></span>a) Rankos per alkūnės sąnarį turi būti sulenktos maždaug 90 laipsnių kampu, riešai tiesūs, neįtempti (patartina naudoti riešo atramas).</li><li><span class="box"></span>b) Rankos turi būti visiškai ištiestos į priekį, o riešai stipriai užversti.</li><li><span class="box"></span>c) Klaviatūra turi stovėti ant labai aukšto stalo, kad pečiai būtų pakelti prie ausų.</li></ul></section>
    <section class="question"><div class="question-title">7. Ar darbdavys privalo užtikrinti darbuotojui, dirbančiam su kompiuteriu, periodinį sveikatos patikrinimą (ypač regos)?</div><ul class="options"><li><span class="box"></span>a) Ne, tai yra tik paties darbuotojo asmeninis reikalas.</li><li><span class="box"></span>b) Taip, pagal nustatytą tvarką darbuotojams, dirbantiems su VDU, organizuojami sveikatos patikrinimai (įskaitant regos tikrinimą).</li><li><span class="box"></span>c) Tik tuo atveju, jei darbuotojas pats susimoka už gydytojo vizitą.</li></ul></section>
    <section class="question"><div class="question-title">8. Ką daryti pajutus akių perštėjimą, sausumą ar nuovargį ilgai žiūrint į monitorių?</div><ul class="options"><li><span class="box"></span>a) Pavalyti akis rankomis ir tęsti darbą didesniu greičiu.</li><li><span class="box"></span>b) Atitraukti žvilgsnį nuo ekrano, pažiūrėti į tolimą objektą, dažniau mirksėti, atlikti akių mankštą.</li><li><span class="box"></span>c) Išjungti šviesas visame biure.</li></ul></section>
    <section class="question"><div class="question-title">9. Kokie reikalavimai keliami kompiuterio stalui ir kėdei ergonomikos požiūriu?</div><ul class="options"><li><span class="box"></span>a) Kėdė turi būti stabili, reguliuojamo aukščio ir su atlošu, o stalas – pakankamai didelis, kad patogiai išsidėstytų ekranas, klaviatūra ir dokumentai.</li><li><span class="box"></span>b) Tinka bet kokia sena kėdė be atlošo ir nedidelis staliukas.</li><li><span class="box"></span>c) Svarbu tik dizainas ir spalva, o reguliavimo funkcijos nereikalingos.</li></ul></section>
    <section class="question"><div class="question-title">10. Kas atsakingas už saugios ir ergonomiškos darbo vietos su kompiuteriu įrengimą įmonėje?</div><ul class="options"><li><span class="box"></span>a) Darbdavys privalo užtikrinti tinkamas darbo sąlygas, o darbuotojas – teisingai jomis naudotis ir laikytis ergonomikos taisyklių.</li><li><span class="box"></span>b) Tik pats darbuotojas, perkantis savo asmeninius baldus biurui.</li><li><span class="box"></span>c) Valstybinė darbo inspekcija.</li></ul></section>
    <section class="signatures"><div><div class="sign-line"></div><div class="sign-caption">Darbuotojo parašas, vardas, pavardė</div></div><div><div class="sign-line"></div><div class="sign-caption">Patikrinusio atsakingo asmens parašas, pareigos, vardas, pavardė</div></div></section>
  </main>
</body>
</html>$test_html$,
      'signatures', true,
      'validityMonths', 12,
      'questions', $questions$[
        {"prompt":"Koks turi būti atstumas nuo darbuotojo akių iki kompiuterio ekrano (vaizduoklio)?","options":["Apie 20–30 cm (labai arti, kad mažiau vargtų akys).","Apie 50–70 cm (priklausomai nuo ekrano dydžio).","Atstumas neturi jokios reikšmės."],"correctIndex":1},
        {"prompt":"Kaip turėtų būti nustatytas kompiuterio ekrano viršutinis kraštas akių lygio atžvilgiu?","options":["Ekrano viršutinis kraštas turi būti ties akių lygiu arba šiek tiek žemiau (žiūrint į ekraną šiek tiek žemyn).","Ekrano apačia turi būti aukščiau akių lygio.","Ekrano padėtis priklauso tik nuo stalo aukščio."],"correctIndex":0},
        {"prompt":"Kokia turi būti taisyklinga sėdėsena dirbant su kompiuteriu biure?","options":["Kojos sulenktos per kelio sąnarį 90 laipsnių kampu, pėdos tvirtai remiasi į grindis (arba į kojų atramą), nugara atremta į kėdės atlošą.","Kojos užmestos viena ant kitos, nugara palinkusi į priekį.","Pusiau gulomis kėdėje, kad ilsėtųsi stuburas."],"correctIndex":0},
        {"prompt":"Ką rekomenduoja darbuotojų saugos ir sveikatos taisyklės dirbantiems ilgas valandas prie kompiuterio (VDU)?","options":["Dirbti neatsitraukiant visą darbo dieną, kad greičiau baigtumėte darbus.","Daryti trumpas pertraukėles (pvz., 5–10 min. kas valandą) arba keisti veiklos pobūdį, mankštinti akis ir kūną.","Pertraukėles daryti tik kas 4 valandas."],"correctIndex":1},
        {"prompt":"Kaip turėtų būti nukreiptas langas darbo vietos ir kompiuterio ekrano atžvilgiu, kad būtų išvengta atspindžių ir akių nuovargio?","options":["Ekranas turi būti tiesiogiai atsuktas į langą, o darbuotojas sėdi nugara į langą.","Langas turi būti šone (iš kairės arba dešinės pusės) darbo vietos atžvilgiu.","Šviesos šaltinio padėtis neturi jokios įtakos ekrano matomumui."],"correctIndex":1},
        {"prompt":"Koks turi būti klaviatūros ir pelės naudojimo aukštis bei rankų padėtis?","options":["Rankos per alkūnės sąnarį turi būti sulenktos maždaug 90 laipsnių kampu, riešai tiesūs, neįtempti (patartina naudoti riešo atramas).","Rankos turi būti visiškai ištiestos į priekį, o riešai stipriai užversti.","Klaviatūra turi stovėti ant labai aukšto stalo, kad pečiai būtų pakelti prie ausų."],"correctIndex":0},
        {"prompt":"Ar darbdavys privalo užtikrinti darbuotojui, dirbančiam su kompiuteriu, periodinį sveikatos patikrinimą (ypač regos)?","options":["Ne, tai yra tik paties darbuotojo asmeninis reikalas.","Taip, pagal nustatytą tvarką darbuotojams, dirbantiems su VDU, organizuojami sveikatos patikrinimai (įskaitant regos tikrinimą).","Tik tuo atveju, jei darbuotojas pats susimoka už gydytojo vizitą."],"correctIndex":1},
        {"prompt":"Ką daryti pajutus akių perštėjimą, sausumą ar nuovargį ilgai žiūrint į monitorių?","options":["Pavalyti akis rankomis ir tęsti darbą didesniu greičiu.","Atitraukti žvilgsnį nuo ekrano, pažiūrėti į tolimą objektą, dažniau mirksėti, atlikti akių mankštą.","Išjungti šviesas visame biure."],"correctIndex":1},
        {"prompt":"Kokie reikalavimai keliami kompiuterio stalui ir kėdei ergonomikos požiūriu?","options":["Kėdė turi būti stabili, reguliuojamo aukščio ir su atlošu, o stalas – pakankamai didelis, kad patogiai išsidėstytų ekranas, klaviatūra ir dokumentai.","Tinka bet kokia sena kėdė be atlošo ir nedidelis staliukas.","Svarbu tik dizainas ir spalva, o reguliavimo funkcijos nereikalingos."],"correctIndex":0},
        {"prompt":"Kas atsakingas už saugios ir ergonomiškos darbo vietos su kompiuteriu įrengimą įmonėje?","options":["Darbdavys privalo užtikrinti tinkamas darbo sąlygas, o darbuotojas – teisingai jomis naudotis ir laikytis ergonomikos taisyklių.","Tik pats darbuotojas, perkantis savo asmeninius baldus biurui.","Valstybinė darbo inspekcija."],"correctIndex":0}
      ]$questions$::jsonb,
      'isProtocolTemplate', false
    ) || coalesce((
      select item.value from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = 'res-computer-ergonomics-test'
      limit 1
    ), '{}'::jsonb) || jsonb_build_object(
      'id', 'res-computer-ergonomics-test',
      'title', 'Darbo kompiuteriu (ergonomikos ir VDU) žinių patikrinimo testas',
      'type', 'Testas',
      'category', 'Ergonomika ir VDU'
    ),
    jsonb_build_object(
      'id', 'res-computer-ergonomics-journal',
      'title', 'Darbo kompiuteriu (su vaizduokliais) ir ergonomikos mokymų bei instruktavimų registravimo žurnalas',
      'type', 'Žurnalas',
      'category', 'Ergonomika ir VDU',
      'image', '/courses/computer-ergonomics.svg',
      'duration', '15 įrašų',
      'html', $journal_html$<!doctype html>
<html lang="lt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Darbo kompiuteriu ir ergonomikos mokymų registravimo žurnalas</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; color: #1e293b; background: #f8fafc; font: 11px/1.4 Inter, system-ui, sans-serif; }
    @page portrait-page { size: A4 portrait; margin: 15mm; }
    @page landscape-page { size: A4 landscape; margin: 12mm; }
    .cover-page { page: portrait-page; display: flex; min-height: 1050px; max-width: 800px; margin: 0 auto 30px; padding: 40px; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; text-align: center; }
    .cover-field { width: 80%; margin-bottom: 35px; }
    .cover-value { min-height: 32px; padding-bottom: 6px; border-bottom: 2px solid #cbd5e1; color: #0f172a; font-size: 18px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
    .cover-label { margin-top: 6px; color: #64748b; font-size: 11px; font-style: italic; }
    .cover-title-group { margin: 60px 0 40px; }
    .cover-main-title { max-width: 90%; margin: 0 auto; color: #0f172a; font-size: 18px; font-weight: 700; letter-spacing: .8px; line-height: 1.5; text-transform: uppercase; }
    .cover-subtitle { margin-top: 35px; color: #2563eb; font-size: 26px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; }
    .journal-page { page: landscape-page; display: flex; min-height: 750px; max-width: 1120px; margin: 0 auto 30px; padding: 25px 30px; flex-direction: column; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
    .journal-header { margin-bottom: 15px; text-align: center; }
    .company-name { color: #0f172a; font-size: 14px; font-weight: 700; text-transform: uppercase; }
    .company-code, .doc-number { margin-top: 3px; color: #475569; font-size: 9px; }
    .doc-name { margin-top: 5px; color: #334155; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .journal-table { width: 100%; margin-top: 8px; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
    .journal-table th, .journal-table td { overflow-wrap: anywhere; border: 1px solid #cbd5e1; padding: 5px 4px; text-align: center; vertical-align: middle; }
    .journal-table th { background: #f1f5f9; color: #0f172a; font-weight: 600; line-height: 1.25; }
    .journal-table tbody tr:nth-child(even) { background: #f8fafc; }
    .journal-table tbody tr { height: 30px; }
    .col-number { width: 5%; }
    .col-date { width: 9%; }
    .col-name { width: 16%; }
    .col-position { width: 14%; }
    .col-topic { width: 17%; }
    .col-instructor { width: 18%; }
    .col-signature { width: 10.5%; }
    .th-num { background: #e2e8f0; }
    @media print {
      body { padding: 0; background: none; }
      .cover-page, .journal-page { max-width: 100%; margin: 0; border: 0; border-radius: 0; box-shadow: none; }
      .cover-page { min-height: 255mm; padding: 0; break-after: page; page-break-after: always; }
      .journal-page { min-height: 0; padding: 0; break-after: avoid; page-break-after: avoid; }
      .journal-table thead { display: table-header-group; }
      .journal-table tr { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <section class="cover-page">
    <div class="cover-field"><div class="cover-value">{{ COMPANY_NAME }}</div><div class="cover-label">(įmonės pavadinimas)</div></div>
    <div class="cover-field"><div class="cover-value">{{ COMPANY_CODE }}</div><div class="cover-label">(įmonės kodas)</div></div>
    <div class="cover-title-group">
      <div class="cover-main-title">{{ RESOURCE_TITLE }}</div>
      <div class="cover-subtitle">Žurnalas</div>
    </div>
  </section>
  <main class="journal-page">
    <header class="journal-header">
      <div class="company-name">{{ COMPANY_NAME }}</div>
      <div class="company-code">Įmonės kodas: {{ COMPANY_CODE }}</div>
      <div class="doc-name">{{ RESOURCE_TITLE }}</div>
      <div class="doc-number">Mokymo / instruktavimo tema: {{ INSTRUCTION_TITLE }}</div>
      <div class="doc-number">Dokumento Nr.: {{ DOCUMENT_NUMBER }}</div>
    </header>
    <table class="journal-table">
      <thead>
        <tr>
          <th class="col-number" rowspan="2">Eil.<br>Nr.</th>
          <th class="col-date" rowspan="2">Data</th>
          <th class="col-name" rowspan="2">Darbuotojo<br>vardas, pavardė</th>
          <th class="col-position" rowspan="2">Darbuotojo pareigos<br>/ darbo vieta</th>
          <th class="col-topic" rowspan="2">Mokymo / instruktavimo<br>tema (VDU ergonomika)</th>
          <th class="col-instructor" rowspan="2">Mokymą atlikusio asmens<br>pareigos, vardas, pavardė</th>
          <th colspan="2">Parašai</th>
        </tr>
        <tr>
          <th class="col-signature">Instruktavusio</th>
          <th class="col-signature">Darbuotojo</th>
        </tr>
        <tr>
          <th class="th-num">1</th><th class="th-num">2</th><th class="th-num">3</th><th class="th-num">4</th>
          <th class="th-num">5</th><th class="th-num">6</th><th class="th-num">7</th><th class="th-num">8</th>
        </tr>
      </thead>
      <tbody>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      </tbody>
    </table>
  </main>
</body>
</html>$journal_html$,
      'templateKind', 'computer-ergonomics-journal',
      'signatures', true,
      'validityMonths', 12,
      'requiredSigners', jsonb_build_array('Darbuotojas', 'DSS specialistas'),
      'defaultSettings', jsonb_build_object(
        'populateEmployees', true,
        'documentNumber', '',
        'instructionTitle', 'Darbo kompiuteriu (su vaizduokliais) ir ergonomikos mokymai bei instruktavimai',
        'instructorPosition', '',
        'instructorName', '',
        'signatureFieldRoles', jsonb_build_object(
          'instructor', 'DSS specialistas',
          'employee', 'Darbuotojas'
        )
      ),
      'isProtocolTemplate', false
    ) || coalesce((
      select item.value from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = 'res-computer-ergonomics-journal'
      limit 1
    ), '{}'::jsonb) || jsonb_build_object(
      'id', 'res-computer-ergonomics-journal',
      'title', 'Darbo kompiuteriu (su vaizduokliais) ir ergonomikos mokymų bei instruktavimų registravimo žurnalas',
      'type', 'Žurnalas',
      'category', 'Ergonomika ir VDU',
      'templateKind', 'computer-ergonomics-journal'
    ),
    jsonb_build_object(
      'id', 'res-protocol-computer-ergonomics',
      'title', 'Darbo kompiuteriu (ergonomikos ir VDU) žinių patikrinimo protokolas',
      'type', 'Protokolas',
      'category', 'Ergonomika ir VDU',
      'image', '/courses/computer-ergonomics.svg',
      'duration', 'A4 formatas',
      'templateKind', 'knowledge-assessment-protocol',
      'relatedTestId', 'res-computer-ergonomics-test',
      'signatures', true,
      'validityMonths', 12,
      'defaultForOrganizations', true,
      'requiredSigners', jsonb_build_array('Darbuotojas', 'DSS specialistas'),
      'isProtocolTemplate', true
    ) || coalesce((
      select item.value from jsonb_array_elements(coalesce(workspace.data -> 'resources', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = 'res-protocol-computer-ergonomics'
      limit 1
    ), '{}'::jsonb) || jsonb_build_object(
      'id', 'res-protocol-computer-ergonomics',
      'title', 'Darbo kompiuteriu (ergonomikos ir VDU) žinių patikrinimo protokolas',
      'type', 'Protokolas',
      'category', 'Ergonomika ir VDU',
      'templateKind', 'knowledge-assessment-protocol',
      'relatedTestId', 'res-computer-ergonomics-test',
      'defaultForOrganizations', true
    )
  ),
  true
),
updated_at = now()
where workspace.id = true;

do $$
begin
  execute 'alter table public.organization_data disable trigger guard_workspace_subscription_access';
  perform public.sync_creator_resource_defaults();
  execute 'alter table public.organization_data enable trigger guard_workspace_subscription_access';
end;
$$;
