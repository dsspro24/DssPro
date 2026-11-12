export const COOKIE_CONSENT_VALIDITY_DAYS = 180;
export const COOKIE_CONSENT_VALIDITY_MS = COOKIE_CONSENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

function getSavedAt(preferences) {
  if (typeof preferences?.savedAt === 'number') return preferences.savedAt;
  if (typeof preferences?.savedAt === 'string') return Date.parse(preferences.savedAt);
  return Number.NaN;
}

export function hasUnexpiredCookieConsent(preferences, now = Date.now()) {
  if (!preferences || typeof preferences !== 'object') return false;
  const savedAt = getSavedAt(preferences);

  return Number.isFinite(savedAt)
    && savedAt <= now
    && now - savedAt <= COOKIE_CONSENT_VALIDITY_MS;
}

export function getCookieConsentExpiry(preferences) {
  const savedAt = getSavedAt(preferences);
  return Number.isFinite(savedAt) ? savedAt + COOKIE_CONSENT_VALIDITY_MS : Number.NaN;
}
