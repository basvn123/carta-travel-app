/**
 * regions.js, the region layer: the unit between "beach" and "country".
 *
 * Three artifacts, written by pipeline/regions:
 *   /region/index.json     every region (NUTS2, coastal stretch, mountain
 *                          range) with its name, kind and per layer counts
 *   /region/{FILE}.json    one region's page: rated cards ranked, listed
 *                          cards separately (no score key, on purpose),
 *                          editorial picks, and named neighbours so the
 *                          page needs no second fetch to label them
 *   /coverage.json         the audit: per region per layer, published
 *                          against quota and floor, ok | thin | empty | na
 *
 * Region ids carry a colon (COAST:ES-LUZ-CADIZ) and Windows cannot put a
 * colon in a filename, so the export maps ':' to '_' and prefixes reserved
 * device names with R_. fileForRegion() is the mirror of that mapping; the
 * one place it lives on each side.
 *
 * This file also owns the travel bands and the scope ladder, because they
 * are the same idea as the region files: never show "415 km away" under a
 * header that says "near you". A distance is grouped into the band a
 * traveller thinks in (nearby, a day trip, a weekend, worth the journey)
 * and the list header is composed from the scope that actually answered.
 *
 * Same repo gotcha as every loader here, owned by publishedJson.js: under
 * public/ a missing JSON is served as the SPA index with status 200, so
 * fetchPublished() checks the content type first and resolves null instead.
 * A dropped connection rejects with a LayerFetchError rather than passing
 * for an unpublished region.
 */

const RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);


import { makeCache } from './publishedJson.js';

const cached = makeCache();

export function fileForRegion(id) {
  let base = String(id || '').replace(/:/g, '_');
  if (RESERVED.has(base.split('.')[0].toLowerCase())) base = 'R_' + base;
  return `${base}.json`;
}

export function loadRegionIndex() {
  return cached('/region/index.json').then((raw) => {
    if (!raw || !Array.isArray(raw.regions)) return null;
    return {
      generatedAt: raw.generated_at || null,
      model: raw.model || null,
      regions: raw.regions,
      byId: new Map(raw.regions.map((r) => [r.id, r])),
    };
  });
}

export function loadRegion(id) {
  if (!id || !/^[A-Za-z0-9:_-]{2,64}$/.test(id)) return Promise.resolve(null);
  return cached(`/region/${fileForRegion(id)}`).then((raw) => {
    if (!raw || !raw.region) return null;
    return raw;
  });
}

export function loadCoverage() {
  return cached('/coverage.json').then((raw) => {
    if (!raw || !raw.regions) return null;
    return raw;
  });
}

/**
 * Travel bands. The chip on a card answers "can I get there", not "how many
 * kilometres is it": nobody knows what 216 km feels like, everybody knows
 * whether they have an afternoon or a weekend. Cut points are straight line
 * km; the drive time next to the further bands is an estimate and is
 * labelled as one by the tilde its formatter adds.
 */
export const TRAVEL_BANDS = [
  { key: 'nearby', maxKm: 30 },
  { key: 'daytrip', maxKm: 120 },
  { key: 'weekend', maxKm: 300 },
  { key: 'journey', maxKm: Infinity },
];

export function travelBand(km) {
  if (typeof km !== 'number' || !isFinite(km)) return null;
  return TRAVEL_BANDS.find((b) => km <= b.maxKm)?.key ?? 'journey';
}

// The same blunt road model cartaRoute.js uses to compare orderings:
// detour factor on the straight line, one flat speed, a fixed cost for
// getting out of town. It exists to size a chip, not to promise an arrival.
const ROAD_FACTOR = 1.3;
const LEG_KMH = 72;
const LEG_FIXED_H = 0.6;

export function driveHoursEstimate(km) {
  if (typeof km !== 'number' || !isFinite(km) || km <= 0) return null;
  return LEG_FIXED_H + (km * ROAD_FACTOR) / LEG_KMH;
}

export function formatDriveHours(h) {
  if (typeof h !== 'number' || !isFinite(h)) return '';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 60) return `${whole + 1}h00`;
  return `${whole}h${String(mins).padStart(2, '0')}`;
}

/**
 * The chip text for one card. Composed here so all five card kinds say the
 * same thing: "Nearby - 12 km", "Day trip - ~1h20", "Worth the journey -
 * 415 km". `t` is the i18n function.
 */
