import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultOrganizationResourcePresets,
  getOrganizationPresetResourceIds,
} from './organizationResourcePresets.js';

test('industry presets inherit the configured basic resources', () => {
  const selectedIds = getOrganizationPresetResourceIds('construction', defaultOrganizationResourcePresets);

  assert.equal(selectedIds.includes('res-workplace-conduct-test'), false);
  assert.ok(selectedIds.includes('res-computer-ergonomics-test'));
  assert.ok(selectedIds.includes('res-computer-ergonomics-journal'));
  assert.ok(selectedIds.includes('res-work-at-height-test'));
});

test('configured basic resources and organization-wide defaults are applied to a selected preset', () => {
  const presets = defaultOrganizationResourcePresets.map((preset) => preset.id === 'basic'
    ? { ...preset, resourceIds: ['basic-template'] }
    : preset.id === 'office'
      ? { ...preset, resourceIds: ['office-template'] }
      : preset);
  const selectedIds = getOrganizationPresetResourceIds('office', presets, ['global-template']);

  assert.deepEqual(selectedIds, ['global-template', 'basic-template', 'office-template']);
});
