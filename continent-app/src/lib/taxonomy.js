// The three axes of a destination card (PLAN.md C1), defined once.
//
// A card must answer three separate questions, and each answer gets exactly
// one visual home so they never compete:
//
//   Kind     what it is       metro / city / town / village / area
//   Verdict  how good it is   tier 3/2/1/none, plus the hidden-gem flag
//   Role     what you do      base / basecamp / daytrip / stop
//
// Kind and verdict are read straight off the published record. Role is
// DERIVED here from fields the wire already carries (visit hours, base
// suitability, transit quality, coordinates), which is why this module and
// not the pipeline owns it: no data work, one place to test the boundaries.
//
// The role rules in PLAN.md left gaps (a 4-hour town with poor transit
// matched nothing), so the cascade below is total by construction: every
// destination falls through to exactly one role, and the boundary tests in
// tests/taxonomy.test.mjs pin each edge.

export const KINDS = ["metro", "city", "town", "village", "area"];

// Role thresholds. visit_h is the pipeline's "hours to see the highlights";
// base is place.base, 0-1 "how well it works as a place to sleep".
export const ROLE_RULES = {
  STOP_MAX_H: 3, // under this, it is a stop on the way
  BASE_MIN_H: 8, // a place you give whole days to...
  BASE_MIN_SUIT: 0.6, // ...if it also sleeps well
  BASECAMP_MIN_H: 5, // enough here for a day...
  BASECAMP_MAX_H: 8, // ...but not a whole trip
  BASECAMP_MIN_NEARBY: 4, // and at least this many rides out
  DAYTRIP_MAX_H: 6, // fits in one day from elsewhere
  FALLBACK_BASE_MIN_H: 6.5, // leftover big places still anchor a stay
  NEARBY_KM: 45, // ~60 min by road or rail, from coordinates
};

export const ROLES = {
  base: { key: "base", labelKey: "role.base", en: "Stay 2-3 days" },
  basecamp: {
    key: "basecamp",
    labelKey: "role.basecamp",
    en: "Sleep here, ride out",
  },
  daytrip: { key: "daytrip", labelKey: "role.daytrip", en: "A day, from nearby" },
  stop: { key: "stop", labelKey: "role.stop", en: "Two hours, en route" },
};

export function kindOf(dest) {
  const cls = dest?.place?.class;
  return KINDS.includes(cls) ? cls : "city";
}

// {tier, label, gem, confidence}: the verdict axis, read off dest.rating.
export function verdictOf(dest) {
  const r = dest?.rating || {};
  return {
    tier: r.tier ?? 0,
    label: r.label ?? null,
    gem: Boolean(r.hidden_gem),
    confidence: r.confidence ?? null,
  };
}

// Total role cascade. `nearbyCount` is how many other catalogue destinations
// sit within NEARBY_KM (see buildNearbyIndex); pass 0 when unknown and the
// basecamp rule simply never fires.
export function roleOf(dest, nearbyCount = 0) {
  const R = ROLE_RULES;
  const h = dest?.place?.visit_h ?? 4;
  const suit = dest?.place?.base ?? 0;
  const transit = dest?.local_transport?.transit_quality;

  if (h < R.STOP_MAX_H) return ROLES.stop;
  if (h >= R.BASE_MIN_H && suit >= R.BASE_MIN_SUIT) return ROLES.base;
  if (
    h >= R.BASECAMP_MIN_H &&
    h <= R.BASECAMP_MAX_H &&
    nearbyCount >= R.BASECAMP_MIN_NEARBY
  )
    return ROLES.basecamp;
  if (
    h >= R.STOP_MAX_H &&
    h <= R.DAYTRIP_MAX_H &&
    (transit === "good" || transit === "excellent")
  )
    return ROLES.daytrip;
  // Nothing above matched: big places still anchor a stay, the rest fit in
  // a day whatever the bus timetable says, because you can also drive.
  if (h >= R.FALLBACK_BASE_MIN_H) return ROLES.base;
  return ROLES.daytrip;
}

// One pass over the catalogue -> { id: neighbours within NEARBY_KM }.
// Coarse grid buckets keep it O(n) instead of O(n^2); at 3,038 destinations
// the whole build is a few milliseconds and is done once per session.
export function buildNearbyIndex(dests) {
  const R = ROLE_RULES.NEARBY_KM;
  const cell = R / 111; // ~degrees latitude per bucket
  const buckets = new Map();
  const rows = [];
  for (const [id, d] of Object.entries(dests)) {
    const lat = d.city_lat ?? d.lat;
    const lon = d.city_lon ?? d.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const row = { id, lat, lon };
    rows.push(row);
    const key = `${Math.floor(lat / cell)}:${Math.floor(lon / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const out = {};
  for (const row of rows) {
    const bi = Math.floor(row.lat / cell);
    const bj = Math.floor(row.lon / cell);
    let n = 0;
    for (let i = bi - 1; i <= bi + 1; i++) {
      for (let j = bj - 1; j <= bj + 1; j++) {
        for (const other of buckets.get(`${i}:${j}`) || []) {
          if (other.id === row.id) continue;
          if (haversineKm(row.lat, row.lon, other.lat, other.lon) <= R) n++;
        }
      }
    }
    out[row.id] = n;
  }
  return out;
}

export function haversineKm(la1, lo1, la2, lo2) {
  const r = 6371;
  const p1 = (la1 * Math.PI) / 180;
  const p2 = (la2 * Math.PI) / 180;
  const dp = ((la2 - la1) * Math.PI) / 180;
  const dl = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}
