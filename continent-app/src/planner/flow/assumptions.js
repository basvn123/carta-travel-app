/**
 * assumptions.js, the chips of the shared assumption bar (G12 plan rethink,
 * decision §1.4 and §3.3): Who, From, When and length, then Style and More
 * in the component. Solid = the traveller gave it (on a screen, in words,
 * on Explore, from the page the trip came from, for this trip, or through
 * their style); dashed = Carta assumed it (a default). Pure, so node tests
 * hold it; the words come from the caller's `t`.
 */
import { partyText } from '../../lib/party.js';

export const ASSUMPTION_IDS = Object.freeze(['who', 'from', 'when']);

/** Whether Carta assumed this answer (nobody gave it). */
export function assumed(settings, id) {
  return !(settings?.answered || []).includes(id);
}

/**
 * The order "Check my assumptions" walks the dashed chips in (G12 L7,
 * decision §1.8: biggest price effect first). The party scales every line
 * (beds, days, seats), the dates move both the fares and the bed season,
 * the start town only the way there; so who, when, from. A fixed order on
 * purpose: quoting each default against its alternatives to rank them
 * would re-price the trip three times before the first sheet opens.
 */
export const CHECK_ORDER = Object.freeze(['who', 'when', 'from']);

/** The ids still assumed, in CHECK_ORDER; empty when everything is given. */
export function checkWalk(settings) {
  return CHECK_ORDER.filter((id) => assumed(settings, id));
}

/**
 * The bar's chips.
 *   opts: { t, when ({ start, end } as flowHooks whenText), fromName (the
 *           app's start town when the trip has none) }
 *   -> [{ id, label, assumed }]
 */
export function assumptionChips(settings, { t, when = null, fromName = '' } = {}) {
  const s = settings;
  const p = s.party;
  const nights = s.when?.mode === 'exact' && s.when.start && s.when.end
    ? Math.max(1, Math.round((Date.parse(`${s.when.end}T12:00:00Z`) - Date.parse(`${s.when.start}T12:00:00Z`)) / 86400000))
    : s.when?.nights;
  // G12 browser pass: whenText's `end` is the nights for months and "any
  // time", so only exact dates read as a range ("May to 7 nights" before).
  const range = s.when?.mode === 'exact' && when?.end;
  const dates = when?.start ? (range ? t('plan.dateRange', { a: when.start, b: when.end }) : when.start) : t('pf.when.unsure');
  return [
    { id: 'who', label: partyText(t, { adults: p.adults, children: p.kids, babies: p.babies }), assumed: assumed(s, 'who') },
    { id: 'from', label: s.from?.name || fromName || t('pf.home.starts'), assumed: assumed(s, 'from') },
    { id: 'when', label: nights ? `${dates}, ${t('tf.keep.nights', { n: nights })}` : dates, assumed: assumed(s, 'when') },
  ];
}
