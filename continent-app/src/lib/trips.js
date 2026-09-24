/**
 * trips.js, the published trip layer: ready-made itineraries of two to
 * fourteen days, composed and checked by pipeline/trips.
 *
 * A trip here is not a suggestion, it is a plan that passed ten checks. Every
 * stop is a place the catalogue already prices and rates, every leg is a
 * train, coach or drive the app's own estimator agrees exists, every day trip
 * gets you back the same evening, and every photograph comes from a file
 * whose licence was resolved. What could not be verified rides along in
 * `warned` rather than being quietly dropped, so the app can say so.
 *
 * Four artifacts, written by pipeline/trips/export_trips.py:
 *   /trips/index.json        which countries have trips, how many, which day
 *                            counts are covered, one cover photograph each
 *   /trips/top.json          the best across Europe, capped per country
 *   /trips/{CC}.json         every trip touching that country, as CARDS
 *   /trips/trip/{id}.json    one trip in full: stops, legs, days, gallery
 *
 * The card and detail split is why picking a country costs about thirty
 * kilobytes instead of a megabyte. A card carries what a grid needs to rank,
 * filter and draw; the detail arrives when a trip is opened.
 *
 * A trip that crosses a border is written into every country file it touches,
 * so browsing Austria and browsing the Czech Republic both offer the Vienna
 * to Prague route. Merging two countries therefore has to de-duplicate by id.
 *
 * Repo gotcha this file exists to contain, and the one publishedJson.js now
 * owns for every layer: under public/ a missing JSON is served as the SPA
 * index with status 200, so `r.ok` is true and `r.json()` throws on
 * "<!doctype". fetchPublished() checks the content type first and resolves
 * null instead, which is also how a country with nothing published reads. A
 * DROPPED CONNECTION is no longer folded into that null: it rejects with a
 * LayerFetchError, so the tab can say the request failed rather than claiming
 * the catalogue is empty.
 */
import { useEffect, useState } from 'react';
import { makeCache } from './publishedJson.js';
import { cityKeyName } from './placeName.js';

const COUNTRY_RE = /^[A-Z]{2}$/;
const ID_RE = /^[a-z0-9-]{3,90}$/;


const cached = makeCache();

/**
 * Which countries have trips, best first.
 *
 * `days` per country is the list of durations actually published there, which
 * is what lets the day picker grey out a length rather than offering it and
 * returning nothing.
 */
export function loadTripIndex() {
  return cached('/trips/index.json').then((raw) => {
    if (!raw || !Array.isArray(raw.countries)) return null;
    const countries = raw.countries.filter((c) => c && c.cc && c.n > 0);
    if (!countries.length) return null;
    return {
      generatedAt: raw.generated_at || null,
      model: raw.model || null,
      total: raw.n_trips || countries.reduce((n, c) => n + c.n, 0),
      dropped: raw.n_dropped || 0,
      shapes: raw.shapes || {},
      days: Array.isArray(raw.days) ? raw.days : [],
      countries,
      attribution: Array.isArray(raw.attribution) ? raw.attribution : [],
    };
  });
}

/** The best trips in Europe, best first. Its own file so the opening page
 *  does not have to fetch forty three countries to rank anything. */
export function loadTopTrips() {
  return cached('/trips/top.json').then((raw) => {
    if (!raw || !Array.isArray(raw.trips)) return null;
    return raw.trips.filter((t) => t && t.id);
  });
}

/** Every published trip touching one country, best first, or null. */
export function loadTrips(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve(null);
  return cached(`/trips/${cc}.json`).then((raw) => {
    if (!raw || !Array.isArray(raw.trips)) return null;
    return raw.trips.filter((t) => t && t.id && Number.isFinite(t.days));
  });
}

/** Several countries at once, de-duplicated by id and re-ranked. A trip that
 *  visits two of the chosen countries appears once. */
export function loadTripsFor(countries) {
  return Promise.all((countries || []).map((cc) => loadTrips(cc)))
    .then((lists) => {
      const seen = new Map();
      for (const rows of lists) {
        for (const t of rows || []) if (!seen.has(t.id)) seen.set(t.id, t);
      }
      return [...seen.values()].sort((a, b) => b.score - a.score);
    });
}

