/**
 * lakes.js, the published lake layer: the lakes, reservoirs, lagoons, tarns
 * and crater lakes that came out of pipeline/lakes with a score, three sub
 * scores, a swimming verdict, a reason list and photographs.
 *
 * Three artifacts, written by pipeline/lakes/export_lakes.py:
 *   /lakes/index.json    which countries have published lakes, how many, the
 *                        best score in each, one cover photo, and how many of
 *                        that country's entries you may actually swim in
 *   /lakes/top.json      the Europe wide opening page, capped per country
 *   /lakes/{CC}.json     every published water body in that country
 *
 * There is no detail file and no geometry file. A lake here is a point, a
 * handful of measurements and a verdict, so the country file carries
 * everything the page needs and opening one costs no second request.
 *
 * Repo gotcha this file exists to contain, same as trails.js and beaches.js:
 * under public/ a missing JSON is served as the SPA index with status 200, so
 * `r.ok` is true and `r.json()` throws on "<!doctype". Every fetch checks the
 * content type first and resolves null instead, which is also how a country
 * with nothing published reads: null, never an error.
 */
import { useEffect, useState } from 'react';
import { applyOverrides, overridesReady } from './overrides.js';

const COUNTRY_RE = /^[A-Z]{2}$/;

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

/**
 * Which countries have lakes, most first.
 *
 * The index is written by the export gate, so a country is in it exactly when
 * at least one of its water bodies cleared the score, the photographs and the
 * name. `absent` says why the others are not: "nothing cleared the gate" for a
 * country the pipeline could not fill, and a written reason for the ones that
 * genuinely have no inland water (Monaco). That distinction is worth keeping:
 * an empty list because we failed and an empty list because there is nothing
 * there are not the same fact.
 */
export function loadLakeIndex() {
  return cached('/lakes/index.json').then((raw) => {
    if (!raw || !Array.isArray(raw.countries)) return null;
    const countries = raw.countries.filter((c) => c && c.cc && c.n > 0);
    if (!countries.length) return null;
    return {
      generatedAt: raw.generated_at || null,
      total: raw.n_lakes || countries.reduce((n, c) => n + c.n, 0),
      model: raw.model || null,
      countries,
      absent: raw.absent || {},
      attribution: Array.isArray(raw.attribution) ? raw.attribution : [],
    };
  });
}

/**
 * The best water bodies in Europe, best first, with a per country cap so the
 * list is a tour of the continent rather than a page of Alpine lakes.
 *
 * Its own file for the same reason the beach layer's is: ranking the whole
 * continent client side would mean fetching every country before a single
 * card could be drawn.
 */
export function loadTopLakes() {
  return Promise.all([cached('/lakes/top.json'), overridesReady()])
    .then(([raw]) => {
      if (!raw || !Array.isArray(raw.lakes)) return null;
      return applyOverrides('lake', raw.lakes.filter((l) => l && l.id));
    });
}

/** Every published water body in one country, best first. Null when there is
 *  no file to read, which for this layer means "no lakes here". */
export function loadLakes(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve(null);
  // The overrides ride along with the file rather than being applied by
  // the caller, so every screen that reads this layer sees the corrected
  // catalogue and no screen has to remember to ask.
  return Promise.all([cached(`/lakes/${cc}.json`), overridesReady()])
    .then(([raw]) => {
      if (!raw || !Array.isArray(raw.lakes)) return null;
      const rows = raw.lakes.filter((l) => l && l.id && Number.isFinite(l.lat)
        && Number.isFinite(l.lon));
      return applyOverrides('lake', rows);
    });
}

/** The lakes of several countries at once, flattened and re-ranked. */
export function loadLakesFor(countries) {
  return Promise.all((countries || []).map((cc) => loadLakes(cc)))
    .then((lists) => lists.flat().filter(Boolean).sort((a, b) => b.score - a.score));
}

/** A shared lake link, read once at startup: "#lake=si-lake-bled-Q207302&lc=SI".
 *
 *  Same reasoning as trails.js and beaches.js: the hash keeps the payload out
 *  of server logs, never collides with the browse-state query params, and the
 *  read is cached so React's double-invoked StrictMode mount sees the same
 *  value instead of losing it to the first strip. */
let lakeReadResult;

export function readLakeFromUrl() {
  if (lakeReadResult !== undefined) return lakeReadResult;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#') || !hash.includes('lake=')) return (lakeReadResult = null);
  const params = new URLSearchParams(hash.slice(1));
  const id = String(params.get('lake') || '').slice(0, 80);
  const cc = String(params.get('lc') || '').toUpperCase();
  if (!id || !COUNTRY_RE.test(cc)) return (lakeReadResult = null);
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* the lake still opens; only the address bar stays busy */ }
  return (lakeReadResult = { id, cc });
}

/** The link that reopens one lake, for the share sheet. */
export function lakeShareUrl(lake) {
  if (typeof window === 'undefined' || !lake) return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#lake=${encodeURIComponent(lake.id)}&lc=${lake.cc}`;
}

/** The published lakes of a country, or null while loading. */
export function useLakes(country) {
  const [lakes, setLakes] = useState(null);
  useEffect(() => {
    let live = true;
    setLakes(null);
    if (country) loadLakes(country).then((l) => { if (live) setLakes(l); });
    return () => { live = false; };
  }, [country]);
  return lakes;
}
