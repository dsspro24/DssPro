import test from 'node:test';
import assert from 'node:assert/strict';
import { COOKIE_CONSENT_VALIDITY_DAYS, hasUnexpiredCookieConsent } from './cookieConsent.js';

const dayMs = 24 * 60 * 60 * 1000;

test('cookie consent stays valid through day 180 and expires afterward', () => {
  const now = Date.UTC(2026, 10, 12);
  const preferences = { savedAt: now - COOKIE_CONSENT_VALIDITY_DAYS * dayMs };

  assert.equal(hasUnexpiredCookieConsent(preferences, now), true);
  assert.equal(hasUnexpiredCookieConsent({ savedAt: preferences.savedAt - 1 }, now), false);
});

test('cookie consent requires a valid saved time that is not in the future', () => {
  const now = Date.UTC(2026, 10, 12);

  assert.equal(hasUnexpiredCookieConsent({}, now), false);
  assert.equal(hasUnexpiredCookieConsent({ savedAt: 'invalid' }, now), false);
  assert.equal(hasUnexpiredCookieConsent({ savedAt: now + 1 }, now), false);
});
