update public.creator_workspace_data
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{resources}',
  coalesce((
    select jsonb_agg(item.value)
    from jsonb_array_elements(coalesce(data -> 'resources', '[]'::jsonb)) as item(value)
    where coalesce(item.value ->> 'id', '') not in (
      'res-civil-safety-training-test',
      'res-civil-safety-training-journal',
      'res-protocol-civil-safety-training'
    )
  ), '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', 'res-civil-safety-training-test',
      'title', 'Darbuotojų civilinės saugos mokymų žinių patikrinimo testas',
      'type', 'Testas',
      'category', 'Civilinė sauga',
      'image', '/courses/safety-training.jpg',
      'duration', '10 klausimų',
      'signatures', true,
      'validityMonths', 12,
      'defaultForOrganizations', true,
      'requiredSigners', jsonb_build_array('Darbuotojas', 'DSS specialistas'),
      'questions', $questions$[
        {"prompt":"Koks yra vieningas skubios pagalbos telefono numeris Lietuvoje, kuriuo reikia skambinti įvykus ekstremaliajam įvykiui ar nelaimei?","options":["112","011","911"],"correctIndex":0},
        {"prompt":"Ką privalote padaryti pirmiausia, išgirdę kaukiančias perspėjimo sirenas (signalą „Dėmesio visiems“)?","options":["Nedelsiant bėgti į lauką ir sėsti į asmeninį automobilį.","Įsijungti Lietuvos nacionalinį radiją ar televiziją (LRT), patikrinti pranešimus telefone (GPIS) ir vykdyti nurodymus.","Skambinti visais įmanomais telefono numeriais artimiesiems ir užimti ryšio linijas."],"correctIndex":1},
        {"prompt":"Kur privaloma rinktis darbuotojams evakavusis iš pastato kilus pavojui?","options":["Bet kurioje aikštelėje šalia išėjimo durų.","Iš anksto nustatytoje ir ženklu pažymėtoje saugioje žmonių susirinkimo vietoje, nurodytoje evakavimo plane.","Artimiausioje kavinėje ar parduotuvėje."],"correctIndex":1},
        {"prompt":"Ar leidžiama naudotis liftu evakuacijos iš pastato metu?","options":["Taip, jei liftas tuo metu veikia ir nėra dūmų.","Taip, bet tik administracijos darbuotojams.","Griežtai draudžiama – evakuotis galima tik evakuaciniais laiptais."],"correctIndex":2},
        {"prompt":"Kaip reikia elgtis, jei paskelbta apie cheminę avariją ar oro užterštumą ir nurodyta likti patalpose?","options":["Plačiai atidaryti langus, kad patalpos vėdintųsi.","Sandariai uždaryti langus, duris, orlaides, išjungti vėdinimo ir kondicionavimo sistemas, užsandarinti plyšius.","Nusileisti į rūsį ir įjungti visus šildymo prietaisus."],"correctIndex":1},
        {"prompt":"Ką būtina pasiimti su savimi gavus nurodymą skubiai evakuotis iš gyvenamosios ar darbo vietos ilgesniam laikui?","options":["Asmens dokumentus, būtiniausius vaistus, geriamojo vandens, negendančio maisto, žibintuvėlį, radijo imtuvą su elementais (išvykimo krepšį).","Tik stambią buitinę techniką ir baldus.","Nieko imti negalima, nes viskuo pasirūpins gelbėtojai per 10 minučių."],"correctIndex":0},
        {"prompt":"Kur galima rasti informaciją apie kolektyvinės apsaugos statinius (KAS) ar priedangas savivaldybėje?","options":["Lietuvos pasirengimo ekstremaliosioms situacijoms svetainėje LT72.lt bei savivaldybės interneto svetainėje.","Tik užsienio naujienų portaluose.","Tokia informacija yra įslaptinta ir gyventojams neteikiama."],"correctIndex":0},
        {"prompt":"Kaip elgtis pastebėjus įtartiną be priežiūros paliktą daiktą ar galimą sprogmenį įmonės teritorijoje?","options":["Patikrinti, kas yra viduje, ir nunešti į apsaugos postą.","Neliesti, nejudinti daikto, pasitraukti saugiu atstumu, įspėti aplinkinius ir informuoti vadovą bei skambinti 112.","Užpilti vandeniu arba uždengti striuke."],"correctIndex":1},
        {"prompt":"Ką reikėtų daryti kilus žemės drebėjimui ar stipriai pastato konstrukcijų griūčiai, jei esate patalpoje?","options":["Atsistoti prie didelio lango ir stebėti, kas vyksta lauke.","Pasislėpti po tvirtu stalu ar prie kapitalinės vidinės sienos, toliau nuo langų, stiklinių pertvarų ir krintančių daiktų.","Naudotis elektros prietaisais ir atvira ugnimi."],"correctIndex":1},
        {"prompt":"Kas įmonėje organizuoja darbuotojų civilinės saugos mokymus, pratybas ir užtikrina pasirengimą ekstremaliosioms situacijoms?","options":["Įmonės vadovas arba jo paskirtas atsakingas asmuo (civilinės saugos specialistas).","Kiekvienas darbuotojas savarankiškai savo atostogų metu.","Tik Priešgaisrinės apsaugos ir gelbėjimo departamentas."],"correctIndex":0}
      ]$questions$::jsonb,
      'isProtocolTemplate', false
    ),
    jsonb_build_object(
      'id', 'res-civil-safety-training-journal',
      'title', 'Darbuotojų civilinės saugos mokymų ir instruktavimų registravimo žurnalas',
      'type', 'Žurnalas',
      'category', 'Civilinė sauga',
      'duration', '15 įrašų',
      'templateKind', 'civil-safety-training-journal',
      'signatures', true,
      'validityMonths', 12,
      'defaultForOrganizations', true,
      'requiredSigners', jsonb_build_array('Darbuotojas', 'DSS specialistas'),
      'defaultSettings', jsonb_build_object(
        'populateEmployees', true,
        'documentNumber', '',
        'instructionTitle', 'Darbuotojų civilinės saugos mokymai ir instruktavimai',
        'instructorPosition', '',
        'instructorName', '',
        'signatureFieldRoles', jsonb_build_object(
          'instructor', 'DSS specialistas',
          'employee', 'Darbuotojas'
        )
      ),
      'isProtocolTemplate', false
    ),
    jsonb_build_object(
      'id', 'res-protocol-civil-safety-training',
      'title', 'Darbuotojų civilinės saugos mokymų žinių patikrinimo protokolas',
      'type', 'Protokolas',
      'category', 'Mokymo programos',
      'duration', 'A4 formatas',
      'templateKind', 'knowledge-assessment-protocol',
      'relatedTestId', 'res-civil-safety-training-test',
      'signatures', true,
      'validityMonths', 12,
      'defaultForOrganizations', true,
      'requiredSigners', jsonb_build_array('Darbuotojas', 'DSS specialistas'),
      'isProtocolTemplate', true
    )
  ),
  true
),
updated_at = now()
where id = true;

do $$
begin
  execute 'alter table public.organization_data disable trigger guard_workspace_subscription_access';
  perform public.sync_creator_resource_defaults();
  execute 'alter table public.organization_data enable trigger guard_workspace_subscription_access';
end;
$$;
