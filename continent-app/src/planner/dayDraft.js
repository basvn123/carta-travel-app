/**
 * dayDraft.js - pure logic for the Day planner's guided planning:
 *
 *   tieredActivities()  split a city's POI list into must-see / worth-it /
 *                       more / get-active tiers, driven by the OpenTripMap
 *                       importance rate harvested into items_full (schema v12).
 *   draftDays()         auto-draft a whole visit: spread the best-matching
 *                       stops over the days (geo-clustered so each day stays
 *                       walkable), respecting the traveller's interests + pace.
 *   optimizeOrder()     nearest-neighbour ordering within a day so the walk
 *                       doesn't zigzag (moved here from DayPlannerTab).
 *
 * All functions work on `activities.items` (items_full merged at runtime) and
 * speak in ORIGINAL INDICES into that array - the same indices the planner's
 * saved assignments use.
 */
import { haversineKm, cityCoords } from '../lib/runtime_pricing.js';

/** Reorders a day's assigned activity indices to minimize backtracking - a
 *  simple nearest-neighbour walk starting from the first-added stop with
 *  coordinates. Activities without coordinates (limited-data destinations)
 *  can't be routed, so they're kept, appended at the end in add order. */
export function optimizeOrder(idxArray, itemsAll) {
  const withCoords = [];
  const withoutCoords = [];
  for (const idx of idxArray) {
    const it = itemsAll[idx];
    (it && it.lat != null && it.lon != null ? withCoords : withoutCoords).push(idx);
  }
  if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];

  const remaining = new Set(withCoords);
  let current = withCoords[0];
  const ordered = [current];
  remaining.delete(current);
  while (remaining.size > 0) {
    const curItem = itemsAll[current];
    let best = null, bestDist = Infinity;
    for (const cand of remaining) {
      const c = itemsAll[cand];
      const d = haversineKm(curItem.lat, curItem.lon, c.lat, c.lon);
      if (d != null && d < bestDist) { bestDist = d; best = cand; }
    }
    if (best == null) break;
    ordered.push(best);
    remaining.delete(best);
    current = best;
  }
  return [...ordered, ...withoutCoords];
}

const MUST_CAP = 8; // heritage capitals rate 30+ places "3" - keep Must see scannable

/** Real-world fame signal: average daily Wikipedia pageviews (`pop`, added by
 *  enrich_activities.py). Missing = -1 so enriched items always outrank
 *  unenriched ones when fame is what's being compared. */
function popOf(item) {
  return typeof item.pop === 'number' ? item.pop : -1;
}

/**
 * Tier a city's activity list for display. Returns { must, worth, more, active },
 * each an array of { item, idx } (idx = original index into `items`).
 *
 * With rate data (schema v12): must = rate-3 sights (capped, overflow spills
 * into worth), worth = rate 2+, more = the rest. When popularity data is
 * present (Wikipedia pageviews), the rate-3 pool is ordered by real-world fame
 * first, so the cap keeps the genuinely famous places and demotes the
 * technically-rated-3-but-obscure ones - a much sharper "must do vs alright"
 * line. Without rates (older data / Wikivoyage-sourced cities) the list order
 * is already importance-sorted, so we fall back to positional tiers.
 */
export function tieredActivities(items) {
  const sights = [];
  const active = [];
  (items || []).forEach((item, idx) => {
    (item.active ? active : sights).push({ item, idx });
  });
  const hasRates = sights.some(({ item }) => item.rate != null);
  const hasPop = sights.some(({ item }) => typeof item.pop === 'number');
  let must, worth, more;
  if (hasRates) {
    let must3 = sights.filter(({ item }) => (item.rate ?? 0) >= 3);
    if (hasPop) {
      must3 = [...must3].sort((a, b) => (
        popOf(b.item) - popOf(a.item)
        || (b.item.heritage === true) - (a.item.heritage === true)
      ));
    }
    must = must3.slice(0, MUST_CAP);
    const worth2 = sights.filter(({ item }) => (item.rate ?? 0) === 2);
    worth = [
      ...must3.slice(MUST_CAP),
      ...(hasPop ? [...worth2].sort((a, b) => popOf(b.item) - popOf(a.item)) : worth2),
    ];
    more = sights.filter(({ item }) => (item.rate ?? 0) < 2);
  } else {
    must = sights.slice(0, 6);
    worth = sights.slice(6, 16);
    more = sights.slice(16);
  }
  return { must, worth, more, active };
}

