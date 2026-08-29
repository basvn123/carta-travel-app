/**
 * regions.js, the region layer: the unit between "beach" and "country".
 *
 * Three artifacts, written by pipeline/regions:
 *   /region/index.json     every region (NUTS2, coastal stretch, mountain
 *                          range) with its name, kind and per layer counts
 *   /region/{FILE}.json    one region's page: rated cards ranked, listed
 *                          cards separately (no score key, on purpose),
 *                          editorial picks and neighbouring region ids
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
 * Same repo gotcha as every loader here: under public/ a missing JSON is
 * served as the SPA index with status 200, so every fetch checks the
 * content type first and resolves null instead.
 */

const RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

function isJson(res) {
  return res.ok && (res.headers.get('content-type') || '').includes('json');
}

function loadJson(url) {
  return fetch(url)
    .then((r) => (isJson(r) ? r.json() : null))
    .catch(() => null);
}

// Cached per URL: these files never change inside a session.
const cache = new Map();

function cached(url) {
  if (!cache.has(url)) cache.set(url, loadJson(url));
  return cache.get(url);
}

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
  // The nearest row names where the good stuff actually is: its stretch or
  // region from the wire's rg block via the region index when loaded, its
  // plain admin region string otherwise, its country as a last resort.
  const r = row.r || row;
  return r.region || null;
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

export function regionShareUrl(id) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/#region=${encodeURIComponent(id)}`;
}
