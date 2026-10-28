/**
 * The trips the trip finder will price (TF1, T793): from the traveller's
 * answers to a short list of candidate trips, each a country, one to three
 * places with their nights, a gateway airport, a month and dates.
 *
 *   1. countries   matchCountries (lib/countryMatch.js) on the Help me
 *                  choose answers (quizAnswers), places inside a country
 *                  already ordered by forYou (lib/match.js)
 *   2. shapes      one place; a few towns (2 or 3, nights split by the
 *                  planner's auto-balance rule); a road trip (more places,
 *                  a hire car). Several countries and one way from A to B
 *                  fall back to a few towns this batch (row T793-a).
 *   3. gateway     the airport of the first place with a swept fare from
 *                  the origin (pickAirport, else the place's own airport);
 *                  no flying drives from home, or goes by train
 *   4. dates       the setup dates, else config recommend.json: its nights
 *                  in the best month of the trip's places for the weather
 *                  answer
 *
 * Every number lives in config/recommend.json. Pure and node-runnable.
 */
import RECOMMEND from '../../../config/recommend.json' with { type: 'json' };
import { matchCountries } from '../countryMatch.js';
import { qualityOf } from '../match.js';
import { pickAirport } from '../airportPick.js';
import { destAnchor } from '../origins.js';
import { haversineKm } from '../runtime_pricing.js';
import { sweptNear, sweptCheapest } from '../flights/flights.js';
import { tripTaste, normalizeTaste } from '../taste.js';
import { quizAnswers, spendFor } from '../../planner/flow/tripSettings.js';

export const CANDIDATES = Object.freeze(RECOMMEND.candidates);
const DATES = RECOMMEND.dates;
const GATEWAY = RECOMMEND.gateway;
const MONTH = RECOMMEND.month;

const DAY_MS = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const utc = (s) => Date.parse(`${s}T00:00:00Z`);
const nightsBetween = (a, b) => (a && b ? Math.max(0, Math.round((utc(b) - utc(a)) / DAY_MS)) : 0);
const todayIso = (today) => (typeof today === 'string' ? today.slice(0, 10) : iso((today ?? new Date()).getTime()));

/**
 * Split a trip's nights over its places the planner's way (GuidedTripWizard
 * rebalanceAuto): an even share each, the nights left over to the first
 * places, never under one.
 */