export function bandChip(km, t) {
  const band = travelBand(km);
  if (!band) return null;
  if (band === 'nearby') {
    return t('band.nearby', { km: Math.round(km) });
  }
  if (band === 'journey') {
    return t('band.journey', { km: Math.round(km) });
  }
  const hours = formatDriveHours(driveHoursEstimate(km));
  return t(band === 'daytrip' ? 'band.daytrip' : 'band.weekend', { hours });
}

/**
 * The scope ladder, resolved from what is actually on the screen: rows
 * with straight line km, nearest first. Returns the scope the header must
 * be composed from. The one rule that is not negotiable: a screen may
 * never render a row beyond 100 km under a "near you" header, which is why
 * the scope is decided by the NEAREST row and the band grouping keeps the
 * far rows under their own headings.
 */
export function scopeForRows(rowsWithKm) {
  const first = rowsWithKm.find((r) => typeof r.km === 'number');
  if (!first) return { scope: 'none', km: null };
  if (first.km <= 30) return { scope: 'nearby', km: first.km };
  if (first.km <= 120) return { scope: 'day_trip', km: first.km };
  if (first.km <= 300) {
    return { scope: 'region', regionName: regionNameOfRow(first), km: first.km };
  }
  return { scope: 'neighbours', regionName: regionNameOfRow(first), km: first.km };
}

function regionNameOfRow(row) {
  // The nearest row names where the good stuff actually is. Beaches and
  // lakes carry an admin region string, mountains carry their range, and a
  // row with neither falls back to the distance phrasing rather than
  // inventing a place name.
  const r = row.r || row;
  return r.region || r.range || null;
}

const BAND_HEAD_KEY = {
  nearby: 'band.headNearby',
  daytrip: 'band.headDaytrip',
  weekend: 'band.headWeekend',
  journey: 'band.headJourney',
};

export function bandHeadKey(km) {
  const band = travelBand(km);
  return band ? BAND_HEAD_KEY[band] : null;
}

/**
 * Whether a band divider belongs BEFORE row i of a km-sorted list, and
 * which one. Dividers render only at boundaries: the first group sits
 * directly under the scope header, and every further row sits under a
 * heading that says how far away it really is. That is what makes "415 km
 * away" impossible to render under "near you": the far rows always have a
 * "worth the journey" rule above them.
 */
export function bandBreak(rowsWithKm, i) {
  if (i <= 0) return null;
  const km = rowsWithKm[i]?.km;
  const prev = rowsWithKm[i - 1]?.km;
  if (typeof km !== 'number' || typeof prev !== 'number') return null;
  const band = travelBand(km);
  return band !== travelBand(prev) ? BAND_HEAD_KEY[band] : null;
}

/**
 * Group rows (already sorted by km ascending) into band sections for
 * rendering. Rows with no km land in one unbanded group at the end.
 */
