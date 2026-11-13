export function isSubscriptionActiveForEmployeeAccess(subscription, now = Date.now()) {
  if (!subscription || !['active', 'Aktyvi'].includes(subscription.status)) return false;

  const startsAt = subscription.starts_at !== undefined ? subscription.starts_at : subscription.startsAt;
  const isPaidRenewal = (subscription.isRenewal === true || subscription.preinvoice_renewal === 'true')
    && (subscription.paymentStatus === 'Apmokėta' || subscription.payment_status === 'paid');
  const renewalEnd = subscription.serviceEnd ?? subscription.preinvoice_service_end;
  const endsAt = isPaidRenewal && renewalEnd
    ? renewalEnd
    : subscription.ends_at !== undefined ? subscription.ends_at : subscription.endsAt;
  const startTime = startsAt ? new Date(startsAt).getTime() : null;
  const endTime = endsAt ? new Date(endsAt).getTime() : null;
  if (isPaidRenewal && endTime !== null && Number.isFinite(endTime) && endTime > now) return true;
  const periodHasStarted = startTime === null || (Number.isFinite(startTime) && startTime <= now);
  const periodIsActive = endTime === null || (Number.isFinite(endTime) && endTime > now);

  return periodHasStarted && periodIsActive;
}

export function selectCurrentSubscription(subscriptions, now = Date.now()) {
  const manualAccessSubscription = subscriptions.find((subscription) => (
    subscription.manualAccessOverride && subscription.status === 'Aktyvi'
  ));
  if (manualAccessSubscription) return manualAccessSubscription;

  const pendingOrder = subscriptions.find((subscription) => (
    subscription.paymentStatus === 'Laukiama apmokėjimo'
    && subscription.status !== 'Atšaukta'
    && subscription.orderCode
    && !(subscription.isPlanChange && subscription.dueDate
      && new Date(subscription.dueDate).getTime() <= now)
  ));
  if (pendingOrder) return pendingOrder;

  const paidPlanChange = subscriptions.find((subscription) => (
    subscription.isPlanChange === true
    && subscription.paymentStatus === 'Apmokėta'
    && isSubscriptionActiveForEmployeeAccess(subscription, now)
  ));
  if (paidPlanChange) return paidPlanChange;

  const paidRenewal = subscriptions.find((subscription) => (
    subscription.isRenewal === true
    && subscription.paymentStatus === 'Apmokėta'
    && ['active', 'Aktyvi'].includes(subscription.status)
    && subscription.serviceEnd
    && new Date(subscription.serviceEnd).getTime() > now
  ));
  if (paidRenewal) {
    return {
      ...paidRenewal,
      status: 'Aktyvi',
      endsAt: paidRenewal.serviceEnd,
    };
  }

  return subscriptions.find((subscription) => isSubscriptionActiveForEmployeeAccess(subscription, now))
    ?? subscriptions[0]
    ?? null;
}

export function getSubscriptionStatusAfterManualExtension(status, endsAt, endsAtChanged, now = Date.now()) {
  if (!endsAtChanged || !['canceled', 'expired'].includes(status) || !endsAt) return status;

  const endTime = new Date(endsAt).getTime();
  return Number.isFinite(endTime) && endTime > now ? 'active' : status;
}
