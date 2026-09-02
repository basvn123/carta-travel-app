/**
 * cycling.js, the published cycling layer: signed cycle routes and the
 * multi-day tours composed over them by pipeline/cycling/stage_planner.py.
 *
 * Four artifacts, written by pipeline/cycling/export_cycling.py:
 *   /cycling/index.json        which countries have content, the counts, the
 *                              model blocks and the attribution every
 *                              consumer has to carry
 *   /cycling/{CC}.json         that country's rated route cards, its listed
 *                              route cards in a SEPARATE array, and its tours
 *   /cycling/route/{id}.json   one route in full, in two blocks: `osm` (the
 *                              geometry and source tags, a database extract,
 *                              ODbL travelling with it) and `carta` (our
 *                              scores and service towns, original work)
 *   /cycling/tour/{slug}.json  one tour in full: stages, overnights,
 *                              surfaces, bail-outs
 *
 * Two contracts this file enforces on the way in, because the app is the last
 * place they can be enforced:
 *
 *   A LISTED ROW HAS NO SCORE. The export omits the key entirely rather than
 *   writing null, and loadCycling() will not invent one. If a row arrives
 *   with t !== 'r' and a score anyway, the score is dropped here: a number
 *   nobody earned is never shown (invariant 9).
 *
 *   THE CREDIT TRAVELS WITH THE GEOMETRY. `osm.attribution` is what a GPX
 *   export has to carry in its own <copyright>, because a GPX is a database
 *   extract and not a produced work. gpxCredit() is the one place that
 *   string is read from, so no exporter can quietly drop it.
 *
 * Repo gotcha this file exists to contain, the same one trails.js, lakes.js
 * and mountains.js contain: under public/ a missing JSON is served as the SPA
 * index with status 200, so `r.ok` is true and `r.json()` throws on
 * "<!doctype". Every fetch checks the content type first and resolves null,
 * which is also how a country with nothing published reads.
 */
import { useEffect, useState } from 'react';
import { applyOverrides, applyOverride, overridesReady } from './overrides.js';

const COUNTRY_RE = /^[A-Z]{2}$/;
const SLUG_RE = /^[a-z0-9-]{3,80}$/;

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

/** Windows cannot write PRN.json, so the export escapes reserved stems. The
 *  app has to mirror that mapping or the file it asks for does not exist. */
const RESERVED = new Set(['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3',
  'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3',
  'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9']);

export function fileFor(stem) {
  return RESERVED.has(String(stem).split('.')[0].toLowerCase())
    ? `R_${stem}` : String(stem);
}

/** The tier contract, enforced on the way in rather than trusted. */
function stripUnearnedScore(row) {
  if (!row || row.t === 'r') return row;
  if ('score' in row || 'scenic' in row) {
    const clean = { ...row };
    delete clean.score;
    delete clean.scenic;
    return clean;
  }
  return row;
}

/** Which countries have published cycling, with counts and the model. */
export function loadCyclingIndex() {
  return cached('/cycling/index.json').then((raw) => {
    if (!raw || !Array.isArray(raw.countries)) return null;
    const countries = raw.countries.filter(
      (c) => c && c.country && (c.n_routes > 0 || c.n_listed > 0 || c.n_tours > 0),
    );
    if (!countries.length) return null;
    return {
      generatedAt: raw.generated_at || null,
      countries,
      nRoutes: raw.n_routes || 0,
      nListed: raw.n_listed || 0,
      nTours: raw.n_tours || 0,
      model: raw.model || null,
      checks: Array.isArray(raw.checks) ? raw.checks : [],
      // This loader is a WHITELIST, so a new wire field is invisible to the
      // app until it is named here. The EuroVelo families shipped correctly
      // and rendered nothing for exactly that reason, which is the same trap
      // the magic-import extras hit.
      families: Array.isArray(raw.families) ? raw.families : [],
      attribution: Array.isArray(raw.attribution) ? raw.attribution : [],
    };
  });
}

/**
 * One country's cycling, as three separate lists.
 *
 * `routes` and `listed` stay apart on purpose: a listed row is verified to
 * exist and correctly named but carries no score, and a screen has to opt in
 * to showing them rather than have them interleave into a ranked list.
 */
