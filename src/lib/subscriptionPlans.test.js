import assert from 'node:assert/strict';
import test from 'node:test';
import { getPrimarySubscriptionPlans } from './subscriptionPlans.js';

const plans = [
  { code: 'up_to_20', organization_id: null, active: true, employee_limit: 20 },
  { code: 'up_to_50', organization_id: null, active: true, employee_limit: 50 },
  { code: 'custom_old', organization_id: 'org-1', active: true, created_at: '2026-10-01' },
  { code: 'custom_latest', organization_id: 'org-1', active: true, created_at: '2026-11-01' },
  { code: 'other_org_custom', organization_id: 'org-2', active: true },
  { code: 'additional_workspace_20', organization_id: null, active: true },
];

test('unplanned organization sees standard plans and its latest custom plan', () => {
  const availablePlans = getPrimarySubscriptionPlans(plans, 'org-1', null);

  assert.deepEqual(availablePlans.map((plan) => plan.code), [
    'up_to_20',
    'up_to_50',
    'custom_latest',
  ]);
});

test('company custom plan is added without exposing older or other-company plans', () => {
  const availablePlans = getPrimarySubscriptionPlans(plans, 'org-1', { planCode: 'custom_latest' });

  assert.deepEqual(availablePlans.map((plan) => plan.code), [
    'up_to_20',
    'up_to_50',
    'custom_latest',
  ]);
});
