/**
 * The cost band and trip length filters of the curated trip list (T188).
 *
 * Trip length is not a filter that drops trips: every trip exists at two
 * lengths (lib/tripLength.js, T101), so a length cannot exclude one. It is the
 * length the list is read at. It sets the days a card shows, the total a card
 * shows and the total the cost band tests, and it is the length a trip opens
 * on, through the one remembered choice.
 *
 * The cost band tests a card's total at that length against three bands.
 * The edges are not constants: they are the third and two-thirds points of
 * the whole library's totals at that length, rounded to the nearest 50 euros,
 * so each band holds about a third of the trips and the edges follow the wire
 * when it changes instead of going stale in a document. A band is a position
 * in the library, "under 700 euros" reads the same on any style.
 *
 * Pure functions only, so the node tests import them without a JSX loader.
 */
import { cardTotal } from './tripLength.js';

export const BANDS = ['low', 'mid', 'high'];

const round50 = (n) => Math.round(n / 50) * 50;

/** A card's total at a length, as one figure (the midpoint of its authored
 *  range), or null when the card carries no total. */
export function totalMid(card, length) {
  const t = cardTotal(card, length);
  if (!t) return null;
  const lo = Number.isFinite(t.low) ? t.low : t.high;
  const hi = Number.isFinite(t.high) ? t.high : t.low;
  return Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : null;
}

/** The two edges between the three bands, { low, high }, for the whole
 *  library at one length; null when the library is too small or too flat to
 *  split three ways. */
export function costEdges(cards, length) {
  const mids = (cards || []).map((c) => totalMid(c, length)).filter((v) => v != null).sort((a, b) => a - b);
  if (mids.length < 9) return null;
  const low = round50(mids[Math.floor(mids.length / 3)]);
  const high = round50(mids[Math.floor((2 * mids.length) / 3)]);
  return high > low ? { low, high } : null;
}

/** Which band a figure sits in: low below the first edge, high from the
 *  second edge up. */
export function bandOf(value, edges) {
  if (value == null || !edges) return null;
  if (value < edges.low) return 'low';
  if (value < edges.high) return 'mid';
  return 'high';
}

/** The cards that pass the band at a length. No band means every card; a card
 *  with no total never passes a band. */
export function filterByBand(cards, { length, band, edges }) {
  if (!band || !edges) return cards;
  return cards.filter((c) => bandOf(totalMid(c, length), edges) === band);
}

/** The cards whose best months include `month` (1 to 12). No month means
 *  every card; a card that names no months never passes a month (T387, rule
 *  "Month": a month filter reads the item's best months, never a forecast). */
export function filterByMonth(cards, month) {
  if (!month) return cards;
  return (cards || []).filter((c) => Array.isArray(c.months) && c.months.includes(month));
}

/** How many of the cards each month would keep, 1 to 12. */
export function monthCounts(cards) {
  const out = {};
  for (let m = 1; m <= 12; m += 1) out[m] = 0;
  for (const c of cards || []) {
    for (const m of new Set(c.months || [])) if (out[m] != null) out[m] += 1;
  }
  return out;
}

export const SORTS = ['written', 'cost', 'az'];

/** The list in one of three orders: as the library writes it, cheapest
 *  first at the length the list is read at (cards with no total last), or A
 *  to Z by title in the app language. Never mutates the input. */
export function sortCards(cards, sort, length, lang = 'en') {
  if (!Array.isArray(cards) || sort === 'written' || !sort) return cards;
  const out = cards.slice();
  if (sort === 'cost') {
    const at = (c) => totalMid(c, length);
    out.sort((a, b) => {
      const x = at(a);
      const y = at(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return x - y;
    });
  } else if (sort === 'az') {
    const coll = new Intl.Collator(lang, { sensitivity: 'base' });
    out.sort((a, b) => coll.compare(a.title || '', b.title || ''));
  }
  return out;
}

/** How many of the cards fall in each band, for the chips. */
export function bandCounts(cards, { length, edges }) {
  const out = { low: 0, mid: 0, high: 0 };
  if (!edges) return out;
  for (const c of cards || []) {
    const b = bandOf(totalMid(c, length), edges);
    if (b) out[b] += 1;
  }
  return out;
}
