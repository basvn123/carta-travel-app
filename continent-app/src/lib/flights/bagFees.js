/**
 * What a bag costs on top of the fare, per person, per direction (T517).
 *
 * Google Flights prices the fare alone. Low-cost airlines sell the 10 kg
 * cabin trolley and the checked bag apart, so a trip total that should hold
 * up at the airport adds them. The figures are typical prices when booked
 * online with the flight, not the gate price; airlines move them with the
 * route and the season, so Carta always shows them as estimates (`~€25
 * est.`). Full-service airlines keep a cabin bag in their lightest economy
 * fare; their checked bag is the extra. Each row names the page it was read
 * from and when. An airline not listed adds nothing and the line reads
 * "bags may cost extra".
 *
 * Owner review: register row T517-a.
 */

// [cabin 10 kg trolley, checked 20 to 23 kg], EUR per person per direction.
// 0 = included in the cheapest fare.
const READ = '2026-10-21';
export const BAG_FEES = Object.freeze({
  FR: { cabin: 20, checked: 35, source: 'ryanair.com fees page', read: READ },
  W6: { cabin: 25, checked: 35, source: 'wizzair.com services and fees', read: READ },
  U2: { cabin: 15, checked: 30, source: 'easyjet.com baggage', read: READ },
  VY: { cabin: 18, checked: 25, source: 'vueling.com luggage', read: READ },
  V7: { cabin: 15, checked: 25, source: 'volotea.com baggage', read: READ },
  HV: { cabin: 15, checked: 30, source: 'transavia.com baggage', read: READ },
  TO: { cabin: 15, checked: 30, source: 'transavia.com baggage', read: READ },
  DY: { cabin: 15, checked: 30, source: 'norwegian.com baggage', read: READ },
  EW: { cabin: 15, checked: 30, source: 'eurowings.com baggage', read: READ },
  BT: { cabin: 15, checked: 30, source: 'airbaltic.com baggage', read: READ },
  PC: { cabin: 0, checked: 25, source: 'flypgs.com baggage', read: READ },
  LS: { cabin: 0, checked: 40, source: 'jet2.com baggage', read: READ },
  XQ: { cabin: 0, checked: 30, source: 'sunexpress.com baggage', read: READ },
  '4U': { cabin: 0, checked: 30, source: 'eurowings.com baggage', read: READ },
});

// Full-service airlines: the cabin bag comes with the lightest economy fare.
const FULL_SERVICE = new Set([
  'SN', 'KL', 'AF', 'LH', 'BA', 'IB', 'AZ', 'OS', 'LX', 'TP', 'SK', 'AY', 'A3', 'LO', 'OK',
  'JU', 'OU', 'TK', 'EI', 'UX', 'I2', 'EN', 'WK', 'FB', 'RO', 'JP', 'KM', 'CY', 'FI', 'OA',
]);
const FULL_SERVICE_CHECKED = 35;

/** The app's baggage keys (meta.baggage_options and the planner) to a tier. */
export function bagTier(key) {
  if (key === 'priority_10kg' || key === 'priority' || key === 'cabin10') return 'cabin';
  if (key === 'checked_20kg' || key === 'checked' || key === 'checked20') return 'checked';
  return 'none';
}

/**
 * The typical extra for `bagKey` on `airline`, per person per direction:
 * { eur, known } where known is false when Carta has no figure for the
 * airline (eur is then 0 and the screen says bags may cost extra).
 */
export function bagFee(airline, bagKey) {
  const tier = bagTier(bagKey);
  if (tier === 'none') return { eur: 0, known: true };
  const row = BAG_FEES[airline];
  if (row) return { eur: row[tier], known: true };
  if (FULL_SERVICE.has(airline)) return { eur: tier === 'cabin' ? 0 : FULL_SERVICE_CHECKED, known: true };
  return { eur: 0, known: false };
}