// Which interests each catalogued kind speaks to - the Day planner's superset
// of the trip wizard's mapping, covering the active/outdoor kinds harvested in
// schema v12. Kinds not listed are neutral (never filtered out).
const KIND_INTERESTS = {
  Museum: ['museums'], Gallery: ['museums'],
  Church: ['culture', 'architecture'], Cathedral: ['culture', 'architecture'],
  Basilica: ['culture', 'architecture'], Chapel: ['culture', 'architecture'],
  Monastery: ['culture'], Convent: ['culture'], Synagogue: ['culture'],
  Mosque: ['culture'], Temple: ['culture'],
  Castle: ['architecture', 'photo'], Fortress: ['architecture', 'photo'],
  Citadel: ['architecture', 'photo'], Palace: ['architecture', 'photo'],
  Tower: ['architecture', 'photo'], Bridge: ['architecture', 'photo'],
  Gate: ['architecture'], Lighthouse: ['photo'],
  Theatre: ['culture'], Opera: ['culture'], Square: ['culture', 'photo'],
  Monument: ['culture', 'photo'], Memorial: ['culture'], Statue: ['photo'],
  Fountain: ['photo'], Viewpoint: ['photo', 'outdoors'],
  'Ancient site': ['culture'], Ruins: ['culture'], 'Roman site': ['culture'],
  Market: ['food', 'shopping'], Brewery: ['food'], Winery: ['food'],
  Park: ['outdoors'], Garden: ['outdoors'], Lake: ['outdoors'],
  Beach: ['beaches', 'outdoors'], 'Nature reserve': ['outdoors'],
  Cave: ['outdoors'], Waterfall: ['outdoors', 'photo'], Peak: ['outdoors', 'photo'],
  Canyon: ['outdoors'], Dunes: ['outdoors', 'beaches'], Glacier: ['outdoors'],
  Trail: ['outdoors', 'sports'], Hiking: ['outdoors', 'sports'],
  Cycling: ['outdoors', 'sports'], Climbing: ['sports', 'outdoors'],
  Diving: ['sports', 'beaches'], Snorkeling: ['sports', 'beaches'],
  Surfing: ['sports', 'beaches'], Kayaking: ['sports', 'outdoors'],
  Rafting: ['sports', 'outdoors'], Skiing: ['sports', 'outdoors'],
  Golf: ['sports'], 'Horse riding': ['sports', 'outdoors'],
  Swimming: ['sports', 'wellness'], 'Water park': ['sports'],
  'Theme park': ['sports'], 'Ferris wheel': ['photo'],
  'Sauna & baths': ['wellness'], 'Thermal baths': ['wellness'],
  Zoo: ['outdoors'], Aquarium: ['museums'],
};

/** Does this kind speak to any of the chosen interests? Unmapped kinds are
 *  neutral (true) so niche sights never disappear. Empty interests = keep all. */
export function kindMatchesInterests(kind, interests) {
  if (!interests || interests.size === 0) return true;
  const tags = KIND_INTERESTS[kind];
  if (!tags) return true;
  return tags.some((t) => interests.has(t));
}

/** True when the kind DIRECTLY matches an interest (not just neutral). */
function kindDirectMatch(kind, interests) {
  const tags = KIND_INTERESTS[kind];
  return !!tags && !!interests && tags.some((t) => interests.has(t));
}

/** 0..0.8 fame boost from Wikipedia pageviews - enough to lift a world-famous
 *  sight over a same-rate peer, never enough to outrank a whole rate tier. */
function popBoost(item) {
  const p = typeof item.pop === 'number' ? item.pop : 0;
  return Math.min(p / 4000, 1) * 0.8;
}

// How full a drafted day may get, by pace: max stop count and a rough on-foot
// time budget (dwell + estimated walks), so a "relaxed" museum day doesn't get
// four museums crammed in just because the count allowed it.
export const PACES = [
  { key: 'relaxed', label: 'Relaxed', hint: '3-4 stops', stops: 4, budgetMin: 5.5 * 60 },
  { key: 'balanced', label: 'Balanced', hint: '5-6 stops', stops: 6, budgetMin: 7 * 60 },
  { key: 'packed', label: 'Packed', hint: '7-8 stops', stops: 8, budgetMin: 8.5 * 60 },
];

