import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSubscriptionStatusAfterManualExtension,
  isSubscriptionActiveForEmployeeAccess,
  selectCurrentSubscription,
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

test('paid renewal takes precedence and displays its prepaid end date before its start date', () => {
  const paidRenewal = {
    id: 'renewal',
    isRenewal: true,
    paymentStatus: 'Apmokėta',
    status: 'Pasibaigusi',
    startsAt: '2026-12-01T00:00:00.000Z',
    endsAt: '2026-12-01T00:00:00.000Z',
    serviceEnd: '2027-01-01T00:00:00.000Z',
  };
  const oldSubscription = {
    id: 'old',
    status: 'Pasibaigusi',
    paymentStatus: 'Apmokėta',
    endsAt: '2026-12-01T00:00:00.000Z',
  };

  const currentSubscription = selectCurrentSubscription([oldSubscription, paidRenewal], now);
  assert.deepEqual(currentSubscription, {
    ...paidRenewal,
    status: 'Aktyvi',
    endsAt: paidRenewal.serviceEnd,
  });
  assert.equal(isSubscriptionActiveForEmployeeAccess(currentSubscription, now), true);
});

test('paid active plan change takes precedence over the superseded prepaid renewal', () => {
  const paidRenewal = {
    id: 'renewal',
    isRenewal: true,
    paymentStatus: 'Apmokėta',
    status: 'Aktyvi',
    startsAt: '2026-12-01T00:00:00.000Z',
    endsAt: '2026-12-01T00:00:00.000Z',
    serviceEnd: '2027-01-01T00:00:00.000Z',
  };
  const paidPlanChange = {
    id: 'plan-change',
    isPlanChange: true,
    paymentStatus: 'Apmokėta',
    status: 'Aktyvi',
    startsAt: '2026-11-12T10:00:00.000Z',
    endsAt: '2027-01-01T00:00:00.000Z',
  };

  assert.equal(selectCurrentSubscription([paidRenewal, paidPlanChange], now), paidPlanChange);
});

test('an active unpaid order is surfaced ahead of the paid renewal and expired plan changes are ignored', () => {
  const paidRenewal = {
    id: 'renewal',
    isRenewal: true,
    paymentStatus: 'Apmokėta',
    status: 'Aktyvi',
    endsAt: '2027-01-01T00:00:00.000Z',
    serviceEnd: '2027-01-01T00:00:00.000Z',
  };
  const pendingPlanChange = {
    id: 'pending-plan-change',
    isPlanChange: true,
    paymentStatus: 'Laukiama apmokėjimo',
    status: 'Aktyvi',
    orderCode: 'DSS26111317',
    dueDate: '2026-11-17T00:00:00.000Z',
  };

  assert.equal(selectCurrentSubscription([paidRenewal, pendingPlanChange], now), pendingPlanChange);
  assert.equal(selectCurrentSubscription([
    paidRenewal,
    { ...pendingPlanChange, dueDate: '2026-11-11T00:00:00.000Z' },
  ], now).id, 'renewal');
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
    true,
    now,
  ), 'active');
  assert.equal(getSubscriptionStatusAfterManualExtension(
    'expired',
    '2026-11-01T00:00:00.000Z',
    true,
    now,
  ), 'expired');
  assert.equal(getSubscriptionStatusAfterManualExtension(
    'canceled',
    '2026-12-01T00:00:00.000Z',
    true,
    now,
  ), 'active');
  assert.equal(getSubscriptionStatusAfterManualExtension(
    'canceled',
    '2026-12-01T00:00:00.000Z',
    false,
    now,
  ), 'canceled');
});
