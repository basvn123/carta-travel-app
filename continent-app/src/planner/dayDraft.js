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
import { haversineKm } from '../lib/runtime_pricing.js';

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

/**
 * Tier a city's activity list for display. Returns { must, worth, more, active },
 * each an array of { item, idx } (idx = original index into `items`).
 *
 * With rate data (schema v12): must = rate-3 sights (capped, overflow spills
 * into worth), worth = rate 2+, more = the rest. Without rates (older data /
 * Wikivoyage-sourced cities) the list order is already importance-sorted, so
 * we fall back to positional tiers.
 */
export function tieredActivities(items) {
  const sights = [];
  const active = [];
  (items || []).forEach((item, idx) => {
    (item.active ? active : sights).push({ item, idx });
  });
  const hasRates = sights.some(({ item }) => item.rate != null);
  let must, worth, more;
  if (hasRates) {
    const must3 = sights.filter(({ item }) => (item.rate ?? 0) >= 3);
    must = must3.slice(0, MUST_CAP);
    worth = [
      ...must3.slice(MUST_CAP),
      ...sights.filter(({ item }) => (item.rate ?? 0) === 2),
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

// How full a drafted day may get, by pace: max stop count and a rough on-foot
// time budget (dwell + estimated walks), so a "relaxed" museum day doesn't get
// four museums crammed in just because the count allowed it.
export const PACES = [
  { key: 'relaxed', label: 'Relaxed', hint: '3-4 stops', stops: 4, budgetMin: 5.5 * 60 },
  { key: 'balanced', label: 'Balanced', hint: '5-6 stops', stops: 6, budgetMin: 7 * 60 },
  { key: 'packed', label: 'Packed', hint: '7-8 stops', stops: 8, budgetMin: 8.5 * 60 },
];

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
export function draftDays({ items, numDays, interests, paceKey, dwellFn }) {
  const pace = PACES.find((p) => p.key === paceKey) || PACES[1];
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
    return base + (kindDirectMatch(item.kind, interests) ? 0.75 : 0) + (item.heritage ? 0.25 : 0);
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
  // nearest day that still has room (count + time budget).
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
      if (dist < bestDist) { bestDist = dist; bestDay = d; }
    }
    if (bestDay < 0) continue;
    days[bestDay].push(cand.idx);
    dayLoad[bestDay] += dwellFn(cand.item.kind) + WALK_EST_MIN;
    used.add(cand.idx);
  }

  return days.map((d) => optimizeOrder(d, items));
}