/** One trip in full. Null when the file is absent, which after a re-export
 *  means the trip no longer passes its checks. */
export function loadTrip(id) {
  const key = String(id || '');
  if (!ID_RE.test(key)) return Promise.resolve(null);
  return cached(`/trips/trip/${encodeURIComponent(key)}.json`).then((raw) => {
    if (!raw || !raw.id || !Array.isArray(raw.stops) || !raw.stops.length) return null;
    return raw;
  });
}

/* ── Filtering, the two questions the Trips view asks ───────────────────── */

/**
 * How well a published trip answers "I have N days".
 *
 * Exact is exact. One day either way is a real answer too, because a seven
 * day trip is a perfectly good eight day trip with a slow morning in it, and
 * refusing to say so leaves a traveller staring at an empty page for the two
 * day counts nobody composed. Anything further out is not offered.
 */
export function daysFit(trip, days) {
  if (!days) return 0;
  const gap = Math.abs((trip.days || 0) - days);
  if (gap === 0) return 2;
  if (gap === 1) return 1;
  return 0;
}

/**
 * The sights worth naming on a trip card, minus the ones that only repeat a
 * stop. The published sight list is drawn from the destinations on the route,
 * so a city sometimes appears as its own landmark: the Bruges-and-Paris card
 * read "Madonna of Bruges, Paris, Groeningemuseum", where "Paris" tells a
 * traveller nothing the route line above it did not already say.
 *
 * Matching is on a folded name (case, accents and the airport qualifier
 * dropped), so "Paris (CDG)" as a stop still silences a "Paris" sight.
 */
export function tripSights(trip) {
  const stops = new Set(
    (trip?.cities || [])
      .map((c) => foldPlace(c.city))
      .filter(Boolean),
  );
  return (trip?.sights || []).filter((s) => !stops.has(foldPlace(s)));
}

/** Lowercased, accent-folded, airport-qualifier-free form used to compare a
 *  sight name against a stop name. */
