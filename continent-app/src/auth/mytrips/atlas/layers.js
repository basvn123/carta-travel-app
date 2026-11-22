/**
 * What the light Europe plate draws on each My trips tab (G12, Phase B):
 * the frame to show, the routes, the stops, "here", the four corners and the
 * labels, all already on the plate's viewBox (project.js). The panel hands
 * in plain trips; AtlasPlate draws what comes out.
 *
 * A trip here is { id, title, start, countries: [ISO], stops: [{ city, lat, lon }] }.
 * Examples are never passed in: the record counts the traveller's own trips.
 *
 * Pure: no React, no i18n, no storage.
 */
import { project } from './project.js';
import { firstVisitYear, extremes, tripYear } from '../../../lib/atlasFacts.js';

/** The whole catalogue in one frame (the plate's own corners, a little in). */
export const WHOLE = Object.freeze([[70, 60], [960, 1000]]);

const located = (stops = []) => stops
  .map((s) => {
    const p = project(s?.lat, s?.lon);
    return p ? { ...s, x: p[0], y: p[1] } : null;
  })
  .filter(Boolean);

const xy = (s) => [s.x, s.y];

/**
 * The umber ramp step per first-visit year: 4 is the newest year (umber
 * 800), then 3, 2, 1 (700, 600, 500) and 0 (umber 300) for the fifth year
 * back and every year before it, so the oldest reads lightest.
 * @returns {{ [year]: 0|1|2|3|4 }}
 */
export function rampOf(firstYear = {}) {
  const ys = [...new Set(Object.values(firstYear))].filter(Number.isFinite).sort((a, b) => a - b);
  const out = {};
  ys.forEach((y, i) => { out[y] = Math.max(0, 4 - (ys.length - 1 - i)); });
  return out;
}

/**
 * The Trips tab. `today` is the trip under way with `todayAt` from
 * lib/myTrips.tripToday; `ahead` the trips to come, the next one first.
 * The next stop takes the one saffron point (decision 2).
 */
export function tripsLayer({ today = null, todayAt = null, ahead = [], past = [] } = {}) {
  if (today) {
    const stops = located(today.stops);
    if (stops.length) {
      const at = Math.min(Math.max(0, todayAt?.stopIndex ?? 0), stops.length - 1);
      const nextStop = stops[at + 1] || null;
      // G12 atlas: the legs travelled are drawn thick, the legs to come thin
      // and dashed; today's stop carries the umber "here" mark. The saffron
      // is today's bead on the journey line, so no stop here takes it.
      const id = today.id || 'today';
      const routes = [];
      if (at > 0) routes.push({ id: `${id}:done`, pts: stops.slice(0, at + 1).map(xy), kind: 'done' });
      if (at < stops.length - 1) routes.push({ id: `${id}:ahead`, pts: stops.slice(at).map(xy), kind: 'ahead' });
      return {
        state: 'today',
        focus: stops.map(xy), pad: 0.35, minW: 220,
        routes,
        stops: stops.map((s, i) => ({ x: s.x, y: s.y, here: i === at })).filter((s) => !s.here),
        here: xy(stops[at]),
        labels: [stops[at], nextStop].filter((s) => s?.city).map((s) => ({ x: s.x, y: s.y, t: s.city })),
        summary: { key: 'mt.mapTripsToday', city: stops[at].city || today.title, day: todayAt?.dayNum ?? 1, of: todayAt?.of ?? 1 },
      };
    }
  }
  const trips = ahead.map((t) => ({ ...t, located: located(t.stops) })).filter((t) => t.located.length);
  if (!trips.length) {
    // Nothing ahead but trips behind: their routes in the quiet past line.
    const done = past.map((t) => located(t.stops)).filter((ls) => ls.length);
    if (!done.length) return { state: 'empty', whole: true, summary: { key: 'mt.mapTripsEmpty' } };
    return {
      state: 'past',
      focus: done.flat().map(xy),
      pad: 0.12,
      routes: done.filter((ls) => ls.length > 1).map((ls, i) => ({ id: `past${i}`, pts: ls.map(xy), kind: 'past' })),
      stops: done.flat().map((s) => ({ x: s.x, y: s.y })),
      summary: { key: 'mt.mapTripsPast', n: done.length },
    };
  }
  const [next] = trips;
  const first = next.located[0];
  const many = trips.length > 1;
  const routes = trips.filter((t) => t.located.length > 1).map((t) => ({ id: t.id, pts: t.located.map(xy), kind: 'next' }));
  const stops = trips.flatMap((t, ti) => t.located.map((s, i) => ({ x: s.x, y: s.y, big: ti === 0 && i === 0, sun: ti === 0 && i === 0 })));
  return {
    state: many ? 'many' : 'one',
    focus: (many ? trips.flatMap((t) => t.located) : next.located).map(xy),
    pad: many ? 0.1 : 0.18,
    routes,
    stops,
    labels: first.city ? [{ x: first.x, y: first.y, t: first.city }] : [],
    summary: many ? { key: 'mt.mapTripsMany', n: trips.length, name: next.title } : { key: 'mt.mapTripsNext', name: next.title },
  };
}

/**
 * Your Europe. `been` holds every country on the record (trips and hand
 * marks, ISO); a country without a trip year is a hand mark.
 */
export function europeLayer({ trips = [], been = new Set() } = {}) {
  const firstYear = firstVisitYear(trips);
  const hand = new Set([...been].filter((c) => firstYear[c] == null));
  const visits = {};
  trips.forEach((t) => {
    const y = tripYear(t);
    if (y == null) return;
    (t.countries || []).forEach((c) => { (visits[c] ||= new Set()).add(y); });
  });
  const routes = [];
  const stops = [];
  trips.forEach((t) => {
    const ls = located(t.stops);
    const year = tripYear(t);
    if (ls.length > 1) routes.push({ id: t.id, pts: ls.map(xy), kind: 'past', year });
    ls.forEach((s) => stops.push({ x: s.x, y: s.y, year }));
  });
  let corners = [];
  if (trips.length > 1) {
    const ex = extremes(trips);
    if (ex) {
      corners = [['n', 0, -14], ['s', 0, 14], ['e', 14, 0], ['w', -14, 0]]
        .map(([k, dx, dy]) => {
          const p = project(ex[k].lat, ex[k].lon);
          return p && { key: k, x: p[0], y: p[1], dx, dy };
        })
        .filter(Boolean);
    }
  }
  const years = [...new Set(trips.map(tripYear).filter((y) => y != null))].sort((a, b) => a - b);
  return { state: been.size ? 'record' : 'empty', whole: true, firstYear, ramp: rampOf(firstYear), hand, visits, routes, stops, corners, years };
}
