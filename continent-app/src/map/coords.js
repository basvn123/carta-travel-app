// Guards that keep non-finite coordinates from ever reaching MapLibre.
//
// MapLibre's LngLat constructor throws on NaN/Infinity (the "Invalid LngLat
// object: (NaN, -90)" crash), and setLngLat / flyTo / jumpTo / easeTo /
// fitBounds / LngLatBounds all funnel through it. Because a single throw during
// one of those calls bubbles up to the app-wide ErrorBoundary, ONE bad point
// (a half-geocoded stay, a dropped city_lat, a stale saved plan, an origin that
// no longer resolves) would blank the entire app on load, and "Try again" just
// re-crashes on the same persisted state. Every coordinate that flows into a
// map goes through here first, so a bad point is quietly skipped instead.

// A real, finite number. Rejects null, undefined, NaN, +/-Infinity, and the
// numeric strings that `!= null` checks let slip through.
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// True when a { lat, lon } pair is safe to hand to MapLibre.
export const hasLngLat = (o) => !!o && isNum(o.lat) && isNum(o.lon);

// [lon, lat] tuple for MapLibre, or null when either coordinate is unusable.
export const lngLat = (o) => (hasLngLat(o) ? [o.lon, o.lat] : null);

// Keep only the points MapLibre can actually plot.
export const finitePts = (arr) => (Array.isArray(arr) ? arr.filter(hasLngLat) : []);
