/**
 * routing.js - turn an ordered list of day-plan stops into (a) a real walking
 * route we can draw on our own map, and (b) a Google Maps link the traveller
 * can open and navigate.
 *
 * Both are keyless and free, matching the rest of the app:
 *   - fetchWalkingRoute() hits the FOSSGIS-hosted OSRM foot instance (the same
 *     routing engine behind openstreetmap.org's "Directions"). It returns the
 *     street-following path geometry plus per-leg distance/time. On any failure
 *     it resolves to null so callers fall back to straight lines + estimates.
 *   - googleMapsDirUrl() builds a Google Maps directions deep-link with the
 *     stops as origin/waypoints/destination, so "Open in Google Maps" gives the
 *     real turn-by-turn route on the traveller's phone.
 */

// FOSSGIS public OSRM foot profile (no key). Path segment after v1 is always
// "foot" here; the instance is the pedestrian one.
const OSRM_FOOT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

/** points: [{ lat, lon }, ...] in visiting order (needs >= 2 with coordinates).
 *  Resolves to { geometry: [[lon,lat],...], legs: [{ km, min }], km, min } or
 *  null (fetch failed, too few points, or the router had no answer). */
export async function fetchWalkingRoute(points) {
  const pts = (points || []).filter((p) => p && p.lat != null && p.lon != null);
  if (pts.length < 2) return null;
  const coords = pts.map((p) => `${p.lon},${p.lat}`).join(';');
  const url = `${OSRM_FOOT}/${coords}?overview=full&geometries=geojson&steps=false`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const route = j?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return null;
    return {
      geometry: route.geometry.coordinates, // [[lon,lat], ...]
      legs: (route.legs || []).map((l) => ({
        km: (l.distance || 0) / 1000,
        min: Math.max(1, Math.round((l.duration || 0) / 60)),
      })),
      km: (route.distance || 0) / 1000,
      min: Math.max(1, Math.round((route.duration || 0) / 60)),
    };
  } catch {
    return null;
  }
}

// Google's non-API directions link accepts a bounded number of waypoints; keep
// origin + destination and up to this many intermediate stops (extra ones are
// still visitable, just not encoded as separate waypoints in the link).
const MAX_GMAPS_WAYPOINTS = 9;

/** Build a Google Maps directions URL through the ordered points.
 *  mode: 'walking' | 'driving' | 'bicycling' | 'transit'. Returns null if there
 *  aren't at least two points with coordinates. */
export function googleMapsDirUrl(points, mode = 'walking') {
  const pts = (points || []).filter((p) => p && p.lat != null && p.lon != null);
  if (pts.length < 2) return null;
  const ll = (p) => `${p.lat},${p.lon}`;
  const origin = pts[0];
  const destination = pts[pts.length - 1];
  let middle = pts.slice(1, -1);
  if (middle.length > MAX_GMAPS_WAYPOINTS) {
    // Keep an evenly-spaced subset so the link still traces the day's shape.
    const step = middle.length / MAX_GMAPS_WAYPOINTS;
    middle = Array.from({ length: MAX_GMAPS_WAYPOINTS }, (_, i) => middle[Math.floor(i * step)]);
  }
  const params = new URLSearchParams({
    api: '1', travelmode: mode, origin: ll(origin), destination: ll(destination),
  });
  if (middle.length) params.set('waypoints', middle.map(ll).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
