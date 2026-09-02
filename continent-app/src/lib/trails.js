/**
 * trails.js, the published trails layer: hikes, daytrips and city trips that
 * came out of the content lab (tools/trailslab) through human approval.
 *
 * Two artifacts, written by pipeline/trails/export_wire.py:
 *   /trails/{CC}.json      every published trip in that country, each with a
 *                          simplified line, its metrics and its own credit
 *   /trails/trip/{id}.json full-resolution geometry, the full description,
 *                          the elevation profile and the stops, fetched only
 *                          when a trip is opened
 * plus /trails/index.json, which says which countries have anything.
 *
 * Repo gotcha this file exists to contain: under public/ a missing JSON is
 * served as the SPA index with status 200, so `r.ok` is true and `r.json()`
 * throws on "<!doctype". Every fetch here checks the content type first and
 * resolves null instead, the same way a country with nothing published is
 * null rather than an error. Nothing in the app breaks when a country has no
 * trails yet, which is most of them.
 */
import { useEffect, useState } from 'react';
import { applyOverrides, applyOverride, overridesReady } from './overrides.js';

const COUNTRY_RE = /^[A-Z]{2}$/;

/** True when the response is really JSON and not the SPA fallback page. */
function isJson(res) {
  return res.ok && (res.headers.get('content-type') || '').includes('json');
}

function loadJson(url) {
  return fetch(url)
    .then((r) => (isJson(r) ? r.json() : null))
    .catch(() => null);
}

// Cached per URL: these files never change inside a session.
const cache = new Map();

function cached(url) {
  if (!cache.has(url)) cache.set(url, loadJson(url));
  return cache.get(url);
}

/** Which countries have published trips, with per-category counts. Resolves
 *  null before the first export has ever run. */
export function loadTrailsIndex() {
  return cached('/trails/index.json').then((raw) => {
    if (!raw || !Array.isArray(raw.countries)) return null;
    const countries = raw.countries.filter((c) => c && c.n_trips > 0);
    if (!countries.length) return null;
    return {
      generatedAt: raw.generated_at || null,
      countries,
      attribution: Array.isArray(raw.attribution) ? raw.attribution : [],
    };
  });
}

/** A trip with no line cannot be drawn and cannot be measured on the map, so
 *  it never reaches a caller that assumes both. */
const drawable = (t) => t && t.id && t.geometry
  && Array.isArray(t.geometry.coordinates) && t.geometry.coordinates.length > 0;

/** Every published RATED trip in one country. Resolves an empty array for a
 *  country with nothing published, null when there is no file to read at all.
 *
 *  Rated only, deliberately: this is what every existing caller means by "the
 *  trails of this country", and a listed row carries no rating, so quietly
 *  folding them in here would put unscored rows into a price list, a nearby
 *  strip and a city-day lookup that all assume a score. Listed rows come
 *  through loadListedTrails, which a screen has to ask for. */
export function loadTrails(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve(null);
  return Promise.all([cached(`/trails/${cc}.json`), overridesReady()])
    .then(([raw]) => {
      if (!raw || !Array.isArray(raw.trips)) return null;
      // Trails carry one `img` string rather than an images array.
      return applyOverrides('trail', raw.trips.filter(drawable), { imageKey: 'img' });
    });
}

/**
 * The `listed` tier of one country: routes verified to exist, named, deduped
 * and in region, and deliberately NOT scored.
 *
 * They exist so a region page in Moldova or Kosovo is not empty. The wire
 * omits the rating key entirely rather than nulling it, which is what lets a
 * card render "not scored yet" instead of a zero, so nothing here invents a
 * score and nothing downstream should either.
 *
 * Resolves an empty array for a country with none, which is most of them.
 */
export function loadListedTrails(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve([]);
  return Promise.all([cached(`/trails/${cc}.json`), overridesReady()])
    .then(([raw]) => {
      if (!raw || !Array.isArray(raw.listed)) return [];
      return applyOverrides('trail', raw.listed.filter(drawable), { imageKey: 'img' });
    });
}

/**
 * The per-country facet counts the export shipped, or null.
 *
 * How many rows in this country can answer each filter value, counted by the
 * pipeline over the rows it wrote. The app uses them to grey out a chip that
 * would lead to an empty list before it has looked at a single row, and the
 * harness holds them against the rows so a stale count cannot survive a
 * re-export.
 */
export function loadTrailFacets(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve(null);
  return cached(`/trails/${cc}.json`).then((raw) => raw?.facets || null);
}

/** One trip in full, for the detail view: full-resolution geometry, the whole
 *  description, the elevation profile and the stops. */
export function loadTrail(id) {
  if (!Number.isInteger(Number(id))) return Promise.resolve(null);
  return Promise.all([cached(`/trails/trip/${Number(id)}.json`), overridesReady()])
    .then(([raw]) => (raw && raw.id
      ? applyOverride('trail', raw, { imageKey: 'img' })
      : null));
}

/**
 * A shared trail link, read once at startup: "#trail=63478&tc=AL".
 *
 * The hash, not the query string, for the same reasons shareLink.js uses it:
 * the payload never reaches a server log, it never collides with the
 * browse-state params useUrlSync writes, and a link that carries nothing else
 * leaves the recipient's own saved dates and origin alone. Supabase auth links
 * also land in the hash, so only a hash carrying our own `trail=` is touched.
 *
 * Cached, so React's double-invoked StrictMode mount reads the same value
 * instead of losing it to the first strip.
 */
let trailReadResult;

export function readTrailFromUrl() {
  if (trailReadResult !== undefined) return trailReadResult;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#') || !hash.includes('trail=')) return (trailReadResult = null);
  const params = new URLSearchParams(hash.slice(1));
  const id = Number(params.get('trail'));
  const cc = String(params.get('tc') || '').toUpperCase();
  if (!Number.isInteger(id) || id <= 0 || !COUNTRY_RE.test(cc)) return (trailReadResult = null);
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* the trail still opens; only the address bar stays busy */ }
  return (trailReadResult = { id, country: cc });
}

/** The published trips for a country, or null while loading. */
export function useTrails(country) {
  const [trips, setTrips] = useState(null);
  useEffect(() => {
    let live = true;
    setTrips(null);
    if (country) loadTrails(country).then((t) => { if (live) setTrips(t); });
    return () => { live = false; };
  }, [country]);
  return trips;
}
