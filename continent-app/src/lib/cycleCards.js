/**
 * cycleCards.js, the cycling list's own model: the chips a rider narrows a
 * list by, the rating shape the card prints, and the code-to-label maps the
 * card and the page share.
 *
 * The same grouped shape as BEACH_FACETS, LAKE_FACETS and MOUNTAIN_FACETS
 * ({ key, labelKey, toolbar, options: [{ key, labelKey, test }] }), so the
 * Destinations tab renders it through the one facet renderer and the Filters
 * sheet through the other, and a chip cannot exist in one and not the other.
 * Inside a group the selection is a union (10 to 30 km OR 30 to 60 km);
 * across groups it is an intersection.
 *
 * Every test reads one country-file row (pipeline/cycling/export_cycling.py)
 * and only fields both tiers carry: a listed row has no score and no
 * photograph, but it does have a length, a climb, a surface share, a traffic
 * share, a bike class and a network level, which is what lets the same
 * chips narrow the 436 listed Belgian routes as well as the 19 rated ones.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const between = (v, lo, hi) => {
  const n = num(v);
  return n !== null && n >= lo && n < hi;
};

export const CYCLE_FACETS = [
  {
    key: 'length',
    labelKey: 'cycle.fLength',
    toolbar: true,
    options: [
      { key: 'short', labelKey: 'cycle.lenShort', test: (r) => between(r.km, 0, 10) },
      { key: 'half', labelKey: 'cycle.lenHalf', test: (r) => between(r.km, 10, 30) },
      { key: 'day', labelKey: 'cycle.lenDay', test: (r) => between(r.km, 30, 60) },
      { key: 'long', labelKey: 'cycle.lenLong', test: (r) => between(r.km, 60, 120) },
      { key: 'tour', labelKey: 'cycle.lenTour', test: (r) => between(r.km, 120, Infinity) },
      { key: 'loop', labelKey: 'trails.loopsOnly', loop: true, test: (r) => !!r.loop },
    ],
  },
  {
    key: 'surface',
    labelKey: 'cycle.fSurface',
    options: [
      { key: 'paved', labelKey: 'cycle.sfPaved', test: (r) => between(r.paved, 0.9, Infinity) },
      { key: 'mixed', labelKey: 'cycle.sfMixed', test: (r) => between(r.paved, 0.5, 0.9) },
      { key: 'unpaved', labelKey: 'cycle.sfUnpaved', test: (r) => between(r.paved, 0, 0.5) },
    ],
  },
  {
    key: 'bike',
    labelKey: 'cycle.fBike',
    options: [
      { key: 'touring', labelKey: 'cycle.bkTouring', test: (r) => r.bike === 'touring' },
      { key: 'gravel', labelKey: 'cycle.bkGravel', test: (r) => r.bike === 'gravel' },
      { key: 'mtb', labelKey: 'cycle.bkMtb', test: (r) => r.bike === 'mtb' },
    ],
  },
  {
    key: 'traffic',
    labelKey: 'cycle.fTraffic',
    options: [
      { key: 'carfree', labelKey: 'cycle.trCarFree', test: (r) => between(r.free, 0.7, Infinity) },
      { key: 'quiet', labelKey: 'cycle.trQuiet', test: (r) => between(r.safe, 7, Infinity) },
    ],
  },
  {
    key: 'climb',
    labelKey: 'trails.climbLabel',
    options: [
      { key: 'flat', labelKey: 'trails.climbFlat', test: (r) => between(r.asc, 0, 150) },
      { key: 'rolling', labelKey: 'trails.climbRolling', test: (r) => between(r.asc, 150, 500) },
      { key: 'hilly', labelKey: 'trails.climbHilly', test: (r) => between(r.asc, 500, 1000) },
      { key: 'steep', labelKey: 'trails.climbSteep', test: (r) => between(r.asc, 1000, Infinity) },
    ],
  },
  {
    key: 'network',
    labelKey: 'cycle.fNetwork',
    options: [
      { key: 'icn', labelKey: 'cycle.netIcn', test: (r) => r.net === 'icn' },
      { key: 'ncn', labelKey: 'cycle.netNcn', test: (r) => r.net === 'ncn' },
      { key: 'rcn', labelKey: 'cycle.netRcn', test: (r) => r.net === 'rcn' },
      { key: 'lcn', labelKey: 'cycle.netLcn', test: (r) => r.net === 'lcn' },
    ],
  },
];

/** Rows that satisfy every selected group (union inside, intersection across). */
export function applyCycleFacets(rows, state) {
  let out = rows || [];
  for (const group of CYCLE_FACETS) {
    const on = state?.[group.key] || [];
    if (!on.length) continue;
    const tests = on
      .map((k) => group.options.find((o) => o.key === k)?.test)
      .filter(Boolean);
    if (!tests.length) continue;
    out = out.filter((row) => tests.some((fn) => fn(row)));
  }
  return out;
}

