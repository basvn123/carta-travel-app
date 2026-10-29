/**
 * Why a trip fits, and its one honest catch (TF1, T794).
 *
 * The fit of a trip is the fit of its places (lib/match.js fit()), each
 * weighed by its nights. The reasons and the catch are i18n keys with the
 * facts behind them (tf.reason.*, tf.catch.*), in the traveller's terms:
 * "You said Hiking: Vintgar Gorge, 12 min from Bled", never "great for
 * hiking". A screen renders them; nothing here formats a word or a sum.
 *
 *   reasons  up to config reasons.max: the strongest likes with their facts,
 *            then the month's weather, then the travel time
 *   catch    the first of: a fit conflict (busy month for a quiet
 *            traveller, a car needed for one without, heat), over budget,
 *            a long travel day; else the softer ones (a busier month, no
 *            flight price yet, the weakest like)
 */
import RECOMMEND from '../../../config/recommend.json' with { type: 'json' };
import { fit, qualityOf, MATCH } from '../match.js';

const R = RECOMMEND.reasons;
const C = RECOMMEND.catch;

const meanOf = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

/**
 * The fit of a whole trip: { F, pct, bars, conflicts, Q, forYou, places }
 * or null when no place could be weighed. bars and conflicts are merged
 * over the places (a bar's p is the nights-weighted mean, its fact the
 * best place's); pct is null below match.show_min.
 */
export function tripFit(trip, taste, destinations, { avoidHeat = false } = {}) {
  const month = trip.month;
  const places = trip.places.map((p) => {
    const d = destinations[p.id];
    return { id: p.id, nights: p.nights, d, f: d ? fit(taste, d.taste, month, { avoidHeat }) : null, q: d ? qualityOf(d, month) : null };
  });
  const qs = places.filter((x) => x.q != null);
  const nq = qs.reduce((n, x) => n + x.nights, 0);
  const Q = nq ? qs.reduce((s, x) => s + x.q * x.nights, 0) / nq : null;
  const fitted = places.filter((x) => x.f);
  if (!fitted.length) return { F: null, pct: null, bars: [], conflicts: [], Q, forYou: Q, places };
  const nf = fitted.reduce((n, x) => n + x.nights, 0);
  const F = fitted.reduce((s, x) => s + x.f.F * x.nights, 0) / nf;

  const bars = new Map();
  for (const x of fitted) {
    for (const b of x.f.bars) {
      const cur = bars.get(b.key) || { key: b.key, kind: b.kind, sum: 0, w: 0, best: null };
      cur.sum += b.p * x.nights;
      cur.w += x.nights;
      if (!cur.best || b.p > cur.best.p) cur.best = { p: b.p, fact: b.fact, placeId: x.id, place: x.d.city };
      bars.set(b.key, cur);
    }
  }
  const conflicts = new Map();
  for (const x of fitted) {
    for (const c of x.f.conflicts) {
      if (!conflicts.has(c.key)) conflicts.set(c.key, { ...c, placeId: x.id, place: x.d.city });
    }
  }
  return {
    F,
    pct: F >= MATCH.show_min ? Math.round(F * 100) : null,
    bars: [...bars.values()].map((b) => ({ key: b.key, kind: b.kind, p: b.sum / b.w, fact: b.best.fact, placeId: b.best.placeId, place: b.best.place })),
    conflicts: [...conflicts.values()],
    Q,
    forYou: Q == null ? null : Q + MATCH.lambda * (F - 0.5),
    places,
  };
}

/** The mean high of the trip's places in its month, or null. */
function monthHigh(info, month) {
  return meanOf(info.places.map((x) => x.d?.taste?.tmax_by_month?.[month - 1]).filter(Number.isFinite));
}

/** The highest crowd tier of the trip's places in its month, or null. */
function monthCrowd(info, month) {
  const tiers = info.places.map((x) => ({ t: x.d?.taste?.crowd_by_month?.[month - 1], place: x.d?.city })).filter((x) => Number.isFinite(x.t));
  return tiers.length ? tiers.reduce((a, b) => (b.t > a.t ? b : a)) : null;
}

