update public.creator_workspace_data
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{resources}',
  coalesce(data -> 'resources', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id', 'res-medical-examination-schedule',
    'title', 'Darbuotojų periodinių medicinos apžiūrų grafikas',
    'type', 'Žurnalas',
    'category', 'Sveikatos patikrinimai',
    'duration', '20 darbuotojų',
    'html', $html$<!doctype html>
<html lang="lt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Darbuotojų periodinių medicinos apžiūrų grafikas</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; color: #1e293b; font: 11px/1.4 Arial, sans-serif; }
    .document-page { display: flex; min-height: 1050px; max-width: 850px; margin: 0 auto; padding: 35px 40px; flex-direction: column; border: 1px solid #e2e8f0; background: #fff; }
    .approval-block { margin-bottom: 25px; color: #334155; font-size: 11px; line-height: 1.5; text-align: right; }
    .approval-block .title { font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
    .doc-header { margin-bottom: 20px; text-align: center; }
    .company-name { margin-bottom: 12px; color: #0f172a; font-size: 14px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
    .doc-date { margin-bottom: 15px; color: #475569; }
    .doc-title { max-width: 90%; margin: 0 auto 8px; color: #0f172a; font-size: 13px; font-weight: 700; line-height: 1.4; text-transform: uppercase; }
    .doc-subtitle { color: #64748b; font-size: 10px; font-style: italic; }
    table.journal-table { width: 100%; margin-top: 10px; border-collapse: collapse; font-size: 10px; }
    .journal-table th, .journal-table td { border: 1px solid #cbd5e1; padding: 6px 4px; text-align: center; vertical-align: middle; }
    .journal-table th { background: #f1f5f9; color: #0f172a; font-weight: 600; line-height: 1.25; }
    .journal-table tbody tr:nth-child(even) { background: #f8fafc; }
    .journal-table tbody tr { height: 42px; }
    @media print { body { padding: 0; } .document-page { min-height: auto; max-width: 100%; margin: 0; padding: 0; border: 0; } }
  </style>
</head>
<body>
  <main class="document-page">
    <div class="approval-block"><div class="title">PATVIRTINTA:</div><div>Direktorius: {{ DIRECTOR_NAME }}</div></div>
    <header class="doc-header">
      <div class="company-name">{{ COMPANY_NAME }}</div>
      <div class="doc-date">{{ DOCUMENT_DATE }}</div>
      <div class="doc-title">DARBUOTOJŲ GRAFIKAS, KURIEMS PRIVALOMA PERIODINĖ MEDICINOS APŽIŪRA PAGAL LR SAM</div>
      <div class="doc-subtitle">2000-05-31 įsakymas Nr. 301, 2009-12-29 Nr. V-1072, 2022–2024 m.</div>
    </header>
    <table class="journal-table">
      <thead><tr>
        <th style="width:7%">Eil. Nr.</th><th style="width:28%">Vardas, pavardė</th>
        <th style="width:20%">Profesija, darbai</th><th style="width:17%">Periodiškumas</th>
        <th style="width:11%">Patikrinimo data</th><th style="width:11%">Sekančio patikrinimo data</th>
        <th style="width:6%">Darbuotojo parašas</th>
      </tr></thead>
      <tbody><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody>
    </table>
  </main>
</body>
</html>$html$,
    'templateKind', 'medical-examination-schedule',
    'signatures', true,
    'validityMonths', 24,
    'requiredSigners', jsonb_build_array('Darbuotojas'),
    'defaultSettings', jsonb_build_object(
      'rowCount', 20,
      'populateEmployees', true,
      'periodicity', '1 kartą per 2 metus',
      'directorName', ''
    ),
    'isProtocolTemplate', false
  )),
  true
),
updated_at = now()
where id = true
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(public.creator_workspace_data.data -> 'resources', '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = 'res-medical-examination-schedule'
  );