/** "How long is your day?" answers for the feasibility questions. */
export const DAY_LENGTHS = [
  { key: 'half', label: 'Half a day', desc: 'Morning or afternoon, back early', budgetMin: 4 * 60, stops: 3 },
  { key: 'full', label: 'A full day', desc: 'Out from morning to dinner', budgetMin: 7 * 60, stops: 6 },
  { key: 'long', label: 'Morning to night', desc: 'Early start, evening included', budgetMin: 9 * 60, stops: 8 },
];

/** "How much walking?" answers. maxKm caps how far a day may sprawl from its
 *  own centre, so a light walker never gets stops an hour apart. */
export const WALK_LEVELS = [
  { key: 'light', label: 'Not too much', desc: 'Short hops, everything close together', maxKm: 1.2, stopsDelta: -1 },
  { key: 'moderate', label: 'A fair bit', desc: 'Comfortable walking between sights', maxKm: 2.5, stopsDelta: 0 },
  { key: 'lots', label: 'Happy to walk a lot', desc: 'Long walks are part of the fun', maxKm: 4.5, stopsDelta: 1 },
];

/** Turn the feasibility answers into concrete drafting limits. Falls back to
 *  the balanced pace when the traveller skipped the questions. */
export function feasibilityLimits({ dayLen, walk } = {}) {
  const d = DAY_LENGTHS.find((x) => x.key === dayLen) || DAY_LENGTHS[1];
  const w = WALK_LEVELS.find((x) => x.key === walk) || WALK_LEVELS[1];
  return {
    stopsMax: Math.max(2, d.stops + w.stopsDelta),
    budgetMin: d.budgetMin,
    maxKmFromCentroid: w.maxKm,
  };
}

// Anything farther than this from the city's own centre is data noise for a
// walkable day plan (e.g. a POI across a strait on another island) - it can
// only produce impossible "walk over the sea" days.
export const MAX_POI_KM_FROM_CITY = 20;

/** Drop activity items that are unrealistically far from the city centre.
 *  Keeps items without coordinates (they can't mislead the router).
 *  Measures from the city centre, not the stored coordinate: an airport-tier
 *  destination's lat/lon is the runway (e.g. Stockholm's is 90 km out at
 *  Skavsta), which would drop every genuine city-centre POI. */
export function saneItemsForCity(items, cityDest) {
  const centre = cityCoords(cityDest);
  if (centre.lat == null) return items || [];
  return (items || []).filter((it) => {
    if (it.lat == null || it.lon == null) return true;
    const km = haversineKm(centre.lat, centre.lon, it.lat, it.lon);
    return km == null || km <= MAX_POI_KM_FROM_CITY;
  });
}

/**
 * "What kind of day?" styles for the guided picker. Tourists don't know a
 * city's geography or its 40 POI kinds - they know whether they feel like
 * walking landmarks, museums, being active, or eating their way around.
 * Each style maps to the interest keys the ranking logic already speaks.
 */
export const DAY_STYLES = [
  {
    key: 'classic',
    label: 'Classic sightseeing',
    desc: 'The famous squares, landmarks and views. The city greatest-hits day.',
    interests: ['culture', 'architecture', 'photo'],
  },
  {
    key: 'culture',
    label: 'Museums & culture',
    desc: 'Museums, galleries, churches and history, at an indoor pace.',
    interests: ['museums', 'culture'],
  },
  {
    key: 'active',
    label: 'Active & outdoors',
    desc: 'Parks, trails, beaches and anything that gets you moving.',
    interests: ['outdoors', 'sports', 'beaches'],
  },
  {
    key: 'foodie',
    label: 'Food & local life',
    desc: 'Markets, cafes, breweries and the streets where locals actually go.',
    interests: ['food', 'cafes', 'shopping'],
  },
  {
    key: 'mix',
    label: 'Surprise mix',
    desc: 'A bit of everything: Carta leads with the true must-sees.',
    interests: [],
  },
];

/**
 * Ranked candidate deck for the guided picker: the stops Carta would stand
 * behind for this style, best first. Only worthwhile places make the deck -
 * rate-2+ sights, heritage sites, and (for active styles) matching outdoor
 * kinds - so the traveller is never asked to judge filler.
 */