/** A like bar as a reason: the like, its best nearby thing and how far, the place. */
function likeReason(b) {
  const f = b.fact || {};
  const base = { like: b.key, place: b.place };
  if (f.best && Number.isFinite(f.minutes)) return { key: 'tf.reason.near', facts: { ...base, best: f.best, minutes: f.minutes, n: f.n ?? null } };
  if (f.best) return { key: 'tf.reason.nearNoTime', facts: { ...base, best: f.best, n: f.n ?? null } };
  if (f.unesco) return { key: 'tf.reason.unesco', facts: base };
  if (Number.isFinite(f.heritage)) return { key: 'tf.reason.heritage', facts: { ...base, n: f.heritage } };
  if (f.known) return { key: 'tf.reason.food', facts: base };
  return { key: 'tf.reason.like', facts: base };
}

/** The flight facts the flight slot carries (T795), or null. */
const flightFacts = (trip) => trip.slots.find((s) => s.id === 'flight')?.pick?.facts || null;

/**
 * Up to three reasons, in the traveller's terms.
 * ctx: { settings, info (tripFit) }
 */
export function reasonsFor(trip, { settings, info }) {
  const out = [];
  const likes = new Set(settings.guide.likes);
  const strong = info.bars
    .filter((b) => b.kind === 'like' && likes.has(b.key) && b.p >= 0.5)
    .sort((a, b) => b.p - a.p);
  for (const b of strong.slice(0, R.maxLikes)) out.push(likeReason(b));

  const target = RECOMMEND.month.tmaxByWeather[settings.guide.weather];
  const high = monthHigh(info, trip.month);
  if (target != null && settings.guide.weather !== 'snow' && high != null && Math.abs(high - target) <= R.weatherWithinC) {
    out.push({ key: 'tf.reason.weather', facts: { c: Math.round(high), month: trip.month } });
  }
  if (settings.guide.avoid.includes('crowds')) {
    const crowd = monthCrowd(info, trip.month);
    if (crowd && crowd.t <= 1) out.push({ key: 'tf.reason.quiet', facts: { month: trip.month } });
  }
  const fl = flightFacts(trip);
  if (fl && fl.stops === 0 && Number.isFinite(fl.minutes)) {
    out.push({ key: 'tf.reason.direct', facts: { minutes: fl.minutes, airline: fl.airline || null } });
  } else if (trip.gateway && Number.isFinite(trip.gateway.minutes) && trip.gateway.minutes > 0 && trip.gateway.minutes <= R.airportCloseMin) {
    // A gateway 0 min away is the place's own airport row, not a reason (TF2 end check: "0 min from PRG airport").
    out.push({ key: 'tf.reason.closeAirport', facts: { minutes: trip.gateway.minutes, iata: trip.gateway.iata } });
  }
  for (const b of strong.slice(R.maxLikes)) out.push(likeReason(b));
  return out.slice(0, R.max);
}

/**
 * The one honest downside, or null when the data has none to name.
 * ctx: { settings, info (tripFit), budget }
 */
export function catchFor(trip, { info, budget }) {
  const order = ['busy', 'car', 'heat'];
  const conflict = order.map((k) => info.conflicts.find((c) => c.key === k)).find(Boolean);
  if (conflict) {
    const facts = { place: conflict.place, month: conflict.month ?? trip.month };
    if (conflict.key === 'heat') facts.c = Math.round(monthHigh(info, trip.month) ?? MATCH.heat_max_c);
    return { key: `tf.catch.${conflict.key}`, facts };
  }
  if (budget && budget.delta > 0) return { key: 'tf.catch.budget', facts: { over: budget.delta, eur: budget.eur } };
  if (trip.gateway && Number.isFinite(trip.gateway.minutes) && trip.gateway.minutes > C.longTransferMin) {
    return { key: 'tf.catch.longDay', facts: { minutes: trip.gateway.minutes, iata: trip.gateway.iata } };
  }
  const fl = flightFacts(trip);
  if (fl && fl.stops > 0 && Number.isFinite(fl.minutes) && fl.minutes > C.longFlightMin) {
    return { key: 'tf.catch.longFlight', facts: { minutes: fl.minutes, stops: fl.stops } };
  }
  const crowd = monthCrowd(info, trip.month);
  if (crowd && crowd.t >= C.crowdTier) return { key: 'tf.catch.crowds', facts: { place: crowd.place, month: trip.month } };
  const flight = trip.slots.find((s) => s.id === 'flight');
  if (trip.gateway && flight && flight.eur == null) return { key: 'tf.catch.noFlight', facts: { iata: trip.gateway.iata } };
  const weak = info.bars.filter((b) => b.kind === 'like' && b.p < 0.5).sort((a, b) => a.p - b.p)[0];
  if (weak) return { key: 'tf.catch.weakLike', facts: { like: weak.key } };
  return null;
}
