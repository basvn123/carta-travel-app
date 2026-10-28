/**
 * The order of the priced trips, and what each card says about itself
 * (TF1, T794): the budget ruler, the match, three reasons and one catch.
 *
 *   1. levers   the trade-offs a traveller pulls (TF3 wires them): each
 *               swaps a slot to one of its options, or narrows the
 *               shapes, so a lever is an existing setting, never a new
 *               price rule (config recommend.json levers); the flight
 *               lever re-ranks by the swept flights (flightPull, T803)
 *   2. fit      a trip qualifies when its strongest chosen like reads at
 *               least rank.mainLikeMin where the profiles measure it, and
 *               no hard conflict stands (config rank, fitFirst)
 *   3. order    by forYou (the places' quality plus the match, as Explore
 *               orders places), trips over the typed budget sinking by
 *               budget.sinkPer100 a hundred euros over
 *
 * The match shows on Help me choose even while persona gate 7 fails
 * (owner, 2026-10-28), from match.show_min up; Explore keeps For you a
 * sort. One amount, no bands (price rule 2). Pure; the trips are not
 * changed, every call returns new ones.
 */
import RECOMMEND from '../../../config/recommend.json' with { type: 'json' };
import { chooseOption, slotTotals } from './slots.js';
import { buildTrips } from './trips.js';
import { tasteFor } from './candidates.js';
import { tripFit, reasonsFor, catchFor } from './reasons.js';
import { flightLeverKeys } from './adapters/flight.js';

export const RANK = Object.freeze(RECOMMEND.rank);
export const LEVERS = Object.freeze(RECOMMEND.levers);

/** The traveller's budget for one trip, a person: the whole-trip figure, or a day figure times the nights. */
export function budgetOf(settings, nights) {
  const b = settings.guide.budget;
  if (!b?.eur) return null;
  return b.kind === 'day' ? b.eur * nights : b.eur;
}

/** The ruler: { eur, delta } a person, delta < 0 under budget; null with no budget. */
export function budgetRuler(trip, settings) {
  const eur = budgetOf(settings, trip.nights);
  return eur ? { eur, delta: trip.total.perPerson - eur } : null;
}

/** The slots and shapes after the levers. Unknown or unset levers change nothing. */
export function applyLevers(trips, levers) {
  if (!levers) return trips;
  let out = trips;
  const bases = LEVERS.bases.values[levers.bases];
  if (bases) {
    const want = levers.bases === 'one' ? (t) => t.places.length === 1 : (t) => t.places.length > 1;
    const kept = trips.filter(want);
    if (kept.length) out = kept;
  }
  const swaps = ['flight', 'food']
    .filter((k) => levers[k] && LEVERS[k].values[levers[k]] != null)
    .map((k) => ({ slot: LEVERS[k].slot, option: levers[k] }));
  if (!swaps.length) return out;
  return out.map((t) => {
    const slots = t.slots.map((s) => {
      const sw = swaps.find((x) => x.slot === s.id);
      return sw ? chooseOption(s, sw.option) : s;
    });
    return { ...t, slots, total: slotTotals(slots) };
  });
}

/**
 * The flight lever (TF3, T803, rule a). On swept data a trip has one flight
 * a day, so the lever cannot swap it (the picker's live options do that);
 * it re-ranks the trips by their flights instead. Each trip takes its place
 * in the lever's own order (adapters/flight.js flightLeverKeys: cheapest
 * flight, or the stops then door to door, or the comfort of the times) and
 * sinks by up to FLIGHT_PULL for the last place, the same as being EUR 500
 * over budget, so the fit still leads and the flight decides between near
 * equals. Equal keys share a place; a trip with no flight facts sits in the
 * middle, neither helped nor hurt. Returns Map id -> sink.
 */
export const FLIGHT_PULL = 5 * RECOMMEND.budget.sinkPer100;

