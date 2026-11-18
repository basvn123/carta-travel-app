/**
 * The price sheet's Flight tab, as pure helpers (D10, explore polish,
 * flight-tab.md). The tab is a look-around over data Explore already holds:
 * the sweep file's checked days drawn as bars, the pair behind the row's
 * figure, and the same pair from other ticked home airports. No React, no
 * fetch, so node tests pin what the tab may claim.
 *
 * Honesty rules the helpers carry, so no caller can break them:
 *   - a day is a bar only when sweptDay gives a fresh fare; a day nobody
 *     searched, or a fare past its age, never appears (stale reads as now);
 *   - a searched day with no flight is 'none', shown as an empty ring;
 *   - the wanted day with no fresh entry is 'unchecked', never a guessed bar;
 *   - the pair figure is the row's own formula (useExploreRows + wayFor), so
 *     the tab's default figure equals the row's flight wagon.
 */
import { sweptDay, legCost } from './flights.js';
import { flightLegs } from '../price/flight.js';
import { flightWindow } from '../price/request.js';
import { flightPerSeat } from '../party.js';
import { homeCandidates } from '../airportReach.js';

const DAY_MS = 86400000;
// The live search reaches this far (functions/api/flights.js); the sweep's
// late tier stops before it, so no checked day is cut off.
const AHEAD_DAYS = 330;
// Exact dates: two weeks either side of the wanted day, enough to see the
// near tier's every-third-day checks around it.
const EXACT_SPREAD = 14;

const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const msOf = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso, n) => isoOf(msOf(iso) + n * DAY_MS);
const monthEnd = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return isoOf(Date.UTC(y, m, 0));
};
const nextYm = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const clip = (iso, lo, hi) => (iso < lo ? lo : iso > hi ? hi : iso);

/**
 * The days a strip covers for one way of the request.
 *   dir      'out' or 'back'
 *   outDate  the shown way out (back strips start after it)
 *   today    'YYYY-MM-DD'
 * Returns { from, to, wanted } with `wanted` the traveller's own day (exact
 * dates only, else null), every date clipped to tomorrow .. today + 330.
 */
export function fareWindow(req, dir, { outDate = null, today } = {}) {
  const lo = addDays(today, 1);
  const hi = addDays(today, AHEAD_DAYS);
  const w = flightWindow(req);
  let from;
  let to;
  let wanted = null;
  if (w.kind === 'exact') {
    wanted = dir === 'back' ? w.to : w.from;
    from = addDays(wanted, -EXACT_SPREAD);
    to = addDays(wanted, EXACT_SPREAD);
  } else if (w.kind === 'month') {
    // The back strip runs as cheapestReturn pairs it: home in the month of
    // the way out or the next.
    from = dir === 'back' ? (outDate || `${w.ym}-01`) : `${w.ym}-01`;
    to = dir === 'back' ? monthEnd(nextYm(w.ym)) : monthEnd(w.ym);
  } else {
    from = dir === 'back' && outDate ? addDays(outDate, 1) : lo;
    to = hi;
  }
  return { from: clip(from, lo, hi), to: clip(to, lo, hi), wanted };
}

/**
 * The checked days of one way, in date order: [{ date, leg, state }], where
 * state is 'fare' (a fresh fare), 'none' (searched, no flight), 'before' (a
 * way home on or before `after`, the shown way out) or 'unchecked' (only the
 * wanted day, when it has no fresh entry).
 */
export function fareDays(file, dir, airport, { from, to, after = null, wanted = null, now = Date.now() } = {}) {
  const days = file?.[dir === 'back' ? 'back' : 'to']?.[airport];
  if (!days) return wanted ? [{ date: wanted, leg: null, state: 'unchecked' }] : [];
  const out = [];
  for (const date of Object.keys(days)) {
    if ((from && date < from) || (to && date > to)) continue;
    const leg = sweptDay(file, dir, airport, date, now);
    if (leg === undefined) continue;
    const state = after && date <= after ? 'before' : leg === null ? 'none' : 'fare';
    out.push({ date, leg, state });
  }
  if (wanted && !out.some((d) => d.date === wanted)) out.push({ date: wanted, leg: null, state: 'unchecked' });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** A bar's height in px from a zero baseline, with a floor so a cheap day still shows. */
export function barHeight(price, max, { h = 72, min = 6 } = {}) {
  if (!(price > 0) || !(max > 0)) return min;
  return Math.max(min, Math.round((price / max) * h));
}

/**
 * The return figure of a pair, as the row prices it: each leg's fare plus
 * the traveller's bag for one seat, the babies' lap fees shared over the
 * seats; the group figure is that times the seats.
 */
export function pairFigure(out, back, { party = null, bagKey, group = false } = {}) {
  if (!out || !back) return null;
  const a = legCost(out, { paying: 1, bagKey });
  const b = legCost(back, { paying: 1, bagKey });
  const perSeat = a.perSeat + b.perSeat;
  const perPerson = flightPerSeat(perSeat, party);
  if (perPerson == null) return null;
  const seats = Math.max(1, party?.seats || 1);
  return {
    perSeat,
    perPerson,
    shown: group ? Math.round(perPerson * seats * 100) / 100 : perPerson,
    bags: a.bags + b.bags,
    bagsKnown: a.bagsKnown && b.bagsKnown,
  };
}

/**
 * The pair from every ticked home airport that has a sweep file, the
 * selected one first: [{ iata, legs, perPerson }], `legs` null when that
 * file has no pair for the request. Airports without a file are left out:
 * nothing is known from them.
 */
export function airportPairs(data, airport, req, { party = null, bagKey, now = Date.now() } = {}) {
  const sel = data?.flights?.from || null;
  const { homes } = homeCandidates(data, sel);
  const rows = [];
  for (const h of homes) {
    if (!h.file || h.iata === airport) continue;
    const legs = flightLegs(h.file, airport, req, now);
    const fig = legs ? pairFigure(legs.out, legs.back, { party, bagKey }) : null;
    rows.push({ iata: h.iata, file: h.file, legs: legs || null, perPerson: fig ? fig.perPerson : null });
  }
  return rows.sort((a, b) => (a.iata === sel ? -1 : b.iata === sel ? 1 : 0));
}

/**
 * Which basis line the tab says (copy.md 3f): 'picked' while the shown pair
 * is not the row's, 'near' when a leg is not on the wanted day, else by the
 * date mode ('days', 'month', 'any').
 */
export function flightBasis(req, legs, { picked = false } = {}) {
  if (picked) return 'picked';
  const w = flightWindow(req);
  if (w.kind === 'exact') {
    const moved = legs && (legs.out?.date !== w.from || legs.back?.date !== w.to);
    return moved ? 'near' : 'days';
  }
  return w.kind === 'month' ? 'month' : 'any';
}
