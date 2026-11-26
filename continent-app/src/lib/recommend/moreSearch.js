/**
 * moreSearch.js, the "Van Viantra" row behind "Search more" (G12 plan rethink,
 * lane R6, explore-recommendations.md Part 3 "Rows": a library trip that
 * fits the style and window, priced by quoteTrip through the S8 path).
 *
 * Viantra's own journeys carry price ranges from the dataset, not a whole
 * trip for this party, from this home, in this window. So a journey only
 * joins the list once its route is placed on catalogue towns (the S8
 * writer, seedWriters.js journeySeed) and priced by the same engine as
 * every other trip (priceCandidate, quoteTrip). Pricing costs about 100 to
 * 180 ms a trip on a desktop (B1 L0), so this runs only when the traveller
 * taps "Search more", over a short list.
 *
 *   libraryShortlist(cards, ref, opts)       the journey cards worth loading:
 *                                            the window's month, about its
 *                                            length, countries been last
 *   journeyStops(dayPlaces)                  the route's bases in order
 *   libraryCandidate(journey, input, ref)    the journey as a finder candidate,
 *                                            or null (no base towns, or none
 *                                            on the catalogue)
 *   libraryTrips(journeys, input, ref, opts) priced and ranked, at most `max`
 *   landerPool(trip, input, opts)            G12 B7a: other trips for the place
 *                                            lander's alternatives (Another
 *                                            country, Closer, Cheaper of the
 *                                            same country), priced on request
 *
 * Honest rules: a journey with no base towns (80 of 258) is skipped, never
 * given invented towns; a ceiling keeps every trip under it; fewer than
 * ROW_MIN trips and the row is not drawn (never an empty row).
 * Pure: tests/recommendLibrary.test.mjs.
 */
import { journeySeed } from '../plan/seedWriters.js';
import { buildCandidates, fliesThere, gatewayFor, transportFor } from './candidates.js';
import { priceCandidate } from './trips.js';
import { rankTrips } from './rank.js';

/** Full journeys loaded and priced on one "Search more". */
export const LIBRARY_TRIES = 6;
/** The row shows at most this many, and only with at least ROW_MIN. */
export const LIBRARY_MAX = 4;
export const ROW_MIN = 2;
/** A journey fits the window when its nights are this close to the list's. */
export const NIGHTS_SLACK = 2;

const DAY_MS = 86400000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const up = (x) => String(x || '').toUpperCase();
const nightsOfCard = (c) => Math.max(1, (Number(c?.days) || 0) - 1);

/**
 * The journey cards worth a full load, best first. `ref` is the list's own
 * best trip: its month and nights are the window the rows compare in.
 *   opts: { settings (avoidIso2 puts countries been last), skipIso2 (none), max }
 */
export function libraryShortlist(cards, ref, { settings = null, max = LIBRARY_TRIES } = {}) {
  const month = Number(ref?.month) || 0;
  const nights = Number(ref?.nights) || 0;
  const been = new Set((settings?.avoidIso2 || []).map(up));
  const named = (settings?.places || []).filter((p) => p?.kind === 'country' && p.iso2).map((p) => up(p.iso2));
  const fits = (cards || []).filter((c) => {
    if (!c?.id) return false;
    if (month && Array.isArray(c.months) && c.months.length && !c.months.includes(month)) return false;
    if (nights && Math.abs(nightsOfCard(c) - nights) > NIGHTS_SLACK) return false;
    // Countries the traveller named are the only ones (as the finder's own pool).
    if (named.length && !named.includes(up(c.cc))) return false;
    return true;
  });
  return fits
    .map((c) => ({ c, been: been.has(up(c.cc)) ? 1 : 0, off: nights ? Math.abs(nightsOfCard(c) - nights) : 0 }))
    .sort((a, b) => (a.been - b.been) || (a.off - b.off) || a.c.id.localeCompare(b.c.id))
    .slice(0, max)
    .map((x) => x.c);
}

/** The bases in order (JourneyRoute routeStops): consecutive days in one place are one stop. */
export function journeyStops(dayPlaces) {
  const out = [];
  for (const p of dayPlaces || []) {
    if (!p?.name) continue;
    const last = out[out.length - 1];
    if (last && last.name === p.name) { last.days.push(p.day); continue; }
    out.push({ name: p.name, lat: p.lat, lon: p.lon, days: [p.day] });
  }
  return out;
}

/**
 * The journey as a finder candidate, in the list's window (ref's day out),
 * with the journey's own towns and nights. Null when the journey names no
 * base towns or none of its stops is a catalogue town.
 */
