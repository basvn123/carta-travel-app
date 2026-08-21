/**
 * mountains.js, the published mountain layer: the summits, volcanoes, ridges,
 * plateaus, sea cliffs and lowland high points that came out of
 * pipeline/mountains with a score, three sub scores, a way up, a reason list
 * and a gallery of photographs.
 *
 * Three artifacts, written by pipeline/mountains/export_peaks.py:
 *   /mountains/index.json    which countries have published mountains, how
 *                            many, the best score in each, one cover photo,
 *                            and how many of that country's entries you can
 *                            ride a lift to the top of
 *   /mountains/top.json      the Europe wide opening page, capped per country
 *   /mountains/{CC}.json     every published mountain in that country
 *
 * There is no detail file and no geometry file. A mountain here is a point, a
 * handful of measurements, a way up and a verdict, so the country file carries
 * everything the page needs and opening one costs no second request.
 *
 * Repo gotcha this file exists to contain, same as trails.js, beaches.js and
 * lakes.js: under public/ a missing JSON is served as the SPA index with
 * status 200, so `r.ok` is true and `r.json()` throws on "<!doctype". Every
 * fetch checks the content type first and resolves null instead, which is also
 * how a country with nothing published reads: null, never an error.
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
 * Which countries have mountains, most first.
 *
 * The index is written by the export gate, so a country is in it exactly when
 * at least one of its summits cleared the score, the photographs and the name.
 * `absent` says why the others are not. Every one of the 43 countries carries
 * a curated seed, so an absence here is a gap in the data rather than a fact
 * about the country, and it reads that way.
 */
export function loadMountainIndex() {
  return cached('/mountains/index.json').then((raw) => {
    if (!raw || !Array.isArray(raw.countries)) return null;
    const countries = raw.countries.filter((c) => c && c.cc && c.n > 0);
    if (!countries.length) return null;
    return {
      generatedAt: raw.generated_at || null,
      total: raw.n_mountains || countries.reduce((n, c) => n + c.n, 0),
      model: raw.model || null,
      countries,
      absent: raw.absent || {},
      attribution: Array.isArray(raw.attribution) ? raw.attribution : [],
    };
  });
}

/**
 * The best mountains in Europe, best first, with a per country cap so the
 * list is a tour of the continent rather than a page of Alpine four
 * thousanders.
 *
 * Its own file for the same reason the beach and lake layers have one:
 * ranking the whole continent client side would mean fetching every country
 * before a single card could be drawn.
 */
export function loadTopMountains() {
  return Promise.all([cached('/mountains/top.json'), overridesReady()])
    .then(([raw]) => {
      if (!raw || !Array.isArray(raw.mountains)) return null;
      return applyOverrides('mountain', raw.mountains.filter((m) => m && m.id));
    });
}

/** Every published mountain in one country, best first. Null when there is no
 *  file to read, which for this layer means "nothing published here yet". */
export function loadMountains(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve(null);
  // The overrides ride along with the file rather than being applied by
  // the caller, so every screen that reads this layer sees the corrected
  // catalogue and no screen has to remember to ask.
  return Promise.all([cached(`/mountains/${cc}.json`), overridesReady()])
    .then(([raw]) => {
      if (!raw || !Array.isArray(raw.mountains)) return null;
      const rows = raw.mountains.filter((m) => m && m.id && Number.isFinite(m.lat)
        && Number.isFinite(m.lon));
      return applyOverrides('mountain', rows);
    });
}

/** The mountains of several countries at once, flattened and re-ranked. */
export function loadMountainsFor(countries) {
  return Promise.all((countries || []).map((cc) => loadMountains(cc)))
    .then((lists) => lists.flat().filter(Boolean).sort((a, b) => b.score - a.score));
}

/** A shared mountain link, read once at startup: "#mtn=ch-matterhorn-Q1090&mc=CH".
 *
 *  Same reasoning as trails.js, beaches.js and lakes.js: the hash keeps the
 *  payload out of server logs, never collides with the browse-state query
 *  params, and the read is cached so React's double-invoked StrictMode mount
 *  sees the same value instead of losing it to the first strip. */
let mountainReadResult;

export function readMountainFromUrl() {
  if (mountainReadResult !== undefined) return mountainReadResult;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#') || !hash.includes('mtn=')) return (mountainReadResult = null);
  const params = new URLSearchParams(hash.slice(1));
  const id = String(params.get('mtn') || '').slice(0, 80);
  const cc = String(params.get('mc') || '').toUpperCase();
  if (!id || !COUNTRY_RE.test(cc)) return (mountainReadResult = null);
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* the mountain still opens; only the address bar stays busy */ }
  return (mountainReadResult = { id, cc });
}

/** The link that reopens one mountain, for the share sheet. */
export function mountainShareUrl(mountain) {
  if (typeof window === 'undefined' || !mountain) return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#mtn=${encodeURIComponent(mountain.id)}&mc=${mountain.cc}`;
}

/** The published mountains of a country, or null while loading. */
export function useMountains(country) {
  const [mountains, setMountains] = useState(null);
  useEffect(() => {
    let live = true;
    setMountains(null);
    if (country) loadMountains(country).then((m) => { if (live) setMountains(m); });
    return () => { live = false; };
  }, [country]);
  return mountains;
}