export function candidateDeck(items, interests, limit = 16) {
  const iset = interests instanceof Set ? interests : new Set(interests || []);
  const all = (items || []).map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.lat != null && item.lon != null);
  const score = ({ item }) => {
    const base = item.active
      ? (kindDirectMatch(item.kind, iset) ? 2.5 : -1)
      : (item.rate ?? 1.5);
    return base + (kindDirectMatch(item.kind, iset) ? 0.75 : 0) + (item.heritage ? 0.25 : 0) + popBoost(item);
  };
  return all
    .filter((c) => score(c) > 0.5 && kindMatchesInterests(c.item.kind, iset))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

/** 1-2 strong nearby companions for a candidate ("pairs well with X, 6 min
 *  walk") so tourists get the geography they don't have in their heads. */
export function nearbyCompanions(item, items, { maxKm = 0.9, limit = 2 } = {}) {
  if (item.lat == null || item.lon == null) return [];
  return (items || [])
    .filter((o) => o !== item && o.lat != null && o.lon != null && !o.active && (o.rate ?? 0) >= 2)
    .map((o) => ({ item: o, km: haversineKm(item.lat, item.lon, o.lat, o.lon) }))
    .filter((c) => c.km != null && c.km <= maxKm)
    .sort((a, b) => (b.item.rate ?? 0) - (a.item.rate ?? 0) || a.km - b.km)
    .slice(0, limit)
    .map((c) => ({ name: c.item.name, walkMin: Math.max(1, Math.round((c.km / 4.8) * 60)) }));
}

/**
 * Spread a set of HAND-PICKED activity indices over `numDays` days, keeping
 * each day geographically tight, then route-optimize each day. Used when the
 * traveller chose their own stops in the guided deck (vs draftDays, which
 * picks for them). Picks without coordinates land on the first day.
 */
export function clusterIntoDays(pickIdx, items, numDays) {
  const days = Array.from({ length: Math.max(1, numDays) }, () => []);
  if (!pickIdx || pickIdx.length === 0) return days;
  const withCoords = pickIdx.filter((i) => items[i] && items[i].lat != null && items[i].lon != null);
  const withoutCoords = pickIdx.filter((i) => !withCoords.includes(i));

  if (numDays <= 1 || withCoords.length <= numDays) {
    // Not enough material to cluster: fill days one pick at a time.
    [...withCoords, ...withoutCoords].forEach((idx, i) => {
      days[Math.min(days.length - 1, Math.floor(i / Math.max(1, Math.ceil(pickIdx.length / numDays))))].push(idx);
    });
    return days.map((d) => optimizeOrder(d, items));
  }

  // Seeds: farthest-point spread so days anchor in different areas.
  const seeds = [withCoords[0]];
  while (seeds.length < numDays) {
    let best = null, bestDist = -1;
    for (const cand of withCoords) {
      if (seeds.includes(cand)) continue;
      const dMin = Math.min(...seeds.map((s) =>
        haversineKm(items[s].lat, items[s].lon, items[cand].lat, items[cand].lon) ?? 0));
      if (dMin > bestDist) { bestDist = dMin; best = cand; }
    }
    if (best == null) break;
    seeds.push(best);
  }
  seeds.forEach((s, d) => days[d].push(s));

  // Assign the rest to the nearest day-centroid, keeping counts balanced.
  const centroid = (d) => {
    const pts = d.map((idx) => items[idx]);
    return {
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
    };
  };
  const cap = Math.ceil(withCoords.length / numDays);
  for (const idx of withCoords) {
    if (seeds.includes(idx)) continue;
    let bestDay = 0, bestDist = Infinity;
    for (let d = 0; d < numDays; d++) {
      if (days[d].length >= cap && days.some((x, j) => j !== d && x.length < cap)) continue;
      const c = centroid(days[d]);
      const dist = haversineKm(c.lat, c.lon, items[idx].lat, items[idx].lon) ?? Infinity;
      if (dist < bestDist) { bestDist = dist; bestDay = d; }
    }
    days[bestDay].push(idx);
  }
  withoutCoords.forEach((idx, i) => days[i % numDays].push(idx));
  return days.map((d) => optimizeOrder(d, items));
}

const WALK_EST_MIN = 15; // rough inter-stop walking allowance while drafting

