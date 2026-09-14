/**
 * citytrips.js, the bridge between published citytrips and the day planner.
 *
 * A citytrip on the trails wire is a composed one-day sightseeing walk whose
 * stops reference CATALOGUE POIs by slug ("poi:ZRH:opera-house", written by
 * pipeline/trails/compose_citytrips.py with the same diacritic fold the app's
 * search uses). That makes a citytrip importable as a ready-made day: resolve
 * each stop back to its items_full index and hand the ordered list to the
 * planner's assignments, exactly the shape a hand-built or drafted day has.
 *
 * Resolution is tolerant by design: a stop whose slug no longer matches (the
 * POI was renamed by a re-harvest, or the fold differs on a rare ligature)
 * is skipped rather than failing the import, and the caller gets the count
 * so the UI can say "9 of 10 stops" honestly.
 */
import { loadTrails, loadTrail } from './trails.js';
import { searchFold } from './textSearch.js';

export function poiSlug(name) {
  return searchFold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'poi';
}

/** The published citytrip anchored to this destination, or null. */
export async function findCitytrip(iso2, destId) {
  if (!iso2 || !destId) return null;
  const trips = (await loadTrails(iso2)) || [];   // loadTrails resolves the ARRAY
  return trips.find((tr) => tr.category === 'citytrip' && tr.anchor?.dest === destId) || null;
}

/**
 * Resolve a citytrip detail's stops onto items_full indices, in stop order.
 * `items` is the planner's activity list for the stop's destination; indices
 * returned are positions in that array (the space assignments speak).
 */
export function resolveCitytripStops(detail, items, destId) {
  const bySlug = new Map();
  (items || []).forEach((it, i) => {
    if (!it || it.dup || it.noise) return;
    const s = poiSlug(it.name);
    if (s && !bySlug.has(s)) bySlug.set(s, i);
  });
  const indices = [];
  let missed = 0;
  const prefix = `poi:${destId}:`;
  for (const stop of detail?.stops || []) {
    const ref = stop?.poi_ref || '';
    if (!ref.startsWith(prefix)) { missed += 1; continue; }
    const idx = bySlug.get(ref.slice(prefix.length));
    if (idx == null || indices.includes(idx)) { missed += 1; continue; }
    indices.push(idx);
  }
  return { indices, missed, total: (detail?.stops || []).length };
}

export { loadTrail };
