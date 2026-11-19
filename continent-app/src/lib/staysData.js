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
 *
 * G12, D10 (explore-top-2 audit-perf.md cause 1): the 43 country files used
 * to bump the version one by one, and each bump re-priced and re-rendered the
 * whole catalogue in one blocking pass (55 to 95 s of blocked main thread at
 * 4x CPU). Arrivals now wait in `pending` and are published together, once
 * the files stop arriving for a moment (or when all are in), as one new
 * immutable snapshot: the records and the version swap in the same step, so
 * no reader sees records newer than the version its figures were keyed on.
 * Readers take the snapshot in a transition, so a re-price yields to input.
 */

import { startTransition, useEffect, useState } from 'react';
import { dataUrl } from './dataHost.js';

// The published records and their version, replaced (never mutated) at a
// publish. Figures read only this.
let snapshot = { version: 0, records: new Map() };
const pending = new Map();      // dest id -> record, arrived, not yet published
const loaded = new Map();       // cc -> Promise
const listeners = new Set();
let liveBase = null;
let liveBuilt = null;   // Promise of the live copy's `built`, or null
let bakedVersion = null;

// A publish waits until the files stop arriving for PUBLISH_IDLE_MS, but never
// more than PUBLISH_MAX_MS after the first unpublished one, so a slow network
// still shows the measured months early. Measured locally the 43 files land
// within about 2 s at 4x CPU: one to three publishes instead of 43.
const PUBLISH_IDLE_MS = 300;
const PUBLISH_MAX_MS = 2000;
let publishTimer = null;
let firstPendingAt = 0;

// T646: every country file is asked for with its build in the URL (?b=), so a
// new build is a new URL: neither the browser cache (max-age 1 h plus a day
// stale) nor the service worker can hand back last build's file after a fix.
const versioned = (url, b) => (b ? `${url}?b=${encodeURIComponent(b)}` : url);

/** Point the loader at the live copy (meta.stays.url) and ask its manifest
 *  once. Country files are fetched live only when the manifest exists and is
 *  newer than the copy that shipped (`bakedBuilt`, meta.stays.built), so a
 *  refresh that has not run yet costs one request, not one per country. The
 *  dev server skips it: the data host only admits the app's own origins. */
export function setLiveBase(url, bakedBuilt = null) {
  bakedVersion = bakedBuilt;
  const ok = typeof url === 'string' && /^https:\/\//.test(url)
    && !(typeof location !== 'undefined' && /^(localhost|127\.)/.test(location.hostname));
  if (!ok || url === liveBase) return;
  liveBase = url;
  // The manifest is the one file without a version: revalidated every time.
  liveBuilt = getJson(`${url}manifest.json`, 'no-cache')
    .then((m) => (m?.built && (!bakedBuilt || m.built > bakedBuilt) ? m.built : null))
    .catch(() => null);
}

export function stayRecord(id) {
  return id ? snapshot.records.get(id) || null : null;
}

/** Publish every record that arrived since the last publish, as one new
 *  snapshot. Exported for the tests; the loader calls it itself. */
export function publishStays() {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
  if (!pending.size) return;
  const records = new Map(snapshot.records);
  for (const [id, rec] of pending) records.set(id, rec);
  pending.clear();
  snapshot = { version: snapshot.version + 1, records };
  // One mark per publish: scripts/perf_explore.mjs counts them.
  globalThis.performance?.mark?.('carta:stays-publish');
  // A transition: the re-price it causes may be interrupted by a tap or a key.
  startTransition(() => listeners.forEach((fn) => fn()));
}

function schedulePublish() {
  const now = Date.now();
  if (!publishTimer) firstPendingAt = now;
  else clearTimeout(publishTimer);
  const wait = Math.max(0, Math.min(PUBLISH_IDLE_MS, firstPendingAt + PUBLISH_MAX_MS - now));
  publishTimer = setTimeout(publishStays, wait);
}

async function getJson(url, cache = 'default') {
  const r = await fetch(url, { credentials: 'omit', cache });
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
    ? liveBuilt.then((b) => (b ? getJson(versioned(`${base}${file}`, b)) : null))
    : Promise.resolve(null);
  const baked = getJson(versioned(dataUrl(`/stays/v1/${file}`), bakedVersion));
  const p = Promise.allSettled([baked, live]).then((res) => {
    const files = res.filter((x) => x.status === 'fulfilled' && x.value?.dests).map((x) => x.value);
    if (!files.length) return 0;
    const best = files.sort((a, b) => String(b.built || '').localeCompare(String(a.built || '')))[0];
    for (const [id, rec] of Object.entries(best.dests)) pending.set(id, rec);
    schedulePublish();
    return Object.keys(best.dests).length;
  });
  loaded.set(cc, p);
  return p;
}

/** Load every country of a destination map, in the background. The last
 *  file in publishes at once rather than waiting for the idle timer. */
export function loadStaysFor(destinations) {
  const ccs = new Set();
  for (const d of Object.values(destinations || {})) if (d?.iso2) ccs.add(d.iso2);
  return Promise.all([...ccs].map(loadStays)).then((counts) => {
    publishStays();
    return counts;
  });
}

/** The published snapshot, re-read after each publish (in a transition). */
function useStaysSnapshot() {
  const [snap, setSnap] = useState(snapshot);
  useEffect(() => {
    const onPublish = () => setSnap(snapshot);
    listeners.add(onPublish);
    // A publish between this render and the subscription is not missed.
    if (snap !== snapshot) onPublish();
    return () => { listeners.delete(onPublish); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once; the check above only catches a publish before it
  }, []);
  return snap;
}

/** A number that goes up each time stays are published; put it in the
 *  dependency list of anything that prices beds. */
export function useStaysVersion() {
  return useStaysSnapshot().version;
}

/** stayRecord(id), re-read whenever stays are published (T1022), from the
 *  snapshot this render holds. */
export function useStayRecord(id) {
  const snap = useStaysSnapshot();
  return id ? snap.records.get(id) || null : null;
}

/** Seed the records directly: the node builds (prerender, OG cards) read the
 *  baked files from disk with this, and the tests use it. Synchronous: the
 *  records are readable as soon as it returns. */
export function setStayRecords(map) {
  pending.clear();
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
  snapshot = { version: snapshot.version + 1, records: new Map(Object.entries(map || {})) };
}

/** The records of a list of stays files ({dests}), merged, for setStayRecords. */
export function mergeStayFiles(files) {
  const out = {};
  for (const f of files) Object.assign(out, f?.dests || {});
  return out;
}

/** Goes up at each publish; caches of figures that read the month curves
 *  key on it (lib/costIndex.js, T692). Always the version of the records
 *  stayRecord() reads. */
export function staysDataVersion() {
  return snapshot.version;
}