export function groupByBand(rowsWithKm) {
  const groups = [];
  let current = null;
  for (const row of rowsWithKm) {
    const band = travelBand(row.km) || 'unknown';
    if (!current || current.band !== band) {
      current = { band, rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}

/**
 * Deep link: #region=COAST:ES-LUZ-CADIZ, read once at boot then stripped,
 * cached against StrictMode double mount, same shape as every other layer.
 */
let regionReadResult;

export function readRegionFromUrl() {
  if (regionReadResult !== undefined) return regionReadResult;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#') || !hash.includes('region=')) {
    return (regionReadResult = null);
  }
  const params = new URLSearchParams(hash.slice(1));
  const id = String(params.get('region') || '').slice(0, 64);
  if (!id || !/^[A-Za-z0-9:_-]{2,64}$/.test(id)) return (regionReadResult = null);
  try {
    window.history.replaceState(
      null, '', window.location.pathname + window.location.search);
  } catch { /* the region still opens; only the address bar stays busy */ }
  return (regionReadResult = { id });
}

/** The region a hash names (#region=..., or #country=IT&region=... when it
 *  opened over a country page, T504), or null. Read on every history step,
 *  unlike readRegionFromUrl, which reads the boot address once. */
export function regionFromHash(hash) {
  const m = /(?:^#|&)region=([^&]+)/.exec(String(hash || ''));
  if (!m) return null;
  let id = '';
  try { id = decodeURIComponent(m[1]); } catch { return null; }
  return /^[A-Za-z0-9:_-]{2,64}$/.test(id) ? id : null;
}

export function regionShareUrl(id) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/#region=${encodeURIComponent(id)}`;
}


/* ---------------------------------------------------------------------------
 * The region page's links to the rest of the catalogue (T498, roadmap 1.3b
 * section E). A region file carries outdoor items and no towns, no climate
 * and no price, so the page borrows them from the catalogue rows Explore
 * already holds (usePlaceRows): the towns within reach of the region's
 * items, the nearest priced one for the day price, and the months those
 * towns agree on. All pure, so they are tested in node.
 * ------------------------------------------------------------------------- */

const EARTH_KM = 6371;

function finitePoint(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
}

function kmBetween(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function rowScore(row) {
  const s = row?.rating?.score;
  return Number.isFinite(s) ? s : -Infinity;
}

/** The middle of a region: the mean of its items that carry coordinates
 *  (beaches, lakes, mountains; trails and cycle routes ship none). */
export function regionCentre(cards) {
  const pts = (cards || []).filter(finitePoint);
  if (!pts.length) return null;
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  return { lat, lon };
}

/**
 * The catalogue towns of one country within `km` of any of the region's
 * items, best rated first, at most `max`. No item with coordinates means no
 * honest "here", so the answer is empty rather than the whole country.
 */
export function townsNear(rows, cards, iso2, km = 25, max = 12) {
  const pts = (cards || []).filter(finitePoint);
  if (!pts.length) return [];
  const out = [];
  for (const row of rows || []) {
    if (!finitePoint(row)) continue;
    if (iso2 && row.iso2 !== iso2) continue;
    if (pts.some((p) => kmBetween(p, row) <= km)) out.push(row);
  }
  out.sort((a, b) => (rowScore(b) - rowScore(a)) || String(a.city || '').localeCompare(String(b.city || '')));
  return out.slice(0, max);
}

/**
 * The priced town nearest to `point` within `km`: the same country first,
 * then any, so a border coast never borrows a price from across the line
 * while a town of its own is in reach. Null when nothing priced is close
 * enough, and the page then prints no price at all.
 */
export function nearestPriced(rows, point, iso2, km = 40) {
  if (!finitePoint(point)) return null;
  let same = null;
  let any = null;
  for (const row of rows || []) {
    if (!finitePoint(row) || !Number.isFinite(row.cost?.dayEur)) continue;
    const d = kmBetween(point, row);
    if (d > km) continue;
    if (!any || d < any.d) any = { row, d };
    if (iso2 && row.iso2 === iso2 && (!same || d < same.d)) same = { row, d };
  }
  return (same || any)?.row ?? null;
}

/**
 * The months the towns here agree on (owner answer T489-f): nothing unless
 * at least half the towns carry climate data, then the months that at least
 * half of those towns name as best, ascending.
 */
export function bestMonthsOf(rows) {
  const list = rows || [];
  if (!list.length) return [];
  const withData = list.filter((r) => Array.isArray(r?.climate?.best) && r.climate.best.length);
  if (withData.length * 2 < list.length) return [];
  const tally = new Map();
  for (const r of withData) {
    for (const m of new Set(r.climate.best)) {
      if (Number.isInteger(m) && m >= 1 && m <= 12) tally.set(m, (tally.get(m) || 0) + 1);
    }
  }
  return [...tally.entries()]
    .filter(([, n]) => n * 2 >= withData.length)
    .map(([m]) => m)
    .sort((a, b) => a - b);
}

function regionTotal(r) {
  return Object.values(r?.counts || {}).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
}

/**
 * One country's regions of the given kinds, the fullest first (item counts
 * summed over the layers), empty ones left out. `index` is what
 * loadRegionIndex() resolves to. The country page's "Coasts and ranges"
 * door row reads this.
 */
export function regionsForCountry(index, iso2, { kinds = ['coast', 'range'], limit = 12 } = {}) {
  if (!index || !Array.isArray(index.regions) || !iso2) return [];
  const want = new Set(kinds);
  return index.regions
    .filter((r) => r.country === iso2 && want.has(r.kind) && regionTotal(r) > 0)
    .sort((a, b) => (regionTotal(b) - regionTotal(a)) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);
}
