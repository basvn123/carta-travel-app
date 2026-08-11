/**
 * reach.js, the travel-time (reachability) layer for the map filter.
 *
 * One artifact per origin at public/reach/{IATA}.json (contract D of the
 * price-map plan): { origin, computed_at, minutes: { destId: int } }, where
 * minutes is door-to-door ground travel time from the origin. Most origins
 * have no artifact yet; a missing file means "no travel-time data for this
 * origin", never an error, and the filter simply disables itself.
 */
import { useEffect, useState } from 'react';
import { fareFileBase } from './fareFile.js';

/** Served path for an origin's reach artifact (same reserved-name escaping
 *  as the fare slices: reach/PRN.json would be the printer on Windows). */
export function reachUrl(origin) {
  return `/reach/${fareFileBase(origin)}.json`;
}

// Cached per origin, keyed by the escaped code. Resolves to
// { origin, computedAt, minutes: Map } or null (missing/invalid/offline).
const reachPromises = new Map();

/** Fetch and parse one origin's reach artifact. Resolves null on any failure,
 *  and null minutes never make it out: every value is Number.isFinite-guarded
 *  here once, so consumers can compare without re-checking. */
export function loadReach(origin) {
  if (!origin || !/^[A-Z0-9]{3,4}$/.test(origin)) return Promise.resolve(null);
  const key = fareFileBase(origin);
  if (!reachPromises.has(key)) {
    const p = fetch(reachUrl(origin))
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!raw || typeof raw.minutes !== 'object' || raw.minutes == null) return null;
        const minutes = new Map();
        for (const [destId, v] of Object.entries(raw.minutes)) {
          const m = Number(v);
          if (Number.isFinite(m) && m >= 0) minutes.set(destId, m);
        }
        if (minutes.size === 0) return null;
        return { origin, computedAt: raw.computed_at || null, minutes };
      })
      .catch(() => null);
    reachPromises.set(key, p);
  }
  return reachPromises.get(key);
}

/** The reach table for the current origin: a Map(destId -> minutes), or null
 *  while loading / when this origin has no artifact. Nulls out immediately on
 *  an origin switch so a stale table never filters the new origin's map. */
export function useReach(origin) {
  const [reach, setReach] = useState(null);
  useEffect(() => {
    let live = true;
    setReach(null);
    if (origin) loadReach(origin).then((r) => { if (live) setReach(r); });
    return () => { live = false; };
  }, [origin]);
  return reach && reach.origin === origin ? reach.minutes : null;
}
