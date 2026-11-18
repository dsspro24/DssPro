export const defaultOrganizationResourcePresets = [
  {
    id: 'basic',
    label: 'Bazinis (visoms įmonėms)',
    resourceIds: [
      'res-fire',
      'res-fire-knowledge-test',
      'res-protocol-fire-safety',
      'res-civil-safety-training-test',
      'res-civil-safety-training-journal',
      'res-protocol-civil-safety-training',
      'res-computer-ergonomics-test',
      'res-computer-ergonomics-journal',
      'res-protocol-computer-ergonomics',
      'res-journal',
      'res-intro-dss-journal',
      'res-fire-safety-journal',
      'res-evacuation-plan-familiarization-journal',
      'res-accident-incident-journal',
      'res-safety-violation-journal',
      'res-first-aid-kit-inspection-journal',
      'res-work-equipment-periodic-inspection-journal',
      'res-internal-documents-register',
      'res-work-rules-journal',
      'res-job-description-journal',
      'res-familiarization-card',
      'res-aap',
      'res-medical-examination-schedule',
    ],
  },
  {
    id: 'office',
    label: 'Biuras ir paslaugos',
    resourceIds: [
      'res-workplace-conduct-test',
      'res-protocol-workplace-conduct',
    ],
  },
  {
    id: 'trade-logistics',
    label: 'Prekyba, sandėlis ir logistika',
    resourceIds: [
      'res-chemical-safety-test',
      'res-protocol-chemical-safety',
      'res-chemical-safety-instruction-card',
      'res-manual-handling-test',
      'res-protocol-cargo-handling',
    ],
  },
  {
    id: 'construction',
    label: 'Statybos ir inžineriniai darbai',
    resourceIds: [
      'res-work-at-height-test',
      'res-protocol-work-at-height',
      'res-height',
      'res-excavation-safety-test',
      'res-protocol-excavation',
      'res-manual-handling-test',
      'res-protocol-cargo-handling',
      'res-chemical-safety-test',
      'res-protocol-chemical-safety',
      'res-chemical-safety-instruction-card',
    ],
  },
  {
    id: 'manufacturing',
    label: 'Gamyba, servisai ir pramonė',
    resourceIds: [
      'res-chemical-safety-test',
      'res-protocol-chemical-safety',
      'res-chemical-safety-instruction-card',
      'res-manual-handling-test',
      'res-protocol-cargo-handling',
      'res-fire-automation-maintenance-journal',
    ],
  },
];

export const normalizeOrganizationResourcePresets = (presets) => defaultOrganizationResourcePresets.map((defaultPreset) => {
  const savedPreset = Array.isArray(presets) ? presets.find((preset) => preset?.id === defaultPreset.id) : null;
  const resourceIds = Array.isArray(savedPreset?.resourceIds)
    ? [...new Set(savedPreset.resourceIds.filter((id) => typeof id === 'string'))]
    : defaultPreset.resourceIds;
  return { ...defaultPreset, resourceIds };
});

export const getOrganizationPresetResourceIds = (presetId, presets, globallyDefaultIds = []) => {
  const normalizedPresets = normalizeOrganizationResourcePresets(presets);
  const basicResourceIds = normalizedPresets.find((preset) => preset.id === 'basic')?.resourceIds ?? [];
  const selectedPresetResourceIds = normalizedPresets.find((preset) => preset.id === presetId)?.resourceIds ?? [];
  return [...new Set([...globallyDefaultIds, ...basicResourceIds, ...selectedPresetResourceIds])];
};
