/**
 * seedWriters.js, every door's PlanSeed (G12 plan rethink, lane L3,
 * decision §6 "Writers"). Each tab that starts a trip builds its seed here
 * and hands it to App's one opener, openPlan(seed) (shell/useAppOpeners.js),
 * so what the source knows (the town, the stops and nights, the legs, the
 * dates and party said in a question) reaches Plan instead of a bare country.
 *
 *   placeSeed({ source, iso2, destId, name, regionId })   a place, region or country page
 *   routeSeedOf(trip, { source, destinations })           a route with stops (library trip, Kept); Saved's hearts as places (G12 L6)
 *   journeySeed(trip, stops, destinations)                a journey's route stops on the catalogue
 *   askPlanSeed (askSeed.js, apart so the app's first load does not carry the parser)
 *   openTripOf(draft, name)                               the trip open in Plan, for S15
 *   choiceStop(seed)                                      the town S15 adds to the open trip
 *
 * Pure: no React, no store, so node tests hold it (tests/planSeedWriters.test.mjs).
 */
import { makeSeed } from './seed.js';
import { cityKeyName } from '../placeName.js';
import { haversineKm } from '../nearby.js';

const PLACE_SOURCES = ['place', 'region', 'country'];
const ISO2_RE = /^[A-Za-z]{2}$/;
// A journey's stop is the catalogue town of that name, else the nearest one
// this close (a hamlet on a walk sleeps in the town beside it).
const NEAR_KM = 25;

const norm = (s) => cityKeyName(String(s || '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * "Plan a trip here" on a place, region or country page. The town is kept
 * (row T498-b: a region names its nearest priced town), not only the
 * country, and the place is pinned: Plan never asks where again.
 */
export function placeSeed({ source = 'place', iso2 = '', destId = null, name = '', regionId = null } = {}) {
  const cc = ISO2_RE.test(String(iso2 || '')) ? String(iso2).toUpperCase() : '';
  const src = PLACE_SOURCES.includes(source) ? source : 'place';
  if (!destId && !cc) return null;
  const places = destId
    ? [{ kind: 'place', id: String(destId), iso2: cc, name }]
    : [{ kind: 'country', id: cc, iso2: cc, name }];
  const ref = src === 'region' && regionId ? { kind: 'region', id: String(regionId) }
    : src === 'country' || !destId ? { kind: 'country', id: cc }
      : { kind: 'place', id: String(destId) };
  return makeSeed({ source: src, ref, label: name, places, pins: ['places'] });
}

/** A route's legs as the planner keys them: by leg index, a drive is the car. */
function legModesOf(legs) {
  const out = {};
  (Array.isArray(legs) ? legs : []).forEach((leg, i) => {
    if (leg?.mode) out[i] = leg.mode === 'drive' ? 'car' : String(leg.mode);
  });
  return out;
}

/**
 * A route with stops (a library trip's page, Saved's picks, a kept trip):
 * stops, nights, day activities, leg modes, car or public and the name.
 *   trip: { id?, name?, stops: [{ dest, nights, dayActivities? }], legs?, transport? }
 */
export function routeSeedOf(trip, { source = 'trip', destinations = null } = {}) {
  if (!trip || !Array.isArray(trip.stops)) return null;
  // G12 L6 (decision §3.2 S9): Saved's hearts are a wish, not a route (their
  // flat 2 nights were never chosen), so they land on a priced found trip:
  // the towns become named places that knowTrip routes and sizes.
  if (source === 'saved') {
    const places = trip.stops.filter((x) => x && x.dest).map((x) => {
      const d = destinations?.[x.dest] || null;
      return { kind: 'place', id: String(x.dest), iso2: d?.iso2 || '', name: cityKeyName(d?.city || '') || '' };
    });
    const wish = makeSeed({ source, label: trip.name || trip.label || '', places, pins: ['places'] });
    return wish.places.length ? wish : null;
  }
  const seed = makeSeed({
    source,
    ref: trip.id ? { kind: source, id: String(trip.id) } : null,
    label: trip.name || trip.label || '',
    stops: trip.stops,
    legModes: legModesOf(trip.legs),
    transport: trip.transport === 'car' || trip.transport === 'drive' ? 'car' : trip.transport ? 'public' : null,
    pins: ['places'],
  });
  return seed.stops.length ? seed : null;
}

/** The catalogue town for a journey stop: the same name first, else the nearest within NEAR_KM. */
function townOf(stop, byName, points) {
  const hit = byName.get(norm(stop.name));
  if (hit) return hit;
  if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return null;
  let best = null;
  for (const p of points) {
    const km = haversineKm(stop.lat, stop.lon, p.lat, p.lon);
    if (km <= NEAR_KM && (!best || km < best.km)) best = { id: p.id, km };
  }
  return best?.id || null;
}

/**
 * One of Carta's journeys (JourneyPage "Plan this trip"): its route stops
 * (JourneyRoute routeStops: { name, lat, lon, days }) placed on the
 * catalogue, each with a night for every day there and the last day the
 * day home. Before, this door handed over only the country. A journey whose
 * stops match no town still keeps its country, as a wish.
 */
export function journeySeed(trip, stops, destinations = {}) {
  if (!trip) return null;
  const byName = new Map();
  const points = [];
  for (const [id, d] of Object.entries(destinations || {})) {
    const k = norm(d?.city);
    if (k && (!byName.has(k) || (d.rating?.score || 0) > (destinations[byName.get(k)]?.rating?.score || 0))) byName.set(k, id);
    const lat = Number(d?.city_lat ?? d?.lat);
    const lon = Number(d?.city_lon ?? d?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) points.push({ id, lat, lon });
  }
  const out = [];
  for (const st of stops || []) {
    const id = townOf(st, byName, points);
    if (!id) continue;
    const n = Math.max(1, (st.days || []).length);
    const last = out[out.length - 1];
    if (last && last.dest === id) last.nights += n;
    else out.push({ dest: id, nights: n, dayActivities: [] });
  }
  if (out.length) {
    const tail = out[out.length - 1];
    if (tail.nights > 1) tail.nights -= 1;
  }
  const label = trip.title || trip.name || '';
  const ref = trip.id ? { kind: 'journey', id: String(trip.id) } : null;
  if (out.length) return makeSeed({ source: 'journey', ref, label, stops: out, pins: ['places'] });
  const cc = String(trip.countryCode || '').toUpperCase();
  return ISO2_RE.test(cc)
    ? makeSeed({ source: 'journey', ref, label, places: [{ kind: 'country', id: cc, iso2: cc, name: trip.country || '' }] })
    : null;
}

/**
 * The trip open in Plan (the planner draft with stops), for S15: its id and
 * a name to say ("Toevoegen aan <trip>"), the trip's own name else the
 * first town's. Null with no stops.
 *   draft: tripDraftStore loadTripDraft(); name: the trip settings' name
 */
export function openTripOf(draft, name = '', destinations = {}) {
  if (!draft?.stops?.length) return null;
  const first = draft.stops[0]?.destinationId;
  const town = first ? String(destinations?.[first]?.city || '').split(',')[0] : '';
  return { id: draft.planId || 'draft', name: String(name || draft.planLabel || town || '').trim() };
}

/** The town S15 adds to the open trip: the seed's first place, when it is a town. */
export function choiceStop(rawSeed) {
  const seed = makeSeed(rawSeed);
  const p = seed.places.find((x) => x.kind === 'place');
  return p ? p.id : null;
}
