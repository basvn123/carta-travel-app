/**
 * carriers.js, which airline a stored fare belongs to.
 *
 * The base harvest is Ryanair; the Wizz Air / Vueling / Volotea harvesters
 * merge cheapest-wins and tag only the days they beat Ryanair (out_c/ret_c
 * in the fare slices, hydrated to routes.outbound_carrier/return_carrier).
 * An untagged day is therefore a Ryanair fare, which is why the fallback
 * here is 'FR', not 'unknown'.
 *
 * 'TP' is not an airline: it marks a day filled from the Travelpayouts
 * (Aviasales) fare cache, covering carriers we cannot harvest directly. The
 * operating airline of such a quote is only shown on the booking site, so
 * the label names that site rather than guessing an airline.
 */

export const CARRIER_NAMES = {
  FR: 'Ryanair',
  W6: 'Wizz Air',
  VY: 'Vueling',
  V7: 'Volotea',
  TP: 'Aviasales',
};

/** Human airline name for a carrier code (untagged = Ryanair). */
export function carrierName(code) {
  return CARRIER_NAMES[code] || 'Ryanair';
}

/** The airline label for a round trip on this route: "Ryanair" when both legs
 *  match, "Wizz Air + Ryanair" when the two days belong to different
 *  carriers. Works on a hydrated route ({ outbound_carrier, return_carrier })
 *  and tolerates routes without carrier maps (older data = all Ryanair). */
export function carrierPairName(route, outDate, retDate) {
  const out = carrierName(route?.outbound_carrier?.[outDate]);
  const ret = carrierName(route?.return_carrier?.[retDate]);
  return out === ret ? out : `${out} + ${ret}`;
}