export function splitNights(total, n) {
  const base = Math.floor(total / n);
  let extra = total - base * n;
  return Array.from({ length: n }, () => {
    const v = Math.max(1, base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra -= 1;
    return v;
  });
}

/** The traveller's own month (1 to 12) from the setup, or null. */
export function setupMonth(settings) {
  const w = settings.when;
  if (w.mode === 'exact' && w.start) return Number(w.start.slice(5, 7));
  if (w.mode === 'months' && w.months.length) return w.months[0];
  return null;
}

/** The months to choose from: the next `lookAheadMonths`, starting next month. */
function monthsAhead(today) {
  const m0 = Number(todayIso(today).slice(5, 7));
  return Array.from({ length: Math.min(12, DATES.lookAheadMonths) }, (_, k) => ((m0 + k) % 12) + 1);
}

/**
 * The best month for these places: the mean high closest to what the
 * weather answer asks (config month.tmaxByWeather), or with no weather
 * answer the best month score. Earlier months win ties.
 */
export function bestMonth(dests, weather, today) {
  const target = MONTH.tmaxByWeather[weather];
  let best = null;
  for (const m of monthsAhead(today)) {
    let score = null;
    if (target != null) {
      const highs = dests.map((d) => d?.taste?.tmax_by_month?.[m - 1]).filter(Number.isFinite);
      if (highs.length) score = -Math.abs(highs.reduce((s, v) => s + v, 0) / highs.length - target);
    } else {
      const qs = dests.map((d) => qualityOf(d, m)).filter(Number.isFinite);
      if (qs.length) score = qs.reduce((s, v) => s + v, 0) / qs.length;
    }
    if (score != null && (!best || score > best.score)) best = { m, score };
  }
  return best?.m ?? monthsAhead(today)[1];
}

/** The first `startWeekday` (config, 6 = Saturday) of the next time month m comes round after today. */
export function startIn(month, today) {
  const t = todayIso(today);
  for (const y of [Number(t.slice(0, 4)), Number(t.slice(0, 4)) + 1]) {
    let ms = Date.UTC(y, month - 1, 1);
    while (new Date(ms).getUTCDay() !== DATES.startWeekday) ms += DAY_MS;
    if (iso(ms) > t) return iso(ms);
  }
  return null;
}

/** The trip's nights and dates: the setup's, else the config's nights in `month`. */
export function datesFor(settings, month, today) {
  const w = settings.when;
  if (w.mode === 'exact' && w.start) {
    const nights = w.end ? nightsBetween(w.start, w.end) || w.nights : w.nights;
    return { nights, out: w.start, back: iso(utc(w.start) + nights * DAY_MS), fromSetup: true };
  }
  const nights = settings.answered.includes('when') ? w.nights : DATES.nights;
  const out = startIn(month, today);
  return { nights, out, back: out ? iso(utc(out) + nights * DAY_MS) : null, fromSetup: false };
}

/** The trip shapes to build, with the shapes this batch cannot build yet. */
export function shapesFor(settings) {
  const asked = settings.guide.shapes.length ? settings.guide.shapes : CANDIDATES.anyShapes;
  const noCar = settings.guide.avoid.includes('car');
  const gaps = asked.filter((s) => CANDIDATES.fallbackShapes[s]);
  const shapes = [...new Set(asked.map((s) => CANDIDATES.fallbackShapes[s] || s))]
    .filter((s) => !(s === 'road' && noCar));
  return { shapes: shapes.length ? shapes : ['one'], gaps };
}

/** How many places a shape takes for `nights`, or null when it does not fit. */
function placesFor(shape, nights) {
  if (shape === 'one') return 1;
  const per = (shape === 'road' ? CANDIDATES.road : CANDIDATES.towns).minNightsPerPlace;
  const n = Math.min(CANDIDATES.towns.maxPlaces, Math.floor(nights / per));
  return n >= 2 ? n : null;
}

const kmBetween = (a, b) => haversineKm(a.lat, a.lon, b.lat, b.lon);

/**
 * The places of a trip, best first: the country's best place, then the
 * next best within reach of it (config towns or road maxKm) and not on top
 * of one already taken (minKm, so the Lake District and Keswick are one
 * stop). Null when fewer than `n` fit.
 */
export function placesNear(ids, n, shape, destinations) {
  const lim = shape === 'road' ? CANDIDATES.road : CANDIDATES.towns;
  const taken = [];
  for (const id of ids) {
    const d = destinations[id];
    if (!d || d.lat == null) continue;
    const ok = !taken.length || (kmBetween(destinations[taken[0]], d) <= lim.maxKm
      && taken.every((t) => kmBetween(destinations[t], d) >= lim.minKm));
    if (ok) taken.push(id);
    if (taken.length === n) return taken;
  }
  return null;
}

/** How the trip gets there and around, from its shape and the reach answer. */
export function transportFor(shape, settings) {
  const noCar = settings.guide.avoid.includes('car');
  if (settings.guide.reach === 'overland') return noCar ? 'train' : 'owncar';
  return shape === 'road' ? 'car' : 'auto';
}

const transferMinutes = (d) => (d?.tier === 'airport' ? 0 : d?.transfer?.transfer_minutes_one_way ?? null);

/** The catalogue's airport rows nearest a place, within config gateway.nearKm, nearest first. */
function nearAirports(d, destinations) {
  if (d?.lat == null) return [];
  const rows = [];
  for (const [id, a] of Object.entries(destinations)) {
    if (a?.tier !== 'airport' || a.lat == null || id === d.id) continue;
    const km = kmBetween(d, a);
    if (km <= GATEWAY.nearKm) rows.push({ id, km });
  }
  return rows.sort((x, y) => x.km - y.km).slice(0, GATEWAY.nearMax).map((r) => r.id);
}

/**
 * The gateway airport: the first place, in trip order, whose airport has a
 * swept fare from the origin near the day out (or that month). Each place's
 * airport is the best one pickAirport names (when its getting there is
 * known), else its own anchor; a place with neither (a ground-only gem)
 * tries the catalogue's nearest airports, and the engine prices the
 * transfer from there. With no fare anywhere, the first place's airport,
 * marked unswept. Null when the trip does not fly.
 */
export function gatewayFor(placeIds, { destinations, flights, getting, out, origin }) {
  const ym = out ? out.slice(0, 7) : null;
  let first = null;
  // First every place's own airports, then the airports near each place.
  const tries = [false, true].flatMap((near) => placeIds.map((id) => ({ id, near })));
  for (const { id, near } of tries) {
    const d = destinations[id];
    const pick = getting ? pickAirport(getting(id)) : null;
    const own = [pick?.iata, destAnchor(d)].filter(Boolean);
    if (near && !flights) break;
    const airports = near ? nearAirports(d, destinations).filter((a) => !own.includes(a)) : own;
    for (const iata of airports) {
      if (iata === origin) continue;
      const named = pick?.iata === iata;
      const anchored = destAnchor(d) === iata;
      const via = {
        iata,
        minutes: named ? pick.minutes : anchored ? transferMinutes(d) : null,
        mode: named ? pick.mode : null,
        placeId: id,
      };
      if (!first) first = via;
      if (flights && (sweptNear(flights, 'out', iata, out) || sweptCheapest(flights, 'out', iata, ym))) {
        return { ...via, swept: true };
      }
    }
  }
  return first ? { ...first, swept: false } : null;
}

/**
 * The taste these answers rank with (lib/taste.js): the saved taste with
 * the trip's likes in its place (tripTaste, as Help me choose does), quiet
 * when the traveller avoids crowds and no car when they avoid one, so
 * fit() can name the busy month and the car the trip would need.
 */
export function tasteFor(settings, saved = null) {
  const t = tripTaste(saved, settings.guide.likes);
  const avoid = settings.guide.avoid;
  return normalizeTaste({
    ...t,
    quiet: avoid.includes('crowds') ? 'quiet' : t.quiet,
    noCar: avoid.includes('car') ? true : t.noCar,
  });
}

/**
 * The candidate trips for one answer set, best country first, at most
 * config candidates.max.
 *
 * input: { data, countryInsights, layerIndexes, settings, taste (the saved
 *          one; tasteFor makes the trip's), origin:
 *          { iata, lat, lon }, flights (the origin's swept file), getting
 *          (id -> getting there, or none), today }
 */
export function buildCandidates(input) {
  const { data, countryInsights = null, layerIndexes = {}, settings, taste = null, origin = null, flights = null, getting = null, today } = input;
  const destinations = data?.destinations || {};
  const answers = quizAnswers(settings, spendFor(settings));
  const fixedMonth = setupMonth(settings);
  const countries = matchCountries({
    destinations,
    insights: countryInsights,
    layerIndexes,
    answers,
    month: fixedMonth,
    origin: origin?.lat != null ? { lat: origin.lat, lon: origin.lon } : null,
    taste: tasteFor(settings, taste),
    topN: CANDIDATES.placesPerCountry,
  }).slice(0, CANDIDATES.countries);

  const { shapes, gaps } = shapesFor(settings);
  const flies = settings.guide.reach !== 'overland';
  const build = (c, shape, ids) => {
    const dests = ids.map((id) => destinations[id]);
    const month = fixedMonth ?? bestMonth(dests, settings.guide.weather, today);
    const dates = datesFor(settings, month, today);
    const n = placesFor(shape, dates.nights);
    const placeIds = n == null ? null : placesNear(ids, n, shape, destinations);
    if (!placeIds) return null;
    const nights = splitNights(dates.nights, n);
    return {
      country: c.country,
      iso2: c.iso2,
      shape,
      transport: transportFor(shape, settings),
      places: placeIds.map((id, i) => ({ id, nights: nights[i] })),
      gateway: flies
        ? gatewayFor(placeIds, { destinations, flights, getting, out: dates.out, origin: origin?.iata || null })
        : null,
      month,
      dates: dates.out ? { out: dates.out, back: dates.back } : null,
      datesFromSetup: dates.fromSetup,
      nights: dates.nights,
      signals: { countryScore: c.score, countryReasons: c.reasons, topType: c.topType, bestMonth: c.bestMonth, gaps },
    };
  };

  const out = [];
  const seen = new Set();
  const push = (cand) => {
    if (!cand || out.length >= CANDIDATES.max) return;
    const key = `${cand.places.map((p) => p.id).join(',')}|${cand.transport}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cand);
  };
  for (const c of countries) {
    for (const shape of shapes) push(build(c, shape, c.topPlaces));
  }
  // Too few trips: the second-best place of each country, on its own.
  for (const c of countries) {
    if (out.length >= CANDIDATES.min) break;
    if (c.topPlaces.length > 1) push(build(c, 'one', c.topPlaces.slice(1)));
  }
  return out;
}
