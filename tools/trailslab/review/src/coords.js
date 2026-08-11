// Coordinate guards, the same contract as continent-app/src/map/coords.js.
//
// MapLibre's LngLat constructor throws on NaN or Infinity, and fitBounds,
// flyTo and setLngLat all funnel through it, so one bad vertex in a staged
// geometry would blank the review app instead of showing the reviewer the
// broken trip they are here to look at. Staging data is exactly where bad
// vertices live: half-assembled relations, portal rows with dropped
// ordinates, a repaired geometry spliced from a router error. Everything
// that reaches the map goes through here first and unusable points are
// dropped rather than plotted.

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// A GeoJSON position: [lon, lat], both finite and on the planet.
export const isPos = (p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])
  && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

export const finitePositions = (arr) => (Array.isArray(arr) ? arr.filter(isPos) : []);

/**
 * Keep only the plottable parts of a LineString or MultiLineString.
 *
 * Returns a MultiLineString whose parts each hold at least two usable
 * points, plus how many points were dropped, so the map can say so out loud
 * rather than silently drawing a shorter trail than the one in the DB.
 */
export function cleanLines(geometry) {
  if (!geometry) return { geometry: null, dropped: 0, parts: 0 };
  const raw = geometry.type === 'LineString' ? [geometry.coordinates]
    : geometry.type === 'MultiLineString' ? geometry.coordinates
      : [];
  let dropped = 0;
  const parts = [];
  for (const part of raw) {
    if (!Array.isArray(part)) continue;
    const kept = finitePositions(part);
    dropped += part.length - kept.length;
    if (kept.length >= 2) parts.push(kept);
  }
  return {
    geometry: parts.length ? { type: 'MultiLineString', coordinates: parts } : null,
    dropped,
    parts: parts.length,
  };
}

/**
 * Bounds as [[west, south], [east, north]], or null when nothing is plottable.
 * Degenerate boxes (a single point, a perfectly straight meridian) are padded,
 * because fitBounds on a zero-area box zooms to the maximum and shows nothing.
 */
export function boundsOf(geometry) {
  const { geometry: clean } = cleanLines(geometry);
  if (!clean) return null;
  let w = 180; let s = 90; let e = -180; let n = -90;
  for (const part of clean.coordinates) {
    for (const [lon, lat] of part) {
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  if (!isNum(w) || !isNum(s) || !isNum(e) || !isNum(n)) return null;
  const pad = 0.0015;
  if (e - w < pad) { w -= pad; e += pad; }
  if (n - s < pad) { s -= pad; n += pad; }
  return [[w, s], [e, n]];
}
