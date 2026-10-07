/**
 * coverageCases.js, the pure half of the coverage empty-state module (T367,
 * split out of lib/coverageEmpty.js so it can be tested in Node without the
 * layer loaders): why a list is empty, where a country is and which countries
 * border it, and how far a row is from a point or from another row.
 * lib/coverageEmpty.js re-exports all of it beside the loaders.
 */
import { haversineKm } from './nearby.js';
import { bboxCentre } from './detailSkeleton.js';

/** Centre of each microstate, the neighbours the nearest three come from,
 *  its area where the contract knows it (coverage.py MICROSTATES), and the
 *  category of the layer the traveller can be sent to instead. */
export const MICROSTATES = {
  MC: { lat: 43.738, lon: 7.424, area: 2, near: ['FR', 'IT'], other: 'beaches' },
  SM: { lat: 43.942, lon: 12.458, area: 61, near: ['IT'], other: 'trails' },
  LI: { lat: 47.166, lon: 9.555, area: 160, near: ['CH', 'AT'], other: 'trails' },
  AD: { lat: 42.546, lon: 1.601, area: null, near: ['ES', 'FR'], other: 'trails' },
  FO: { lat: 62.01, lon: -6.77, area: null, near: ['IS', 'NO', 'GB'], other: 'trails' },
  MT: { lat: 35.937, lon: 14.375, area: null, near: ['IT'], other: 'trails' },
  MD: { lat: 47.01, lon: 28.86, area: null, near: ['RO', 'UA'], other: 'trails' },
};

/** A nearest row further than this is across a sea, not a border: the module
 *  hides the rows and says where the nearest one is (the Faroes). */
export const FAR_KM = 300;

/** Which sentence each empty layer of each microstate takes, and its code.
 *  Keys are `${cc}:${layer}`; the sentence key is `cov.reason.{key}`. */
const CASES = {
  'MC:lake': ['noLake', 'not_applicable'],
  'MC:mountain': ['noRelief', 'not_applicable'],
  'MC:cycling': ['tooSmall', 'not_applicable'],
  'SM:beach': ['noCoast', 'not_applicable'],
  'SM:lake': ['noLake', 'not_applicable'],
  'SM:cycling': ['tooSmall', 'not_applicable'],
  'LI:beach': ['noCoast', 'not_applicable'],
  'LI:lake': ['noLake', 'not_applicable'],
  'LI:cycling': ['sharedNetwork', 'not_applicable'],
  'AD:beach': ['noCoast', 'not_applicable'],
  'FO:cycling': ['noRoute', 'below_quota'],
  'MD:cycling': ['noRoute', 'below_quota'],
  'MD:beach': ['riverBeach', 'not_applicable'],
};

/** The empty-state case for one layer in one microstate, or null when the
 *  country is not one of the seven or the layer is not empty there. The
 *  wire's own code wins when the contract is on it. */
export function microCase(coverage, layer, cc) {
  const hit = CASES[`${cc}:${layer}`];
  if (!hit || !MICROSTATES[cc]) return null;
  const wire = coverage?.contract?.countries?.[cc]?.[layer]?.code;
  return {
    key: hit[0],
    code: wire || hit[1],
    area: MICROSTATES[cc].area,
    other: MICROSTATES[cc].other,
    micro: true,
  };
}

/** The wire's `why` on an `na` region, against the sentence it takes. */
export const WHY_KEY = {
  no_coast_or_large_lakes: 'noCoast',
  no_lakes_over_5ha: 'noLake',
  relief_below_250m: 'noRelief',
};

/** The contract's seven reason codes (spec 0.4), against their sentences. */
export const CODE_KEY = {
  not_applicable: 'notApplicable',
  no_open_data: 'noOpenData',
  way_only_not_derived: 'wayOnly',
  failed_continuity: 'gaps',
  below_quota: 'belowQuota',
  licence_blocked: 'licence',
  pending_partnership: 'partnership',
};

/** The coverage wire's layer key against the Destinations tab category. */
export const LAYER_CAT = {
  trail: 'trails', beach: 'beaches', lake: 'lakes', mountain: 'mountains', cycling: 'cycling',
};

// NUTS prefixes that differ from ISO 3166 alpha-2.
const NUTS_PREFIX = { GR: 'EL', GB: 'UK' };

function regionsOf(coverage, cc) {
  if (!cc) return [];
  const prefixes = [cc, NUTS_PREFIX[cc]].filter(Boolean);
  return Object.entries(coverage?.regions || {})
    .filter(([id]) => prefixes.some((p) => id.startsWith(p)))
    .map(([, entry]) => entry);
}