export function libraryCandidate(journey, input, ref) {
  if (!journey || !Array.isArray(journey.basecamps) || !journey.basecamps.length) return null;
  const destinations = input?.data?.destinations || {};
  const seed = journeySeed(journey, journeyStops(journey.dayPlaces), destinations);
  const stops = seed?.stops || [];
  if (!stops.length) return null;
  const places = stops.map((s) => ({ id: s.dest, nights: s.nights }));
  const nights = places.reduce((n, p) => n + p.nights, 0);
  const out = ref?.dates?.out || null;
  const settings = input.settings;
  const shape = places.length > 1 ? 'towns' : 'one';
  const first = destinations[places[0].id] || {};
  const homeFiles = [input.flights, ...Object.values(input.data?.flightsBy || {})]
    .filter((f, i, all) => f && all.findIndex((g) => g?.from === f.from) === i);
  return {
    country: first.country || journey.country || '',
    iso2: up(first.iso2 || journey.countryCode),
    shape,
    transport: transportFor(shape, settings),
    places,
    gateway: fliesThere(settings)
      ? gatewayFor(places.map((p) => p.id), { destinations, flights: homeFiles, getting: input.getting || null, out, origin: input.origin?.iata || null })
      : null,
    month: Number(ref?.month) || (out ? Number(out.slice(5, 7)) : null),
    dates: out ? { out, back: addDays(out, nights) } : null,
    datesFromSetup: false,
    nights,
    signals: { countryScore: 0, countryReasons: [], topType: null, bestMonth: null, gaps: [] },
  };
}

/** The routes a list already holds (place ids joined), so a journey never repeats one. */
export const seenRoutes = (have) => new Set((have || []).map((x) => (x.places || []).map((p) => p.id).join()));

/**
 * One journey priced as a list trip ({ ...trip, library: { id, title } }),
 * or null (no base towns, a route already in `seen`, or no price). Adds its
 * route to `seen`. G12 early results: Search more prices one at a time.
 */
export function libraryTrip(j, input, ref, { seen = new Set(), price = priceCandidate } = {}) {
  const c = libraryCandidate(j, input, ref);
  if (!c || seen.has(c.places.map((p) => p.id).join())) return null;
  let trip = null;
  try { trip = price(c, input); } catch { trip = null; }
  if (!trip) return null;
  seen.add(c.places.map((p) => p.id).join());
  // Set in place, not spread: the quote and state ride along as hidden
  // fields (trips.js keepHidden), which a spread would drop.
  trip.id = `${trip.id}~lib`;
  trip.library = { id: String(j.id), title: j.title || '' };
  return trip;
}

/**
 * The journeys priced and ranked as list trips: [{ ...trip, library: { id, title } }],
 * best first, at most `max`. A trip over a ceiling, or one whose towns the
 * list already holds, is left out; fewer than ROW_MIN gives [].
 *   opts: { have (the list's trips), max, price, rank } (price and rank for tests)
 */
export function libraryTrips(journeys, input, ref, { have = [], max = LIBRARY_MAX, price = priceCandidate, rank = null } = {}) {
  if (!input?.settings) return [];
  const seen = seenRoutes(have);
  const priced = [];
  for (const j of journeys || []) {
    const trip = libraryTrip(j, input, ref, { seen, price });
    if (trip) priced.push(trip);
  }
  const ranked = rank ? rank(priced) : rankTrips(priced, { settings: input.settings, taste: input.taste || null, data: input.data });
  const capped = input.settings.guide?.budget?.mode === 'cap';
  const list = capped ? ranked.filter((x) => !(Number.isFinite(x.budget?.delta) && x.budget.delta > 0)) : ranked;
  return list.length >= ROW_MIN ? list.slice(0, max) : [];
}

/** Trips priced for the place lander's alternatives on one "Search more". */
export const LANDER_TRIES = 6;
/** Of those, at most this many in the lander trip's own country (for Cheaper). */
const LANDER_SAME = 2;

/**
 * G12 B7a: the place lander has one priced trip and no list behind it, so
 * Another country, Closer and a Cheaper trip of the same country had
 * nothing to choose from. On request this builds the open finder's
 * candidates for the same answers with the named places dropped, takes a
 * few of the trip's own country and the rest elsewhere, and prices them
 * with the same engine. The relations, the like-for-like differences and
 * the "Not yet" rule stay in alternatives.js. -> ranked trips, or [].
 *   opts: { tries, build, price, rank } (build, price and rank for tests)
 */
export function landerPool(trip, input, { tries = LANDER_TRIES, build = buildCandidates, price = priceCandidate, rank = null } = {}) {
  if (!trip || !input?.settings) return [];
  const open = { ...input.settings, places: [] };
  const own = (trip.places || []).map((p) => p.id).join();
  let cands = [];
  try { cands = build({ ...input, settings: open }) || []; } catch { cands = []; }
  cands = cands.filter((c) => (c.places || []).map((p) => p.id).join() !== own);
  const same = cands.filter((c) => up(c.iso2) === up(trip.iso2)).slice(0, LANDER_SAME);
  const pick = [...same, ...cands.filter((c) => !same.includes(c))].slice(0, tries);
  const priced = [];
  for (const c of pick) {
    try {
      const x = price(c, input);
      if (x) priced.push(x);
    } catch { /* a trip that cannot be priced is left out */ }
  }
  return rank ? rank(priced) : rankTrips(priced, { settings: open, taste: input.taste || null, data: input.data });
}
