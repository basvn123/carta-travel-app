/**
 * appData.js, data-file loading, shared across the app.
 *
 * The main dataset download starts the moment the bundle is evaluated (module
 * scope), so it runs in parallel with React booting instead of waiting for the
 * first component effect. The two heavier, rarely-needed files are lazy:
 *   - /activities_full.json   full POI lists with coordinates (Day planner)
 *   - /country_insights.json  per-country travel intel (planners + detail)
 */

import { faresUrl } from './fareFile.js';

function fetchJson(path) {
  return fetch(path).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

/** Started at module-eval time; every consumer shares the same promise. */
export const appDataPromise = fetchJson('/app_data.json');
// Swallow the module-scope rejection so it never surfaces as an unhandled
// rejection before useAppData attaches its own catch. Consumers still get
// the real error from their own .then/.catch chains.
appDataPromise.catch(() => {});

// Per-origin fare slices (public/fares/{IATA}.json, written by sync-data.mjs;
// faresUrl() escapes the handful of codes Windows reserves, see fareFile.js).
// Cached per origin; resolves null on failure so useAppData can tell "no such
// file / offline" apart from "empty but valid" and fall back gracefully.
const faresPromises = new Map();
export function fetchFares(origin) {
  if (!origin || !/^[A-Z0-9]{3,4}$/.test(origin)) return Promise.resolve(null);
  if (!faresPromises.has(origin)) {
    faresPromises.set(origin, fetchJson(faresUrl(origin)).catch(() => null));
  }
  return faresPromises.get(origin);
}

let activitiesFullPromise = null;
/** Full per-destination POI lists (id -> items_full). Cached after first call;
 *  resolves to {} on failure so callers can fall back to the short lists. */
export function fetchActivitiesFull() {
  if (!activitiesFullPromise) {
    activitiesFullPromise = fetchJson('/activities_full.json').catch(() => ({}));
  }
  return activitiesFullPromise;
}

let countryInsightsPromise = null;
/** Per-country travel insights (country name -> record). Cached; {} on failure. */
export function fetchCountryInsights() {
  if (!countryInsightsPromise) {
    countryInsightsPromise = fetchJson('/country_insights.json').catch(() => ({}));
  }
  return countryInsightsPromise;
}
