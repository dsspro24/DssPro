update public.creator_workspace_data
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{resources}',
  coalesce(data -> 'resources', '[]'::jsonb) || case
    when exists (
      select 1
      from jsonb_array_elements(coalesce(data -> 'resources', '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = 'res-evacuation-plan-familiarization-journal'
    ) then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'id', 'res-evacuation-plan-familiarization-journal',
      'title', 'Darbuotojų, supažindintų su evakavimo planais, registravimo žurnalas',
      'type', 'Žurnalas',
      'category', 'Priešgaisrinė sauga',
      'duration', '15 įrašų',
      'html', $html$<!doctype html>
<html lang="lt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Darbuotojų, supažindintų su evakavimo planais, registravimo žurnalas</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 14px; color: #1e293b; font: 9px/1.3 Arial, sans-serif; }
    @page { size: A4 landscape; margin: 7mm; }
    .journal-page { max-width: 1160px; margin: 0 auto; padding: 8px; background: #fff; }
    .journal-header { margin-bottom: 8px; text-align: center; }
    .company-name { color: #0f172a; font-size: 13px; font-weight: 700; text-transform: uppercase; }
    .company-code { margin-top: 2px; color: #475569; font-size: 9px; }
    .doc-name { margin-top: 4px; color: #334155; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .doc-number { margin-top: 3px; color: #475569; font-size: 9px; }
    table.journal-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8px; }
    .journal-table th, .journal-table td { border: 1px solid #94a3b8; padding: 3px 2px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
    .journal-table th { background: #f1f5f9; color: #0f172a; font-weight: 700; line-height: 1.2; }
    .journal-table tbody tr:nth-child(even) { background: #f8fafc; }
    .journal-table tbody tr { height: 27px; }
    .col-date { width: 8%; }
    .col-name { width: 16%; }
    .col-code { width: 11%; }
    .col-position { width: 13%; }
    .col-number { width: 9%; }
    .col-instructor { width: 17%; }
    .col-signature { width: 13%; }
    @media print {
      body { padding: 0; }
      .journal-page { max-width: 100%; padding: 0; }
      .journal-table thead { display: table-header-group; }
      .journal-table tr { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="journal-page">
    <header class="journal-header">
      <div class="company-name">{{ COMPANY_NAME }}</div>
      <div class="company-code">Įmonės kodas: {{ COMPANY_CODE }}</div>
      <div class="doc-name">Darbuotojų, supažindintų su evakavimo planais, registravimo žurnalas</div>
      <div class="doc-number">Dokumento Nr.: {{ DOCUMENT_NUMBER }}</div>
    </header>
    <table class="journal-table">
      <thead>
        <tr>
          <th class="col-date">Supažindinimo data</th>
          <th class="col-name">Darbuotojo vardas, pavardė</th>
          <th class="col-code">Darbuotojo asmens kodas</th>
          <th class="col-position">Profesija, specialybė</th>
          <th class="col-number">Dokumento Nr.</th>
          <th class="col-instructor">Supažindinusio asmens vardas, pavardė</th>
          <th class="col-signature">Supažindinusio asmens parašas</th>
          <th class="col-signature">Darbuotojo parašas</th>
        </tr>
        <tr>
          <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th>
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
</html>$html$,
      'templateKind', 'evacuation-plan-journal',
      'signatures', true,
      'defaultForOrganizations', true,
      'requiredSigners', jsonb_build_array('Darbuotojas', 'DSS specialistas'),
      'defaultSettings', jsonb_build_object(
        'rowCount', 15,
        'populateEmployees', true,
        'documentNumber', '',
        'requiredSigners', jsonb_build_array('Darbuotojas', 'DSS specialistas'),
        'signatureFieldRoles', jsonb_build_object(
          'instructor', 'DSS specialistas',
          'employee', 'Darbuotojas'
        )
      ),
      'isProtocolTemplate', false
    ))
  end,
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