/**
 * How many rows each chip would leave, counted inside the pool the OTHER
 * groups already narrowed and ignoring its own group's other chips, so the
 * number on a chip is true of what tapping it would do and stays still while
 * it is tapped.
 */
export function cycleFacetCounts(pool, state) {
  const out = new Map();
  if (!pool) return out;
  for (const group of CYCLE_FACETS) {
    const others = { ...(state || {}), [group.key]: [] };
    const base = applyCycleFacets(pool, others);
    for (const option of group.options) {
      out.set(`${group.key}:${option.key}`, base.filter(option.test).length);
    }
  }
  return out;
}

// The same cutoffs the trail cards use, so a 7.9 wears the same colour on a
// ride as on a walk.
const TIER_CUTOFFS = [[8.7, 3], [7.8, 2], [6.9, 1]];

/** The rating shape RatingBadge prints, or null for a listed row. */
export function cycleRating(row) {
  const score = num(row?.score);
  if (score === null || (row?.t && row.t !== 'r')) return null;
  const tier = TIER_CUTOFFS.find(([min]) => score >= min)?.[1] ?? 0;
  return { score, tier };
}

/** A listed row: verified to exist and named, deliberately not scored. */
export const isListedRide = (row) => (row?.t ?? 'r') !== 'r';

/** The network level as a label key: what kind of signed route this is. */
export function netLabelKey(net) {
  switch (net) {
    case 'icn': return 'cycle.netIcn';
    case 'ncn': return 'cycle.netNcn';
    case 'rcn': return 'cycle.netRcn';
    case 'lcn': return 'cycle.netLcn';
    default: return null;
  }
}

/** Which bike the worst stretch needs, as a short chip label. */
export function bikeLabelKey(bike) {
  switch (bike) {
    case 'touring': return 'cycle.bkTouring';
    case 'gravel': return 'cycle.bkGravel';
    case 'mtb': return 'cycle.bkMtb';
    default: return null;
  }
}

/** The surface band a paved share falls in, as a short chip label. */
export function surfaceLabelKey(paved) {
  const p = num(paved);
  if (p === null) return null;
  if (p >= 0.9) return 'cycle.sfPaved';
  if (p >= 0.5) return 'cycle.sfMixed';
  return 'cycle.sfUnpaved';
}

/** The middle of a route's bounding box, for distance-from-here sorting. */
export function rideCentre(row) {
  const b = row?.bbox;
  if (!Array.isArray(b) || b.length !== 4) return null;
  return { lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2 };
}

/** A shareable link to one route, in the hash the app reads at startup. */
export function cycleShareUrl(row, cc) {
  if (typeof window === 'undefined' || !row?.id) return '';
  const { origin, pathname } = window.location;
  const country = cc ? `&cc=${encodeURIComponent(cc)}` : '';
  return `${origin}${pathname}#cycle=${encodeURIComponent(row.id)}${country}`;
}

export function tourShareUrl(slug) {
  if (typeof window === 'undefined' || !slug) return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#tour=${encodeURIComponent(slug)}`;
}