/** The layer this country DOES publish, for the "See its walks" button: the
 *  first of walks, beaches, lakes, mountains and cycling with a row on the
 *  region audit, other than the empty one. Null when the audit knows none. */
export function otherLayer(coverage, cc, layer) {
  const regions = regionsOf(coverage, cc);
  for (const l of ['trail', 'beach', 'lake', 'mountain', 'cycling']) {
    if (l === layer) continue;
    if (regions.some((r) => (r?.[l]?.r || 0) > 0)) return LAYER_CAT[l];
  }
  return null;
}

/**
 * Why `layer` is empty in country `cc`, from the best source there is.
 *   { key, code, area?, other, m?, holder?, micro? }
 * `key` names the sentence (`cov.reason.{key}`); `code` is the contract's
 * reason code where one applies, null where the wire only says "nothing yet".
 * Never null: the weakest answer is 'empty', "coverage grows country by
 * country", which is true of any empty country.
 */
export function countryCase(coverage, layer, cc) {
  const micro = microCase(coverage, layer, cc);
  if (micro) return micro;
  const other = otherLayer(coverage, cc, layer);
  const by = coverage?.contract?.countries;
  const cell = by && cc ? (by[cc]?.[layer] || by[NUTS_PREFIX[cc]]?.[layer] || null) : null;
  if (cell?.code && CODE_KEY[cell.code]) {
    const m = Math.max(0, (cell.must || 0) - (cell.must_published || 0));
    let key = CODE_KEY[cell.code];
    if (key === 'belowQuota' && !m) key = 'empty';
    if (key === 'notApplicable' && cell.why && WHY_KEY[cell.why]) key = WHY_KEY[cell.why];
    if (key === 'partnership' && !cell.detail?.holder) key = 'partnerUnnamed';
    return {
      key, code: cell.code, other, m, holder: cell.detail?.holder || null,
    };
  }
  const regions = regionsOf(coverage, cc).map((r) => r?.[layer]).filter(Boolean);
  if (regions.length && regions.every((e) => e.status === 'na')) {
    const tally = {};
    for (const e of regions) if (e.why) tally[e.why] = (tally[e.why] || 0) + 1;
    const why = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    if (why && WHY_KEY[why]) return { key: WHY_KEY[why], code: 'not_applicable', other };
  }
  return { key: 'empty', code: null, other };
}

/** Does the reason say the layer cannot exist here (no coast, no lake, no
 *  relief, too small)? Then the useful button is another layer, not another
 *  country. */
export const IMPOSSIBLE = new Set(['noLake', 'noCoast', 'noRelief', 'tooSmall', 'riverBeach']);

/**
 * Where a country is, for the nearest rows, and which countries it borders,
 * read from the catalogue's own towns: the centre is the mean of its towns,
 * and the neighbours are the `n` countries whose nearest town lies closest
 * to any of its towns. `towns` is [{ iso2, lat, lon }]. Null when the
 * catalogue holds no town in `cc` and the microstate table does not know it.
 */
export function countryGeo(towns, cc, n = 4) {
  if (MICROSTATES[cc]) {
    const m = MICROSTATES[cc];
    return { lat: m.lat, lon: m.lon, near: m.near };
  }
  const own = (towns || []).filter((d) => d.iso2 === cc
    && Number.isFinite(d.lat) && Number.isFinite(d.lon));
  if (!own.length) return null;
  const lat = own.reduce((s, d) => s + d.lat, 0) / own.length;
  const lon = own.reduce((s, d) => s + d.lon, 0) / own.length;
  return { lat, lon, near: nearCountries(towns, own, cc, n) };
}

/** The catalogue's destinations map ({id: dest}) as the town list countryGeo
 *  reads, city centre first. */
export function townsOf(destinations) {
  return Object.values(destinations || {}).map((d) => ({
    iso2: d.iso2, lat: d.city_lat ?? d.lat, lon: d.city_lon ?? d.lon,
  }));
}

/** The `n` countries nearest a point (a searched place), excluding `cc`. */
export function pointGeo(towns, point, cc, n = 4) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  return {
    lat: point.lat,
    lon: point.lon,
    near: nearCountries(towns, [point], cc, n),
  };
}

function nearCountries(towns, from, cc, n) {
  const best = new Map();
  for (const d of towns || []) {
    if (!d.iso2 || d.iso2 === cc || !Number.isFinite(d.lat) || !Number.isFinite(d.lon)) continue;
    let km = Infinity;
    for (const o of from) {
      const k = haversineKm(o.lat, o.lon, d.lat, d.lon);
      if (k < km) km = k;
    }
    if (km < (best.get(d.iso2) ?? Infinity)) best.set(d.iso2, km);
  }
  return [...best.entries()].sort((a, b) => a[1] - b[1]).slice(0, n).map(([c]) => c);
}

