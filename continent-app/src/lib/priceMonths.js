/*
 * priceMonths.js (T103, spec I5): the price row under the weather row.
 *
 * The only monthly money signal Carta measures is the twelve-month nightly
 * stay curve of a destination (accommodation.seasonality, from Inside Airbnb
 * calendars, a ratio to the year's mean). Journeys carry no monthly price of
 * their own, so a trip borrows the curve of the nearest destination that has
 * one, within MAX_KM of the trip's own point. No curve in range means no row:
 * the page says so plainly. Nothing here prices a flight (T272).
 */

export const MAX_KM = 30;
export const CHEAP_BELOW = 0.92;   // a month this far under the year's mean reads cheap
export const DEAR_ABOVE = 1.08;    // and this far over reads dear

function haversineKm(lat1, lon1, lat2, lon2) {
  const p = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * p) / 2) ** 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

const isCurve = (s) => Array.isArray(s) && s.length === 12 && s.every((v) => Number.isFinite(v) && v > 0);

/** The nearest destination with a measured curve within `maxKm`, or null.
 *  `destinations` is the catalogue's id -> record map. */
export function nearestCurve(destinations, lat, lon, maxKm = MAX_KM) {
  if (!destinations || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null;
  for (const [id, d] of Object.entries(destinations)) {
    const s = d?.accommodation?.seasonality;
    if (!isCurve(s) || !Number.isFinite(d.city_lat) || !Number.isFinite(d.city_lon)) continue;
    const km = haversineKm(lat, lon, d.city_lat, d.city_lon);
    if (km <= maxKm && (!best || km < best.km)) {
      best = { id, place: d.city || d.name || id, km, curve: s };
    }
  }
  return best;
}

/** Twelve states, 'cheap' | 'mid' | 'dear', against the curve's own mean. */
export function priceStates(curve) {
  if (!isCurve(curve)) return null;
  const mean = curve.reduce((a, b) => a + b, 0) / 12;
  return curve.map((v) => {
    const r = v / mean;
    return r <= CHEAP_BELOW ? 'cheap' : r >= DEAR_ABOVE ? 'dear' : 'mid';
  });
}

/** Month numbers (1 to 12) that are good by weather and cheap by price. */
export function goodAndCheap(good, states) {
  if (!states) return [];
  return (good || []).filter((m) => states[m - 1] === 'cheap').sort((a, b) => a - b);
}

/** The shape MonthStrip takes, or null when no curve is in range. */
export function priceRow(destinations, lat, lon, good) {
  const hit = nearestCurve(destinations, lat, lon);
  if (!hit) return null;
  const states = priceStates(hit.curve);
  return { states, place: hit.place, km: Math.round(hit.km), both: goodAndCheap(good, states) };
}
