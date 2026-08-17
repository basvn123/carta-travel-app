/**
 * trailGeo.js, the geometry a drawn route needs at runtime.
 *
 * The wire ships a line and its totals; following that line in the app asks
 * questions the wire cannot answer: how far along a GPS fix is, how much
 * climbing is left, whether the walker has wandered off the path. Everything
 * here measures against the line the map is already drawing, so the numbers in
 * the follow HUD and the numbers on the card come from the same source.
 *
 * All distances are metres. A MultiLineString's gaps between segments add
 * nothing to the running total, which keeps the sum here equal to the wire's
 * own distance_m (export_wire.py sums segment lengths the same way).
 */

const R = 6371008.8; // mean earth radius, metres
const RAD = Math.PI / 180;

const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** Great-circle metres between two [lon, lat] pairs. */
export function metresBetween(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * One flat point sequence for a LineString or MultiLineString, each point
 * carrying the distance walked to reach it:
 *   [{ lon, lat, ele, m }]      ele is null when the wire ships 2D coordinates
 * Points that repeat the previous position are dropped (they would make
 * zero-length segments the projection below has to special-case).
 */
export function routePoints(geometry) {
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords)) return [];
  const lines = geometry.type === 'LineString' ? [coords] : coords;
  const out = [];
  let m = 0;
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    let prev = null;
    for (const pt of line) {
      if (!Array.isArray(pt) || !isFiniteNum(pt[0]) || !isFiniteNum(pt[1])) continue;
      const p = { lon: pt[0], lat: pt[1], ele: isFiniteNum(pt[2]) ? pt[2] : null, m };
      if (prev) {
        const step = metresBetween(prev.lon, prev.lat, p.lon, p.lat);
        if (step < 0.5) continue; // same spot twice
        m += step;
        p.m = m;
      }
      out.push(p);
      prev = p;
    }
    // A gap to the next segment is not walked distance, so m carries over.
  }
  return out;
}

/** Metres walked over the whole sequence. */
export const routeLength = (pts) => (pts.length ? pts[pts.length - 1].m : 0);

/**
 * Project a fix onto the route: how far along it sits (m), how far off the
 * line it is (offM), and the point on the line itself. Segments that only
 * bridge two MultiLineString pieces carry no walked distance and are skipped,
 * so a fix never lands "on" a gap the walker cannot use.
 */
export function nearestOnRoute(pts, lat, lon) {
  if (!pts || pts.length === 0) return null;
  if (pts.length === 1) {
    return { m: 0, offM: metresBetween(pts[0].lon, pts[0].lat, lon, lat), lon: pts[0].lon, lat: pts[0].lat, idx: 0 };
  }
  // Local metres around the fix: over a segment of a few hundred metres this
  // is exact enough for a projection, and it keeps the loop cheap.
  const kx = Math.cos(lat * RAD) * R * RAD;
  const ky = R * RAD;
  const px = lon * kx;
  const py = lat * ky;
  let best = null;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const segM = b.m - a.m;
    if (segM <= 0) continue; // a gap between segments
    const ax = a.lon * kx, ay = a.lat * ky;
    const bx = b.lon * kx, by = b.lat * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const cx = ax + t * dx, cy = ay + t * dy;
    const off = Math.hypot(px - cx, py - cy);
    if (!best || off < best.offM) {
      best = { m: a.m + t * segM, offM: off, lon: cx / kx, lat: cy / ky, idx: i };
    }
  }
  return best;
}

/**
 * The line split at a distance along it: what has been walked and what is
 * left, both as [lon, lat] arrays ready for a GeoJSON source. The split point
 * is added to both halves so the two lines meet.
 */
export function sliceRoute(pts, m) {
  const done = [];
  const rest = [];
  if (!pts?.length) return { done, rest };
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    if (p.m <= m) {
      done.push([p.lon, p.lat]);
      const next = pts[i + 1];
      if (next && next.m > m && next.m > p.m) {
        const t = (m - p.m) / (next.m - p.m);
        const cut = [p.lon + t * (next.lon - p.lon), p.lat + t * (next.lat - p.lat)];
        done.push(cut);
        rest.push(cut);
      }
    } else {
      rest.push([p.lon, p.lat]);
    }
  }
  return { done, rest };
}

/**
 * The climbing and the dropping still ahead after a point on the route, from
 * the wire's profile ([[distM, eleM], ...]). Both, because the time estimate
 * below charges for descent too. Null without a profile.
 */
export function remainingRelief(profile, m) {
  if (!Array.isArray(profile) || profile.length < 2) return null;
  let up = 0;
  let down = 0;
  let prev = null;
  for (const row of profile) {
    if (!Array.isArray(row) || !isFiniteNum(row[0]) || !isFiniteNum(row[1])) continue;
    if (row[0] < m) { prev = row; continue; }
    if (prev) {
      const d = row[1] - prev[1];
      if (d > 0) up += d; else down -= d;
    }
    prev = row;
  }
  return { up: Math.round(up), down: Math.round(down) };
}

/**
 * DIN 33466, the walking-time rule the wire itself used: 4 km/h flat,
 * 300 m/h up, 500 m/h down, then the larger of the two times plus half the
 * smaller. Reproducing it here means a remaining-time estimate on the trail
 * agrees with the total printed on the page.
 */
export function hikeTimeMin(distM, ascentM = 0, descentM = 0) {
  if (!isFiniteNum(distM) || distM <= 0) return null;
  const flat = distM / 4000;
  const vert = Math.max(0, ascentM || 0) / 300 + Math.max(0, descentM || 0) / 500;
  const hours = Math.max(flat, vert) + Math.min(flat, vert) / 2;
  return Math.round(hours * 60);
}

/** True when the route ends where it started, allowing for a car park's worth
 *  of slack on a short walk and a little more on a long one. */
export function isLoopRoute(pts) {
  if (!pts || pts.length < 3) return false;
  const total = routeLength(pts);
  if (total < 500) return false;
  const gap = metresBetween(pts[0].lon, pts[0].lat, pts[pts.length - 1].lon, pts[pts.length - 1].lat);
  return gap <= Math.max(150, total * 0.02);
}