export function loadCycling(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve(null);
  return Promise.all([cached(`/cycling/${fileFor(`${cc}.json`)}`), overridesReady()])
    .then(([raw]) => {
      if (!raw) return null;
      const drawable = (r) => r && r.id && r.geometry
        && Array.isArray(r.geometry.coordinates)
        && r.geometry.coordinates.length > 0;
      const routes = applyOverrides('cycle', (raw.routes || []).filter(drawable),
        { imageKey: 'img' });
      const listed = (raw.listed || []).filter(drawable).map(stripUnearnedScore);
      return {
        country: cc,
        generatedAt: raw.generated_at || null,
        routes,
        listed,
        tours: (raw.tours || []).filter((t) => t && t.slug),
      };
    });
}

/** One route in full: the osm block, the carta block, everything. */
export function loadCycleRoute(id) {
  if (!Number.isInteger(Number(id))) return Promise.resolve(null);
  return Promise.all([cached(`/cycling/route/${Number(id)}.json`), overridesReady()])
    .then(([raw]) => {
      if (!raw || !raw.id) return null;
      return applyOverride('cycle', stripUnearnedScore(raw), { imageKey: 'img' });
    });
}

/** One composed tour in full: stages, overnights, bail-outs. */
export function loadCycleTour(slug) {
  const key = String(slug || '');
  if (!SLUG_RE.test(key)) return Promise.resolve(null);
  return cached(`/cycling/tour/${fileFor(`${key}.json`)}`)
    .then((raw) => (raw && raw.slug ? raw : null));
}

/**
 * The credit a GPX export MUST carry.
 *
 * Section 7 of the cycling brief, and the OSMF's own produced-work guideline:
 * a rendered map is a produced work and may be licensed freely, but a GPX
 * export is a database extract and share-alike travels with it. So the
 * attribution goes inside the file, in <copyright> and in <desc>, and it is
 * read from the wire rather than hard-coded, so a route from a source with a
 * different licence carries that source's words instead.
 */
export function gpxCredit(route) {
  const osm = (route && route.osm) || {};
  return {
    author: osm.attribution
      || 'Cycle route data (c) OpenStreetMap contributors, ODbL',
    license: osm.license || 'ODbL 1.0',
    licenseUrl: /odbl/i.test(osm.license || 'ODbL')
      ? 'https://opendatacommons.org/licenses/odbl/1-0/' : null,
    source: osm.source || 'osm',
  };
}

/**
 * A shared cycle link, read once at startup: "#cycle=63478&cc=GB" for a route
 * or "#tour=gb-caledonia-way-balanced" for a tour.
 *
 * The hash, not the query string, for the reasons shareLink.js documents: the
 * payload never reaches a server log, it never collides with the browse-state
 * params useUrlSync writes, and a link carrying nothing else leaves the
 * recipient's own saved dates and origin alone. Cached, so React's
 * double-invoked StrictMode mount reads the same value instead of losing it
 * to the first strip.
 */
let cycleReadResult;

export function readCycleFromUrl() {
  if (cycleReadResult !== undefined) return cycleReadResult;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#')) return (cycleReadResult = null);
  if (!hash.includes('cycle=') && !hash.includes('tour=')) {
    return (cycleReadResult = null);
  }
  const params = new URLSearchParams(hash.slice(1));
  let out = null;
  const id = Number(params.get('cycle'));
  const cc = String(params.get('cc') || '').toUpperCase();
  const tour = params.get('tour');
  if (Number.isInteger(id) && id > 0 && COUNTRY_RE.test(cc)) {
    out = { kind: 'route', id, country: cc };
  } else if (tour && SLUG_RE.test(tour)) {
    out = { kind: 'tour', slug: tour };
  }
  if (out) {
    try {
      window.history.replaceState(null, '',
        window.location.pathname + window.location.search);
    } catch { /* the route still opens; only the address bar stays busy */ }
  }
  return (cycleReadResult = out);
}

/** The published routes for a country, or null while loading. */
export function useCycling(country) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    setData(null);
    if (country) loadCycling(country).then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, [country]);
  return data;
}

/**
 * One EuroVelo family manifest: which country sections make it up, how long
 * the whole thing is, and how much of it the ECF's own developed-sections GPX
 * agrees with. A manifest, not geometry: the sections carry that, so nothing
 * here restates an ODbL extract.
 */
export async function loadCycleFamily(ref) {
  if (!ref) return null;
  return cached(`/cycling/family/${fileFor(`${ref}.json`)}`);
}
