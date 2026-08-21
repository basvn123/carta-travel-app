/**
 * beaches.js, the published beach layer: the coves, calas and strands that
 * came out of pipeline/beaches with a score, a reason list and photographs.
 *
 * Two artifacts, written by pipeline/beaches/export_beaches.py:
 *   /beaches/index.json    which countries have published beaches, how many,
 *                          the best score in each and one cover photo
 *   /beaches/{CC}.json     every published beach in that country, each with
 *                          its beauty score, the reasons behind it, three or
 *                          four Commons photographs and their credits
 *
 * There is no detail file and no geometry file. A beach is a point and a
 * handful of facts, so the country file carries everything the page needs and
 * opening one costs no second request.
 *
 * Repo gotcha this file exists to contain, same as trails.js: under public/ a
 * missing JSON is served as the SPA index with status 200, so `r.ok` is true
 * and `r.json()` throws on "<!doctype". Every fetch checks the content type
 * first and resolves null instead, which is also how a country with nothing
 * published reads: null, never an error.
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
 * Which countries have beaches, best first.
 *
 * This is the answer to "only show me countries that have a beach": the index
 * is written by the export gate, so a country is in it exactly when at least
 * one of its beaches cleared the score, the photographs and the name. Andorra
 * never appears, and no hand kept coastline list has to be maintained to keep
 * it out.
 */
export function loadBeachIndex() {
  return cached('/beaches/index.json').then((raw) => {
    if (!raw || !Array.isArray(raw.countries)) return null;
    const countries = raw.countries.filter((c) => c && c.cc && c.n > 0);
    if (!countries.length) return null;
    return {
      generatedAt: raw.generated_at || null,
      total: raw.n_beaches || countries.reduce((n, c) => n + c.n, 0),
      model: raw.model || null,
      countries,
      attribution: Array.isArray(raw.attribution) ? raw.attribution : [],
    };
  });
}

/**
 * The best beaches in Europe, best first, with a per country cap so the list
 * is a tour of the continent rather than a page of Greek islands.
 *
 * This is what the tab opens on, and it is its own file for a reason: ranking
 * the whole continent client side would mean fetching every country, several
 * megabytes, before a single card could be drawn. One capped file answers
 * "show me the most beautiful beaches" in one request; picking a country or
 * searching for one loads that country's full list on top of it.
 */
export function loadTopBeaches() {
  return Promise.all([cached('/beaches/top.json'), overridesReady()])
    .then(([raw]) => {
      if (!raw || !Array.isArray(raw.beaches)) return null;
      return applyOverrides('beach', raw.beaches.filter((b) => b && b.id));
    });
}

/** Every published beach in one country, best first. Null when there is no
 *  file to read, which for this layer means "no beaches here". */
export function loadBeaches(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve(null);
  // The overrides ride along with the file rather than being applied by
  // the caller, so every screen that reads this layer sees the corrected
  // catalogue and no screen has to remember to ask.
  return Promise.all([cached(`/beaches/${cc}.json`), overridesReady()])
    .then(([raw]) => {
      if (!raw || !Array.isArray(raw.beaches)) return null;
      const rows = raw.beaches.filter((b) => b && b.id && Number.isFinite(b.lat)
        && Number.isFinite(b.lon));
      return applyOverrides('beach', rows);
    });
}

/** The beaches of several countries at once, flattened and re-ranked. Used by
 *  the all-Europe view, which is what the tab opens on. */
export function loadBeachesFor(countries) {
  return Promise.all((countries || []).map((cc) => loadBeaches(cc)))
    .then((lists) => lists.flat().filter(Boolean).sort((a, b) => b.score - a.score));
}

/** A shared beach link, read once at startup: "#beach=gr-navagio-Q1234&bc=GR".
 *
 *  Same reasoning as trails.js readTrailFromUrl: the hash keeps the payload
 *  out of server logs, never collides with the browse-state query params, and
 *  the read is cached so React's double-invoked StrictMode mount sees the same
 *  value instead of losing it to the first strip. */
let beachReadResult;

export function readBeachFromUrl() {
  if (beachReadResult !== undefined) return beachReadResult;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#') || !hash.includes('beach=')) return (beachReadResult = null);
  const params = new URLSearchParams(hash.slice(1));
  const id = String(params.get('beach') || '').slice(0, 80);
  const cc = String(params.get('bc') || '').toUpperCase();
  if (!id || !COUNTRY_RE.test(cc)) return (beachReadResult = null);
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* the beach still opens; only the address bar stays busy */ }
  return (beachReadResult = { id, cc });
}

/** The link that reopens one beach, for the share sheet. */
export function beachShareUrl(beach) {
  if (typeof window === 'undefined' || !beach) return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#beach=${encodeURIComponent(beach.id)}&bc=${beach.cc}`;
}

/** The published beaches of a country, or null while loading. */
export function useBeaches(country) {
  const [beaches, setBeaches] = useState(null);
  useEffect(() => {
    let live = true;
    setBeaches(null);
    if (country) loadBeaches(country).then((b) => { if (live) setBeaches(b); });
    return () => { live = false; };
  }, [country]);
  return beaches;
}