export function flightPull(trips, lever) {
  const out = new Map();
  if (!lever || !LEVERS.flight.values[lever] || trips.length < 2) return out;
  const keys = flightLeverKeys(trips, lever);
  const cmp = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) return (a[i] ?? Infinity) < (b[i] ?? Infinity) ? -1 : 1;
    }
    return 0;
  };
  const known = trips.filter((t) => keys.get(t.id)).sort((a, b) => cmp(keys.get(a.id), keys.get(b.id)));
  const last = trips.length - 1;
  for (let i = 0; i < known.length;) {
    let j = i;
    while (j + 1 < known.length && cmp(keys.get(known[i].id), keys.get(known[j + 1].id)) === 0) j++;
    // Spread the known trips over the whole list's places, ties sharing one.
    const place = known.length > 1 ? (((i + j) / 2) / (known.length - 1)) * last : last / 2;
    for (let k = i; k <= j; k++) out.set(known[k].id, (FLIGHT_PULL * place) / last);
    i = j + 1;
  }
  for (const t of trips) if (!out.has(t.id)) out.set(t.id, FLIGHT_PULL / 2);
  return out;
}

// The fit of a trip depends on its places, month and the taste only, all
// fixed per answer set (trips are memoised per answer set), so it is kept.
const fits = new WeakMap();

function fitOf(trip, taste, destinations, settings) {
  const base = trip.base || trip;
  let info = fits.get(base);
  if (!info) {
    info = tripFit(base, taste, destinations, { avoidHeat: settings.guide.avoid.includes('heat') || settings.guide.weather === 'mild' });
    fits.set(base, info);
  }
  return info;
}

/** Does a trip qualify (fit first)? Its strongest chosen like, where measured, and no hard conflict. */
export function qualifies(info, settings) {
  if (info.conflicts.some((c) => RANK.hardConflicts.includes(c.key))) return false;
  const likes = new Set(settings.guide.likes);
  const measured = info.bars.filter((b) => b.kind === 'like' && likes.has(b.key));
  if (!measured.length) return true;
  return Math.max(...measured.map((b) => b.p)) >= RANK.mainLikeMin;
}

/**
 * Rank priced trips (trips.js) for one answer set.
 * opts: { settings, taste (the saved one), data, levers }
 */
export function rankTrips(trips, { settings, taste = null, data, levers = null } = {}) {
  const t = tasteFor(settings, taste);
  const destinations = data?.destinations || {};
  const levered = applyLevers(trips.map((x) => ({ ...x, base: x.base || x })), levers);
  const pull = flightPull(levered, levers?.flight);
  const ranked = levered.map((trip) => {
    const info = fitOf(trip, t, destinations, settings);
    const budget = budgetRuler(trip, settings);
    const sink = budget && budget.delta > 0 ? (RECOMMEND.budget.sinkPer100 * budget.delta) / 100 : 0;
    const base = info.forYou ?? info.Q ?? trip.signals?.countryScore ?? 0;
    const out = {
      ...trip,
      budget,
      match: info.F == null ? null : { pct: info.pct, bars: info.bars, conflicts: info.conflicts },
      reasons: reasonsFor(trip, { settings, info }),
      catch: catchFor(trip, { settings, info, budget }),
      score: base - sink - (pull.get(trip.id) || 0),
      qualified: RANK.fitFirst ? qualifies(info, settings) : true,
    };
    if (trip.base?.quote) Object.defineProperty(out, 'quote', { value: trip.base.quote, enumerable: false });
    Object.defineProperty(out, 'base', { value: trip.base, enumerable: false });
    return out;
  });
  return ranked.sort((a, b) => (Number(b.qualified) - Number(a.qualified)) || (b.score - a.score) || a.id.localeCompare(b.id));
}

/**
 * The trip finder in one call: the priced trips for the answers (built once
 * per answer set), ranked, with the levers applied. input: buildTrips' input.
 */
export function findTrips(input, { levers = null } = {}) {
  return rankTrips(buildTrips(input), { settings: input.settings, taste: input.taste || null, data: input.data, levers });
}