/** The `openNeighbour` layer name of each layer. */
export const OPEN_AS = {
  beach: 'beach', lake: 'lake', mountain: 'peak', cycling: 'cycle', trail: 'trail',
};

function pointOf(row) {
  if (Number.isFinite(row.lat) && Number.isFinite(row.lon)) return { lat: row.lat, lon: row.lon };
  return bboxCentre(row.bbox);
}

/** Straight-line km from a point to a row: to the nearest vertex of its line
 *  when it has one (a walk or a cycle route passes a place; its middle may
 *  not), else to its point or the middle of its box. */
export function kmTo(centre, row) {
  const g = row?.geometry;
  const lines = g?.type === 'LineString' ? [g.coordinates]
    : g?.type === 'MultiLineString' ? g.coordinates : null;
  if (lines) {
    let km = Infinity;
    for (const line of lines) {
      for (const c of line || []) {
        if (!Array.isArray(c)) continue;
        const k = haversineKm(centre.lat, centre.lon, c[1], c[0]);
        if (k < km) km = k;
      }
    }
    if (Number.isFinite(km)) return km;
  }
  const p = pointOf(row);
  return p ? haversineKm(centre.lat, centre.lon, p.lat, p.lon) : null;
}

/** Pure part of the lookup, so it can be run without a browser: the three
 *  rows nearest the centre, each with its distance, rows of `cc` excluded. */
/** What makes two rows the same thing to a reader: the name, or for a
 *  composed trip (no name) its cities in order, which is what its card
 *  prints; the same route composed at five and at seven days is one row. */
const sameKey = (row) => row.name
  || (Array.isArray(row.cities) ? row.cities.map((c) => c.city).join('>') : null);

export function nearestThree(rows, centre, cc, n = 3) {
  return rows
    // A row in the empty country, or a trip that passes through it, is not
    // "across the border".
    .filter((r) => r && (r.cc || r.country) !== cc && !(r.countries || []).includes(cc))
    .map((r) => {
      const km = kmTo(centre, r);
      return km == null ? null : { row: r, km };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km)
    // A border summit is published once per country; the nearer one stays.
    // A row with nothing to compare by is never a duplicate of another.
    .filter((r, i, all) => !sameKey(r.row)
      || all.findIndex((o) => sameKey(o.row) === sameKey(r.row)) === i)
    .slice(0, n);
}

function vertices(row) {
  const g = row?.geometry;
  const lines = g?.type === 'LineString' ? [g.coordinates]
    : g?.type === 'MultiLineString' ? g.coordinates : null;
  const out = [];
  for (const line of lines || []) {
    for (const c of line || []) if (Array.isArray(c)) out.push({ lat: c[1], lon: c[0] });
  }
  return out;
}

/** km between a page's own row (a point, or a line) and a candidate row.
 *  A point page measures to the candidate's line; a line page measures each
 *  of its vertices to the candidate's point, which keeps the scan linear
 *  (two lines against each other would be vertices times vertices). */
export function kmBetween(from, row) {
  const own = vertices(from);
  if (!own.length) {
    const p = Number.isFinite(from?.lat) ? { lat: from.lat, lon: from.lon } : bboxCentre(from?.bbox);
    return p ? kmTo(p, row) : null;
  }
  const p = pointOf(row);
  if (!p) return null;
  let km = Infinity;
  for (const v of own) {
    const k = haversineKm(v.lat, v.lon, p.lat, p.lon);
    if (k < km) km = k;
  }
  return Number.isFinite(km) ? km : null;
}

/** Regions nearest a stale region id, by the length of the id they share
 *  (NUTS ids nest: ITC11 sits inside ITC1), then by name. For the region
 *  page that cannot find its region. */
export function nearestRegions(regions, id, n = 3) {
  const want = String(id || '').toUpperCase();
  const shared = (a) => {
    const b = String(a || '').toUpperCase();
    let i = 0;
    while (i < want.length && i < b.length && want[i] === b[i]) i += 1;
    return i;
  };
  return (regions || [])
    .filter((r) => r && r.id && String(r.id).toUpperCase() !== want)
    .map((r) => ({ r, s: shared(r.id) }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => (b.s - a.s) || String(a.r.name).localeCompare(String(b.r.name)))
    .slice(0, n)
    .map((x) => x.r);
}
