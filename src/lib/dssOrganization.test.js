import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDssOrganization } from './dssOrganization.js';

test('builds a DSS organization from normalized resource access when legacy settings are missing', () => {
  const organization = buildDssOrganization({
    summary: { id: 'org-1', name: 'Įmonė', companyCode: '123' },
    savedOrganization: null,
    resourceAccess: [
      { document_id: 'doc-1', settings: { requiredSigners: ['Vadovas'] } },
      { document_id: 'doc-2', settings: null },
    ],
    specialistId: 'specialist-1',
    canManageWorkspace: false,
  });

  assert.deepEqual(organization.resources, ['doc-1', 'doc-2']);
  assert.deepEqual(organization.resourceSettings, {
    'doc-1': { requiredSigners: ['Vadovas'] },
    'doc-2': {},
  });
  assert.deepEqual(organization.dss, ['specialist-1']);
  assert.equal(organization.canManageWorkspace, false);
});

test('preserves stored organization settings and applies current membership permissions', () => {
  const organization = buildDssOrganization({
    summary: { id: 'org-1', name: 'Atnaujintas pavadinimas', companyCode: '123' },
    savedOrganization: {
      id: 'old-id',
      name: 'Senas pavadinimas',
      resources: ['stored-doc'],
      resourceSettings: { 'stored-doc': { allowUnlinkedProtocolSigning: false } },
      dss: ['specialist-1'],
    },
    resourceAccess: [{ document_id: 'fallback-doc', settings: {} }],
    specialistId: 'specialist-1',
    canManageWorkspace: true,
  });

  assert.equal(organization.id, 'org-1');
  assert.equal(organization.name, 'Atnaujintas pavadinimas');
  assert.deepEqual(organization.resources, ['stored-doc']);
  assert.deepEqual(organization.resourceSettings, {
    'stored-doc': { allowUnlinkedProtocolSigning: false },
  });
  assert.deepEqual(organization.dss, ['specialist-1']);
  assert.equal(organization.canManageWorkspace, true);
});
