import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSubscriptionStatusAfterManualExtension,
  isSubscriptionActiveForEmployeeAccess,
} from './subscriptionAccess.js';

const now = Date.parse('2026-11-12T10:00:00.000Z');

test('active manual subscription ignores pending payment and old unpaid invoices', () => {
  const subscription = {
    status: 'active',
    manual_access_override: true,
    payment_status: 'pending',
    starts_at: '2026-11-01T00:00:00.000Z',
    ends_at: '2026-12-01T00:00:00.000Z',
    preinvoice_due_date: '2025-01-01T00:00:00.000Z',
  };

  assert.equal(isSubscriptionActiveForEmployeeAccess(subscription, now), true);
});

test('subscription is inactive outside its start and end dates', () => {
  assert.equal(isSubscriptionActiveForEmployeeAccess({
    status: 'active',
    starts_at: '2026-11-13T00:00:00.000Z',
    ends_at: '2026-12-01T00:00:00.000Z',
  }, now), false);
  assert.equal(isSubscriptionActiveForEmployeeAccess({
    status: 'active',
    starts_at: '2026-11-01T00:00:00.000Z',
    ends_at: '2026-11-12T10:00:00.000Z',
  }, now), false);
  assert.equal(isSubscriptionActiveForEmployeeAccess({
    status: 'active',
    starts_at: 'not-a-date',
    ends_at: '2026-12-01T00:00:00.000Z',
  }, now), false);
});

test('subscription with no date bounds remains active, matching the invite function', () => {
  assert.equal(isSubscriptionActiveForEmployeeAccess({ status: 'active' }, now), true);
});

test('frontend subscription labels use the same period check', () => {
  assert.equal(isSubscriptionActiveForEmployeeAccess({
    status: 'Aktyvi',
    startsAt: '2026-11-01T00:00:00.000Z',
    endsAt: '2026-12-01T00:00:00.000Z',
  }, now), true);
});

test('extending an expired subscription into the future activates it', () => {
  assert.equal(getSubscriptionStatusAfterManualExtension(
    'expired',
    '2026-12-01T00:00:00.000Z',
    now,
  ), 'active');
  assert.equal(getSubscriptionStatusAfterManualExtension(
    'expired',
    '2026-11-01T00:00:00.000Z',
    now,
  ), 'expired');
  assert.equal(getSubscriptionStatusAfterManualExtension(
    'canceled',
    '2026-12-01T00:00:00.000Z',
    now,
  ), 'canceled');
});
