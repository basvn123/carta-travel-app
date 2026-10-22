/**
 * The stays wire (schema v18, T534): month curves, weekend and peak factors
 * per destination, one file per country.
 *
 * Two copies exist, and the newer one wins (by its `built` stamp):
 *   live    meta.stays.url + {cc}.json, written by the monthly GitHub Actions
 *           refresh to data.carta-europetravel.com/data/stays-live/v1/, so
 *           prices move every month without a redeploy
 *   baked   stays/v1/{cc}.json, shipped with the app by apply_stays.py
 *           (dataUrl moves it to the data host after the R2 cut-over)
 *
 * Nothing blocks on it: bedPrice() prices from the annual medians in
 * dest.accommodation until a country's file arrives, then from the measured
 * months. Screens re-render through useStaysVersion().
 */

import { useSyncExternalStore } from 'react';
import { dataUrl } from './dataHost.js';

const records = new Map();      // dest id -> record
const loaded = new Map();       // cc -> Promise
const listeners = new Set();
let version = 0;
let liveBase = null;
let liveBuilt = null;   // Promise of the live copy's `built`, or null

/** Point the loader at the live copy (meta.stays.url) and ask its manifest
 *  once. Country files are fetched live only when the manifest exists and is
 *  newer than the copy that shipped (`bakedBuilt`, meta.stays.built), so a
 *  refresh that has not run yet costs one request, not one per country. The
 *  dev server skips it: the data host only admits the app's own origins. */
export function setLiveBase(url, bakedBuilt = null) {
  const ok = typeof url === 'string' && /^https:\/\//.test(url)
    && !(typeof location !== 'undefined' && /^(localhost|127\.)/.test(location.hostname));
  if (!ok || url === liveBase) return;
  liveBase = url;
  liveBuilt = getJson(`${url}manifest.json`)
    .then((m) => (m?.built && (!bakedBuilt || m.built > bakedBuilt) ? m.built : null))
    .catch(() => null);
}

export function stayRecord(id) {
  return id ? records.get(id) || null : null;
}

async function getJson(url) {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error(`not json: ${url}`);
  return r.json();
}

/** Load one country's stays file (live or baked, whichever is newer). Safe to
 *  call many times; resolves to the number of records loaded. */
export function loadStays(cc) {
  if (!cc) return Promise.resolve(0);
  if (loaded.has(cc)) return loaded.get(cc);
  const file = `${encodeURIComponent(cc)}.json`;
  const base = liveBase;
  const live = liveBuilt
    ? liveBuilt.then((b) => (b ? getJson(`${base}${file}`) : null))
    : Promise.resolve(null);
  const p = Promise.allSettled([getJson(dataUrl(`/stays/v1/${file}`)), live]).then((res) => {
    const files = res.filter((x) => x.status === 'fulfilled' && x.value?.dests).map((x) => x.value);
    if (!files.length) return 0;
    const best = files.sort((a, b) => String(b.built || '').localeCompare(String(a.built || '')))[0];
    for (const [id, rec] of Object.entries(best.dests)) records.set(id, rec);
    version += 1;
    listeners.forEach((fn) => fn());
    return Object.keys(best.dests).length;
  });
  loaded.set(cc, p);
  return p;
}

/** Load every country of a destination map, in the background. */
export function loadStaysFor(destinations) {
  const ccs = new Set();
  for (const d of Object.values(destinations || {})) if (d?.iso2) ccs.add(d.iso2);
  return Promise.all([...ccs].map(loadStays));
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A number that goes up each time a country's stays arrive; put it in the
 *  dependency list of anything that prices beds. */
export function useStaysVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

/** Seed the records directly: the node builds (prerender, OG cards) read the
 *  baked files from disk with this, and the tests use it. */
export function setStayRecords(map) {
  records.clear();
  for (const [id, rec] of Object.entries(map || {})) records.set(id, rec);
  version += 1;
}

/** The records of a list of stays files ({dests}), merged, for setStayRecords. */
export function mergeStayFiles(files) {
  const out = {};
  for (const f of files) Object.assign(out, f?.dests || {});
  return out;
}