function foldPlace(name) {
  return cityKeyName(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export const ARCHETYPES = ['base', 'chain', 'loop'];

/**
 * Rank a set of trip cards for one search.
 *
 * Exact day matches always sort above near ones, because a person who asked
 * for five days is not looking for a six day trip until they have seen the
 * five day ones. Under that it is the score, which already carries the
 * checks.
 */
export function rankTrips(trips, {
  days = null, shapes = null, themes = null, pace = null, scale = null,
} = {}) {
  const wantShapes = shapes && shapes.length ? new Set(shapes) : null;
  const wantThemes = themes && themes.length ? new Set(themes) : null;
  const rows = (trips || [])
    .map((t) => ({ t, fit: days ? daysFit(t, days) : 2 }))
    .filter(({ t, fit }) => {
      if (days && fit === 0) return false;
      if (pace && t.pace !== pace) return false;
      if (scale && t.scale !== scale) return false;
      if (wantShapes && !wantShapes.has(t.archetype)) return false;
      if (wantThemes && !(t.themes || []).some((x) => wantThemes.has(x))) return false;
      return true;
    })
    .sort((a, b) => (b.fit - a.fit) || (b.t.score - a.t.score)
      || a.t.id.localeCompare(b.t.id))
    .map(({ t, fit }) => (fit === 2 ? t : { ...t, nearFit: true }));

  // With no length asked for, the same route comes back once per day count it
  // was composed at: "Naples and Rome" at five, six, seven and ten days, four
  // times over with one photograph between them. They are the same trip to
  // anyone reading the page, so the best-scoring length stands for the rest
  // and the card says which other lengths exist.
  if (days) return rows;
  const seen = new Map();
  for (const t of rows) {
    const key = `${t.archetype}|${t.pace}|${t.scale}|${t.cities.map((c) => c.city).join('>')}`;
    const kept = seen.get(key);
    if (kept) kept.alsoDays.push(t.days);
    else seen.set(key, { ...t, alsoDays: [] });
  }
  return [...seen.values()].map((t) => (t.alsoDays.length
    ? { ...t, alsoDays: t.alsoDays.sort((a, b) => a - b) }
    : t));
}

/**
 * Collapse the same route at different lengths into one card.
 *
 * The published set composes a route at every day count it works at, so
 * "Bruges and Paris" comes back at five, six and seven days: three cards, one
 * photograph, one ordered list of cities. To anybody reading the step they are
 * one trip with a dial on it, so they become one card whose length chips say
 * which dials exist.
 *
 * rankTrips already does a version of this, but only when NO length is asked
 * for, and it keys on shape, pace and scale as well, so a five and a six day
 * run of the same cities stay apart. This one keys on the ordered city
 * sequence alone, which is what the card actually prints, and runs after the
 * ranking so the best-scoring variant leads.
 *
 * `days` is the traveller's own window. The variant nearest it is the one
 * preselected, because a person with six days who is shown a "5 - 6 - 7" card
 * should be looking at the six day version before they touch anything. Ties go
 * to the longer trip: with five days asked for and four and six on offer, six
 * is the one that fits by having a slow morning in it.
 *
 * Returns cards, each carrying:
 *   variants  every trip of this route, ascending by days
 *   days      the preselected length (and the card IS that trip)
 * A route published at one length only comes back with a single variant, which
 * the card reads as "no chips".
 */
export function groupTripVariants(trips, days = null) {
  const groups = new Map();
  for (const t of trips || []) {
    if (!t || !Array.isArray(t.cities)) continue;
    const key = t.cities.map((c) => cityKeyName(c.city)).join('>');
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.values()].map((rows) => {
    // One variant per day count. The same cities are also composed at several
    // paces and shapes, so a route can arrive twice at seven days; two chips
    // both reading "7 days" is a choice with no difference in it, so the
    // best-scoring of each length stands for that length. `rows` is already in
    // ranked order, so the first of each is the one to keep.
    const byDays = new Map();
    for (const t of rows) if (!byDays.has(t.days)) byDays.set(t.days, t);
    const variants = [...byDays.values()].sort((a, b) => a.days - b.days);
    if (variants.length === 1) return { ...variants[0], variants };
    const best = days
      ? variants.reduce((a, b) => {
        const da = Math.abs((a.days || 0) - days);
        const db = Math.abs((b.days || 0) - days);
        // Equally far away: the longer one wins.
        return db < da || (db === da && (b.days || 0) > (a.days || 0)) ? b : a;
      })
      // No window to aim at, so the ranking's own winner stands.
      : rows[0];
    return { ...best, variants };
  });
}

/** Which day counts this set of trips can actually answer. */
export function availableDays(trips) {
  return [...new Set((trips || []).map((t) => t.days))].sort((a, b) => a - b);
}

/* ── Share links ───────────────────────────────────────────────────────── */

// Read once at startup: React's double-invoked StrictMode mount would
// otherwise lose the value to the first strip. Same contract as trails.js.
let tripReadResult;

export function readTripFromUrl() {
  if (tripReadResult !== undefined) return tripReadResult;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#') || !hash.includes('itin=')) return (tripReadResult = null);
  const params = new URLSearchParams(hash.slice(1));
  const id = String(params.get('itin') || '').slice(0, 90);
  if (!ID_RE.test(id)) return (tripReadResult = null);
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* the trip still opens; only the address bar stays busy */ }
  return (tripReadResult = { id });
}

/** The link that reopens one trip, for the share sheet. */
export function tripShareUrl(trip) {
  if (typeof window === 'undefined' || !trip) return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#itin=${encodeURIComponent(trip.id)}`;
}

/** The published trips of a country, or null while loading. */
export function useTrips(country) {
  const [trips, setTrips] = useState(null);
  useEffect(() => {
    let live = true;
    setTrips(null);
    if (country) loadTrips(country).then((rows) => { if (live) setTrips(rows); });
    return () => { live = false; };
  }, [country]);
  return trips;
}
