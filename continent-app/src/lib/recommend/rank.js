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
 *   3. order    by the blend (T884, owner 2026-10-30): the answers (the
 *               fit F with the persona's fit P) lead and the places' quality
 *               follows, config rank.blend; trips over the typed budget sink
 *               by budget.sinkPer100 points (of 10) a hundred euros over.
 *               The match badge is the same number, so the sort follows it
 *
 * The match shows on Help me choose even while persona gate 7 fails
 * (owner, 2026-10-28), while the fit reads match.show_min or more; Explore
 * keeps For you (Q + lambda (F - 0.5)) as its sort. One amount, no bands (price rule 2). Pure; the trips are not
 * changed, every call returns new ones.
 */
import RECOMMEND from '../../../config/recommend.json' with { type: 'json' };
import { chooseOption } from './slots.js';
import { buildTrips, keepHidden, repriceTrip } from './trips.js';
import { tasteFor } from './candidates.js';
import { tripFit, reasonsFor, catchFor } from './reasons.js';
import { flightLeverKeys } from './adapters/flight.js';
import { personaOf, picksOf, personaReason, tripPersona } from './persona.js';

export const RANK = Object.freeze(RECOMMEND.rank);
export const LEVERS = Object.freeze(RECOMMEND.levers);
const BLEND = RANK.blend;

/**
 * The trip's blended score in 0..1 before the budget and the flight lever:
 * the answers (F, mixed with the persona's P when there is one) weighed
 * against the places' quality (Q, on the 0..10 rating scale). Either side
 * alone when the other is missing; null when both are.
 */
export function blendOf(F, P, Q) {
  const answers = F == null ? P : P == null ? F : (1 - BLEND.persona_w) * F + BLEND.persona_w * P;
  const quality = Q == null ? null : Q / 10;
  if (answers == null) return quality;
  if (quality == null) return answers;
  return BLEND.answers_w * answers + BLEND.quality_w * quality;
}

/** The badge's figure for a score in 0..1: a whole percent, never 100. */
export const matchPct = (score) => Math.max(0, Math.min(99, Math.round(score * 100)));

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
  const key = JSON.stringify(swaps);
  return out.map((t) => {
    // A levered trip is priced again as a whole (T819, repriceTrip), once
    // per trip and lever setting: the list, the preview and Finish then
    // read the same figure.
    const base = t.base || t;
    let byKey = levered.get(base);
    if (!byKey) levered.set(base, (byKey = new Map()));
    if (!byKey.has(key)) {
      const slots = t.slots.map((s) => {
        const sw = swaps.find((x) => x.slot === s.id);
        return sw ? chooseOption(s, sw.option) : s;
      });
      const changed = slots.some((s, i) => s !== t.slots[i]);
      byKey.set(key, changed ? repriceTrip(keepHidden(t, { ...t, slots })) : null);
    }
    const priced = byKey.get(key);
    return priced ? keepHidden(priced, { ...t, slots: priced.slots, total: priced.total }) : t;
  });
}

// Levered trips by their base trip and lever setting (applyLevers).
const levered = new WeakMap();

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
    // The persona (owner, plan flow walk): P the trip's places' persona fit
    // by nights (persona.js), part of the answers in the blend; its reason
    // leads the card.
    const persona = personaOf(settings.guide);
    const p = tripPersona(trip, persona, destinations);
    const said = personaReason(trip, persona, destinations);
    const quality = info.Q ?? trip.signals?.countryScore ?? null;
    const score = (blendOf(info.F, p, quality) ?? 0) - sink / 10 - (pull.get(trip.id) || 0) / 10;
    const out = {
      ...trip,
      budget,
      // pct is the ranked score (T884), shown while the fit itself reads
      // show_min or more; fit is the answers alone, for the trip page.
      match: info.F == null ? null : { pct: info.pct == null ? null : matchPct(score), fit: info.pct, bars: info.bars, conflicts: info.conflicts },
      persona: p == null ? null : { id: picksOf(persona)[0]?.id || null, p },
      reasons: said ? [said, ...reasonsFor(trip, { settings, info })].slice(0, RECOMMEND.reasons.max) : reasonsFor(trip, { settings, info }),
      catch: catchFor(trip, { settings, info, budget }),
      score,
      qualified: RANK.fitFirst ? qualifies(info, settings) : true,
    };
    Object.defineProperty(out, 'base', { value: trip.base, enumerable: false });
    // A levered trip keeps its own quote and state (T819); else the base's.
    const own = trip.quote ? trip : trip.base;
    return own ? keepHidden(own, out) : out;
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
