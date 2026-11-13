import test from 'node:test';
import assert from 'node:assert/strict';
import { isProtocolCommissionSigningAvailable } from './protocolCommissionSigning.js';

test('allows signing at any time when the next-day rule is disabled', () => {
  assert.equal(isProtocolCommissionSigningAvailable('', false, new Date('2026-11-13T10:00:00Z')), true);
});

test('holds a Friday protocol until Saturday in Vilnius time', () => {
  assert.equal(isProtocolCommissionSigningAvailable('2026-11-13', true, new Date('2026-11-13T21:59:59Z')), false);
  assert.equal(isProtocolCommissionSigningAvailable('2026-11-13', true, new Date('2026-11-13T22:00:00Z')), true);
});

test('does not release a delayed protocol with an invalid date', () => {
  assert.equal(isProtocolCommissionSigningAvailable('2026-11-31', true, new Date('2026-12-01T10:00:00Z')), false);
});
