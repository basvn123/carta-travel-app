// T650: getting around without a car, from one place.
//
// dest.local_transport.mobility (pipeline, car_layer.py) =
//   { car_free: 'good'|'ok'|'hard', modes: ['train','bus','ferry'] subset,
//     car_useful_for?: ['trailheads','lake_villages','countryside'],
//     parking_hard?: bool, basis: 'transit_lines'|'category', source }
// `car_needed` stays beside it (the price card's car line reads it, F6); this
// file is the only reader for the Getting around stat and the Explore "no car"
// flag, so the two cannot disagree.

export const CAR_FREE = ['good', 'ok', 'hard'];
export const MOBILITY_MODES = ['train', 'bus', 'ferry'];
export const CAR_USEFUL_FOR = ['trailheads', 'lake_villages', 'countryside'];

/** The mobility object when it is well formed, else null. */
export function mobilityOf(place) {
  const m = place?.local_transport?.mobility;
  return m && CAR_FREE.includes(m.car_free) ? m : null;
}

/** 'good' | 'ok' | 'hard', or null while the data has none. */
export const carFreeOf = (place) => mobilityOf(place)?.car_free ?? null;

/**
 * The Explore "no car" flag. Good or ok car-free life passes. While a place
 * has no mobility yet (the wire gets it with the Monday data run) the flag
 * keeps the rule it had, so it does not empty the list; the Getting around
 * stat shows the placeholder for that place instead.
 */
export function noCarOk(place) {
  const m = mobilityOf(place);
  if (m) return m.car_free === 'good' || m.car_free === 'ok';
  const lt = place?.local_transport;
  return !lt?.car_needed && (lt?.transit_quality === 'good' || lt?.transit_quality === 'excellent');
}

/**
 * Getting there's car and local transport rows from the same mobility object
 * and the same words as the stat (one source per stat). Null while the place
 * has no mobility: the caller then keeps its legacy sentences.
 *   transit: the first row ("Easy without a car. By train and bus. ...")
 *   tone:    'good' or 'limited', for the dot
 *   rental:  the rental figure line when a car is on the price card, else null
 *            (never says a car is needed)
 */
export function gettingAroundRows(place, getting, t, lang = 'en', fmtEur = (n) => String(n)) {
  const stat = mobilityStat(place, t, lang);
  if (!stat) return null;
  const rental = getting?.car_needed && getting.rental_eur_day != null
    ? t('dest.carRental', { eur: fmtEur(getting.rental_eur_day) }) : null;
  return {
    transit: [`${stat.value}.`, stat.note].filter(Boolean).join(' '),
    tone: carFreeOf(place) === 'good' ? 'good' : 'limited',
    rental,
  };
}

/**
 * The Getting around stat as words: { value, note } or null (placeholder).
 * `t` is the i18n function, `lang` the BCP 47 code for the list joins.
 */
export function mobilityStat(place, t, lang = 'en') {
  const m = mobilityOf(place);
  if (!m) return null;
  let list;
  try { list = new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }); } catch { list = null; }
  const join = (xs) => (list ? list.format(xs) : xs.join(', '));
  const parts = [];
  const modes = MOBILITY_MODES.filter((x) => (m.modes || []).includes(x));
  if (modes.length) parts.push(t('dest.aroundModes', { modes: join(modes.map((x) => t(`mode.${x}`))) }));
  const useful = CAR_USEFUL_FOR.filter((x) => (m.car_useful_for || []).includes(x));
  if (useful.length) parts.push(t('dest.aroundCarHelps', { what: join(useful.map((x) => t(`dest.carFor.${x}`))) }));
  if (m.parking_hard) parts.push(t('dest.aroundParking'));
  return { value: t(`dest.around.${m.car_free}`), note: parts.join(' ') || null };
}
