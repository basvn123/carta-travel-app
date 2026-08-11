/**
 * routing.js, turn an ordered list of day-plan stops into (a) a real walking
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

// FOSSGIS public OSRM instances (no key): one per travel profile.
const OSRM_PROFILES = {
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  driving: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
};

// OSRM's foot/driving profiles route over ferries (a lake or sea crossing is a
// legitimate leg of the journey), and it returns those segments as straight
// lines across the water. Drawn and timed like the rest of the path, they read
// as "walk across the lake", which is impossible. We split the route by travel
// mode so the map can draw ferry legs as a distinct over-water line and the
// itinerary can call them ferries, not walks.
const isFerryStep = (s) => s?.mode === 'ferry';

/** Fold OSRM's steps into (a) contiguous drawing segments tagged by mode and
 *  (b) per-leg walk/ferry breakdowns, so callers never present a ferry hop as
 *  a walk. */
function summarizeRoute(route) {
  const segments = [];
  let cur = null; // { mode: 'walk'|'ferry', coordinates: [[lon,lat],...] }
  const pushCoord = (mode, c) => {
    if (!cur || cur.mode !== mode) {
      // Start each new segment at the previous one's last point so the drawn
      // line stays visually continuous across a mode change.
      const bridge = cur && cur.coordinates.length ? [cur.coordinates[cur.coordinates.length - 1]] : [];
      cur = { mode, coordinates: bridge };
      segments.push(cur);
    }
    cur.coordinates.push(c);
  };

  const legs = (route.legs || []).map((l) => {
    let ferryKm = 0, ferryMin = 0, walkKm = 0, walkMin = 0;
    (l.steps || []).forEach((s) => {
      const mode = isFerryStep(s) ? 'ferry' : 'walk';
      if (mode === 'ferry') { ferryKm += (s.distance || 0) / 1000; ferryMin += (s.duration || 0) / 60; }
      else { walkKm += (s.distance || 0) / 1000; walkMin += (s.duration || 0) / 60; }
      (s.geometry?.coordinates || []).forEach((c) => pushCoord(mode, c));
    });
    return {
      km: (l.distance || 0) / 1000,
      min: Math.max(1, Math.round((l.duration || 0) / 60)),
      ferry: ferryKm > 0,
      ferryKm, walkKm,
      ferryMin: ferryKm > 0 ? Math.max(1, Math.round(ferryMin)) : 0,
      walkMin: walkKm > 0 ? Math.max(1, Math.round(walkMin)) : 0,
    };
  });

  return {
    geometry: route.geometry.coordinates, // [[lon,lat], ...] - full path (fallback)
    segments: segments.filter((s) => s.coordinates.length >= 2),
    legs,
    km: (route.distance || 0) / 1000,
    min: Math.max(1, Math.round((route.duration || 0) / 60)),
    hasFerry: legs.some((l) => l.ferry),
  };
}

/** points: [{ lat, lon }, ...] in visiting order (needs >= 2 with coordinates).
 *  Resolves to { geometry, segments: [{ mode, coordinates }], legs: [{ km, min,
 *  ferry, walkKm, walkMin, ferryKm, ferryMin }], km, min, hasFerry } or null
 *  (fetch failed, too few points, or the router had no answer). */
export async function fetchRoute(points, profile = 'foot') {
  const base = OSRM_PROFILES[profile] || OSRM_PROFILES.foot;
  const pts = (points || []).filter((p) => p && p.lat != null && p.lon != null);
  if (pts.length < 2) return null;
  const coords = pts.map((p) => `${p.lon},${p.lat}`).join(';');
  // steps=true so we can tell walking apart from ferry crossings within a leg.
  //
  // radiuses=unlimited is what keeps a whole day's route from collapsing to
  // straight lines. Our coordinates are the sight itself, which for a hilltop
  // fortress, an abbey courtyard or a beach can be hundreds of metres from the
  // nearest routable path; past OSRM's default snapping radius it answers
  // NoSegment for the entire request, we fall back to hop-to-hop straight
  // lines, and the map draws a walk through buildings and across a river.
  // Unlimited snapping lets it walk from the nearest real path instead.
  const url = `${base}/${coords}?overview=full&geometries=geojson&steps=true`
    + `&radiuses=${pts.map(() => 'unlimited').join(';')}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const route = j?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return null;
    return summarizeRoute(route);
  } catch {
    return null;
  }
}

/** The street-following walking route through the points (day planner). */
export function fetchWalkingRoute(points) {
  return fetchRoute(points, 'foot');
}

/** The road route through the points (trip planner's city-to-city itinerary). */
export function fetchDrivingRoute(points) {
  return fetchRoute(points, 'driving');
}

// Google's non-API directions link accepts a bounded number of waypoints; keep
// origin + destination and up to this many intermediate stops (extra ones are
// still visitable, just not encoded as separate waypoints in the link).
const MAX_GMAPS_WAYPOINTS = 9;

/** Build a Google Maps directions URL through the ordered points.
 *  Each point is { lat, lon }. We encode every stop as a bare "lat,lng": a
 *  coordinate ALWAYS resolves to that exact spot and Google always draws the
 *  route, whereas a place-name query ("Duomo di Como, Como", "your stay") can
 *  fail to geocode and land the traveller on a "can't find this place" search
 *  page with no route at all, which is exactly what coordinates avoid. Google
 *  still reverse-geocodes each pin to a readable label in the directions panel.
 *  mode: 'walking' | 'driving' | 'bicycling' | 'transit'. Returns null if there
 *  aren't at least two points with finite coordinates. */
export function googleMapsDirUrl(points, mode = 'walking') {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
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
