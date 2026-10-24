/**
 * Do-prices (T701, plan section 5): what it costs to do something at a place
 * the traveller visits (an entry, a lift, a lido), read from the pipeline's
 * price records (harvest_poi_fees.py `price`, harvest_lift_hours.py
 * `lift.fare`):
 *
 *   { value, unit, currency, source, date, quality }
 *
 * The rules of section 5:
 *   - an unknown price is never shown as a price: null, and the page shows
 *     its placeholder where it has a slot (owner, 2026-10-24);
 *   - never "EUR 0": a zero is "Free", and only in a category where paying
 *     also occurs (sights, beaches); elsewhere a zero shows nothing (V11);
 *   - only euro records count; another currency is not converted here.
 */
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** The record's euro amount, or null when it is missing or not in euros. */
export function doPriceEur(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.currency && String(record.currency).toUpperCase() !== 'EUR') return null;
  return isNum(record.value) && record.value >= 0 ? record.value : null;
}

// Categories where some places charge and some do not, so "Free" is news.
const FREE_IS_NEWS = new Set(['sight', 'beach', 'activity']);

/**
 * What a do-price slot says: { kind: 'free' } | { kind: 'eur', eur } | null.
 * `category` decides whether a zero is worth saying (V11).
 */
export function doPriceOf(record, category) {
  const eur = doPriceEur(record);
  if (eur == null) return null;
  if (eur === 0) return FREE_IS_NEWS.has(category) ? { kind: 'free' } : null;
  return { kind: 'eur', eur };
}