/**
 * Auto-draft a whole visit: pick the best stops for this traveller and spread
 * them over `numDays` days, keeping each day geographically tight.
 *
 * items      the city's activity list (original order = importance order)
 * numDays    how many days to fill
 * interests  Set of interest keys (may be empty = no preference)
 * paceKey    'relaxed' | 'balanced' | 'packed'
 * dwellFn    (kind) => minutes, the planner's dwell estimator
 *
 * Returns an array of `numDays` arrays of item indices, each route-optimized.
 * Days beyond the available material come back empty rather than padded with
 * filler - better an honest half-empty day 3 than three mediocre days.
 */
export function draftDays({ items, numDays, interests, paceKey, dwellFn, stopsMax, budgetMin, maxKmFromCentroid }) {
  const paceBase = PACES.find((p) => p.key === paceKey) || PACES[1];
  // Feasibility overrides (day length, walking appetite) win over the pace.
  const pace = {
    stops: stopsMax || paceBase.stops,
    budgetMin: budgetMin || paceBase.budgetMin,
  };
  const maxKm = maxKmFromCentroid || 3.5;
  const all = (items || []).map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.lat != null && item.lon != null);

  // Rank: interest-matching actives join the sights; direct interest matches
  // get a boost so a beach person's draft actually contains the beach. If the
  // interest filter can't fill the asked-for days, relax it to everything -
  // the score boost still leads with what they love, topped up with the
  // city's best of the rest.
  let pool = all.filter(({ item }) => kindMatchesInterests(item.kind, interests));
  if (pool.length < pace.stops * numDays) pool = all;
  const score = ({ item }) => {
    const base = item.active ? (kindDirectMatch(item.kind, interests) ? 2.5 : -1) : (item.rate ?? 1.5);
    return base + (kindDirectMatch(item.kind, interests) ? 0.75 : 0) + (item.heritage ? 0.25 : 0) + popBoost(item);
  };
  const ranked = [...pool].sort((a, b) => score(b) - score(a));
  // Interest-less actives score below every sight; drop them from drafts.
  const usable = ranked.filter((r) => score(r) > 0);

  const days = Array.from({ length: numDays }, () => []);
  const used = new Set();

  // Seeds: the top-ranked stop starts day 1; each further day starts at the
  // highest-ranked stop far from the earlier seeds (max-min distance), so a
  // 3-day Rome draft doesn't put three days in the same piazza.
  const seeds = [];
  for (let d = 0; d < numDays && d < usable.length; d++) {
    let best = null, bestScore = -Infinity;
    for (const cand of usable) {
      if (used.has(cand.idx)) continue;
      const minDist = seeds.length
        ? Math.min(...seeds.map((s) => haversineKm(s.item.lat, s.item.lon, cand.item.lat, cand.item.lon) ?? 0))
        : 0;
      const rank = usable.indexOf(cand); // earlier = better
      const s = minDist - rank * 0.4;    // spread, but don't seed with junk
      if (s > bestScore) { bestScore = s; best = cand; }
    }
    if (!best) break;
    seeds.push(best);
    used.add(best.idx);
    days[d].push(best.idx);
  }

  const dayLoad = days.map((d, i) => (d.length ? dwellFn(items[d[0]].kind) : 0));
  const centroid = (d) => {
    const pts = d.map((idx) => items[idx]);
    return {
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
    };
  };

  // Greedily place the remaining candidates, best-ranked first, each on the
  // nearest day that still has room (count + time budget). A candidate farther
  // than maxKm from every day's centre is skipped entirely: better a shorter
  // day than a plan that "walks" across a bay or motorway sprawl.
  for (const cand of usable) {
    if (used.has(cand.idx)) continue;
    let bestDay = -1, bestDist = Infinity;
    for (let d = 0; d < numDays; d++) {
      if (!days[d].length) { if (bestDay < 0) { bestDay = d; bestDist = 0; } continue; }
      if (days[d].length >= pace.stops) continue;
      const cost = dwellFn(cand.item.kind) + WALK_EST_MIN;
      if (dayLoad[d] + cost > pace.budgetMin) continue;
      const c = centroid(days[d]);
      const dist = haversineKm(c.lat, c.lon, cand.item.lat, cand.item.lon) ?? Infinity;
      if (dist > maxKm) continue;
      if (dist < bestDist) { bestDist = dist; bestDay = d; }
    }
    if (bestDay < 0) continue;
    days[bestDay].push(cand.idx);
    dayLoad[bestDay] += dwellFn(cand.item.kind) + WALK_EST_MIN;
    used.add(cand.idx);
  }

  return days.map((d) => optimizeOrder(d, items));
}
