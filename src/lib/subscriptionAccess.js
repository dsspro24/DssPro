export function isSubscriptionActiveForEmployeeAccess(subscription, now = Date.now()) {
  if (!subscription || !['active', 'Aktyvi'].includes(subscription.status)) return false;

  const startsAt = subscription.starts_at !== undefined ? subscription.starts_at : subscription.startsAt;
  const endsAt = subscription.ends_at !== undefined ? subscription.ends_at : subscription.endsAt;
  const startTime = startsAt ? new Date(startsAt).getTime() : null;
  const endTime = endsAt ? new Date(endsAt).getTime() : null;
  const periodHasStarted = startTime === null || (Number.isFinite(startTime) && startTime <= now);
  const periodIsActive = endTime === null || (Number.isFinite(endTime) && endTime > now);

  return periodHasStarted && periodIsActive;
}
