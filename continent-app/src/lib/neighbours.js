/**
 * neighbours.js, the cross-layer join arriving in the app (brief 08).
 *
 * pipeline/joins/neighbours.py runs after every layer export and stamps an
 * `nb` object of neighbour ids into each published row:
 *
 *   nb: { trail: ['65085'], lake: ['si-lake-bled-Q648902'], ... }
 *
 * Keys are the layer short names (beach, lake, peak, trail, cycle) and ids
 * point into the SAME country's wire files, which this module resolves
 * against the session's cached country loads. No geo query ever runs in the
 * browser; the spatial work happened at build time.
 *
 * The key is `nb`, not `near`: mountain rows already carry `near` as the
 * nearest priceable hub and MountainPage reads it.
 */
import { useEffect, useState } from 'react';
import { loadBeaches, loadListedBeaches } from './beaches.js';
import { loadLakes, loadListedLakes } from './lakes.js';
import { loadMountains, loadListedMountains } from './mountains.js';
import { loadTrails, loadListedTrails } from './trails.js';
import { loadCycling } from './cycling.js';
import { bboxCentre, haversineKm } from './trailCards.js';

/** Stable render order: walking first, then water, then the rest. */
export const NB_ORDER = ['trail', 'peak', 'lake', 'beach', 'cycle'];

function loadLayer(layer, cc) {
  switch (layer) {
    case 'beach':
      return Promise.all([loadBeaches(cc), loadListedBeaches(cc)])
        .then(([r, l]) => [...(r || []), ...(l || [])]);
    case 'lake':
      return Promise.all([loadLakes(cc), loadListedLakes(cc)])
        .then(([r, l]) => [...(r || []), ...(l || [])]);
    case 'peak':
      return Promise.all([loadMountains(cc), loadListedMountains(cc)])
        .then(([r, l]) => [...(r || []), ...(l || [])]);
    case 'trail':
      return Promise.all([loadTrails(cc), loadListedTrails(cc)])
        .then(([r, l]) => [...(r || []), ...(l || [])]);
    case 'cycle':
      return loadCycling(cc)
        .then((d) => (d ? [...d.routes, ...d.listed] : []));
    default:
      return Promise.resolve([]);
  }
}

/** A row's representative point, whatever the layer's geometry. */
export function nbCentre(row) {
  if (Number.isFinite(row?.lat) && Number.isFinite(row?.lon)) {
    return { lat: row.lat, lon: row.lon };
  }
  const c = bboxCentre(row?.bbox);
  return c ? { lat: c.lat, lon: c.lon } : null;
}

/** The card thumbnail, whatever the layer's image shape. Null is a valid
 *  answer and renders as a map-toned placeholder, never a broken img. */
export function nbPhoto(row) {
  if (row?.img?.u) return row.img.u; // trails, cycling
  const im = Array.isArray(row?.images) ? row.images[0] : null;
  return im?.u || null;
}

/**
 * Resolve one row's `nb` block against its country's wire files.
 * -> { trail: [rows], ... } with only non-empty layers, ids kept in the
 * build's rank order (rated first, then distance). `null` while loading.
 */
export function useNeighbours(cc, nb) {
  const [out, setOut] = useState(null);
  const sig = nb ? JSON.stringify(Object.keys(nb).map((k) => [k, nb[k].length])) : '';
  useEffect(() => {
    let live = true;
    if (!nb || !cc) { setOut({}); return undefined; }
    const layers = NB_ORDER.filter((k) => Array.isArray(nb[k]) && nb[k].length);
    Promise.all(layers.map((layer) => loadLayer(layer, cc).then((rows) => {
      const byId = new Map(rows.map((r) => [String(r.id), r]));
      return [layer, nb[layer].map((id) => byId.get(String(id))).filter(Boolean)];
    }))).then((pairs) => {
      if (!live) return;
      const resolved = {};
      for (const [layer, rows] of pairs) if (rows.length) resolved[layer] = rows;
      setOut(resolved);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cc, sig]);
  return out;
}

/** km from a source row to a neighbour, for the card's distance chip. */
export function nbDistanceKm(fromRow, toRow) {
  const a = nbCentre(fromRow);
  const b = nbCentre(toRow);
  if (!a || !b) return null;
  return haversineKm(a.lat, a.lon, b.lat, b.lon);
}
