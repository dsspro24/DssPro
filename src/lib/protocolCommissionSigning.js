const getVilniusDateKey = (date) => {
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
};

export const isProtocolCommissionSigningAvailable = (protocolDate, startsNextDay, now = new Date()) => {
  if (!startsNextDay) return true;
  if (typeof protocolDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(protocolDate)) return false;

  const protocolDateValue = new Date(`${protocolDate}T12:00:00Z`);
  if (Number.isNaN(protocolDateValue.getTime()) || getVilniusDateKey(protocolDateValue) !== protocolDate) return false;

  protocolDateValue.setUTCDate(protocolDateValue.getUTCDate() + 1);
  return getVilniusDateKey(now) >= getVilniusDateKey(protocolDateValue);
};
