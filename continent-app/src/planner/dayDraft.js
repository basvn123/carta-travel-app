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
 *  coordinates, or from `anchor` ({lat,lon}, e.g. the traveller's stay) when
 *  one is given, so the day starts at the sight nearest their door.
 *  Activities without coordinates (limited-data destinations) can't be
 *  routed, so they're kept, appended at the end in add order. */
export function optimizeOrder(idxArray, itemsAll, anchor = null) {
  const withCoords = [];
  const withoutCoords = [];
  for (const idx of idxArray) {
    const it = itemsAll[idx];
    (it && it.lat != null && it.lon != null ? withCoords : withoutCoords).push(idx);
  }
  if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];

  const remaining = new Set(withCoords);
  let current = withCoords[0];
  if (anchor && anchor.lat != null && anchor.lon != null) {
    let best = null, bestDist = Infinity;
    for (const cand of remaining) {
      const c = itemsAll[cand];
      const d = haversineKm(anchor.lat, anchor.lon, c.lat, c.lon);
      if (d != null && d < bestDist) { bestDist = d; best = cand; }
    }
    if (best != null) current = best;
  }
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

const MUST_CAP = 8;    // heritage capitals rate 30+ places "3" - keep Must see scannable
const WORTH_CAP = 16;  // "worth adding" stays a browsable shelf, not a dump

/**
 * Composite per-POI strength, 0..~5. OpenTripMap's importance rate (1-3) is
 * the backbone, but 57% of harvested POIs carry the top rate, so the rate
 * alone can't separate the Colosseum from a rated-3 neighbourhood church.
 * Extra evidence sharpens it: a heritage-register listing, whether the name
 * resolves to a real Wikipedia article (with photo), and that article's
 * average daily pageviews (log-scaled fame: ~2000+ views/day = +1.0).
 */
// Transport infrastructure is never a sight: the harvest occasionally rates
// an airport or suburban railway station as a top POI ("Marseille Provence
// Airport, rate 3"), which would be absurd to recommend for a day out. Grand
// heritage-listed stations (Antwerpen-Centraal) are the one honest exception.
const AIRPORT_RE = /airport|aerodrome|airfield|heliport|air base/i;
const STATION_RE = /railway station|train station|bus station|bus stop|tram stop|metro station|ferry terminal|park[- ]and[- ]ride|parking/i;
export function isTransportInfraPoi(item) {
  const t = `${item.kind || ''} ${item.name || ''}`;
  if (AIRPORT_RE.test(t)) return true;
  if (STATION_RE.test(t)) return !item.heritage;
  return false;
}

export function poiScore(item) {
  let s = item.rate ?? 0;
  if (item.heritage) s += 0.6;
  if (item.wiki) s += 0.35;
  if (item.img) s += 0.15;
  const p = typeof item.pop === 'number' ? item.pop : 0;
  if (p > 0) s += Math.min(1, Math.log10(p + 1) / 3.3);
  return s;
}

/** A single, self-contained "genuine must-see" test for badges: top-rated AND
 *  independently corroborated (heritage listing, Wikipedia presence or fame).
 *  Bare rate-3 with no other evidence doesn't earn the badge. */
export function isMustSee(item) {
  return (item.rate ?? 0) >= 3 && poiScore(item) >= 3.5;
}

// Strip a POI name down to a language-neutral core so the same place under
// different names collapses together: lowercase, drop accents, remove the
// generic kind words and connectors that vary by language ("Castello di Vezio"
// / "Castle of Vezio" both -> "vezio"). What's left is usually the proper name.
const NAME_STOPWORDS = new Set([
  // connectors / articles across the catalogue's languages
  'di', 'da', 'de', 'del', 'della', 'dei', 'delle', 'des', 'du', 'the', 'of',
  'a', 'la', 'le', 'il', 'lo', 'los', 'las', 'el',
  'and', 'et', 'e', 'y', 'van', 'der', 'den', 'am', 'im', 'zur',
  // generic place kinds that translate but denote the same thing
  'castle', 'castello', 'castel', 'chateau', 'schloss', 'burg', 'castillo',
  'church', 'chiesa', 'iglesia', 'eglise', 'kirche', 'kerk',
  'cathedral', 'cattedrale', 'catedral', 'cathedrale', 'dom', 'duomo',
  'basilica', 'chapel', 'cappella', 'chapelle', 'kapelle',
  'museum', 'museo', 'musee', 'muzeum',
  'palace', 'palazzo', 'palais', 'palast', 'palacio',
  'tower', 'torre', 'tour', 'turm', 'toren',
  'bridge', 'ponte', 'pont', 'brucke', 'brug',
  'square', 'piazza', 'place', 'platz', 'plein', 'plaza',
  'garden', 'gardens', 'giardino', 'jardin', 'garten',
  'park', 'parco', 'parc',
  'abbey', 'abbazia', 'abbaye',
  'fort', 'fortress', 'fortezza', 'forteresse', 'festung',
  'saint', 'santa', 'santo', 'san', 'sant', 'st',
]);
function nameCore(name) {
  return (name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NAME_STOPWORDS.has(w))
    .join(' ')
    .trim();
}

/**
 * The strong identity keys for a POI - the same real place under a translated
 * or alternate name shares at least one: its thumbnail image, its proper-name
 * core paired with its kind ("castle::vezio"), or its kind within ~120m
 * ("castle@46.010,9.283"). A proper-name core only counts alongside its kind,
 * so "Palazzo Reale" and "Teatro Reale" (same adjective, different places)
 * stay separate while "Castle of Vezio" / "Castello di Vezio" collapse.
 */
export function poiIdentityKeys(item) {
  const keys = [];
  if (!item) return keys;
  const kind = (item.kind || '').toLowerCase();
  if (item.img) keys.push(`img:${item.img}`);
  const core = nameCore(item.name);
  if (core && core.length >= 3) keys.push(`core:${kind}::${core}`);
  const round = (n) => (typeof n === 'number' ? Math.round(n * 1000) / 1000 : null);
  const lat = round(item.lat), lon = round(item.lon);
  if (lat != null && lon != null) keys.push(`geo:${kind}@${lat},${lon}`);
  return keys;
}

// Prefer the richer, more useful entry as the survivor of a duplicate group.
function dupeRank(item) {
  let r = poiScore(item);
  if (item.wiki) r += 0.05;
  if (item.desc) r += 0.03;
  if (item.img) r += 0.02;
  return r;
}

/**
 * Detect near-duplicate POIs in a city's harvested list - the same real place
 * appearing twice under a translated or alternate name (e.g. "Castello di
 * Vezio" and "Castle of Vezio"). Entries that share any identity key (see
 * poiIdentityKeys) collapse into one group; the strongest entry survives and
 * the rest come back in a Set of SUPPRESSED indices so callers can hide them
 * WITHOUT reindexing the array - saved assignments and toggles keep speaking
 * in the original, stable indices.
 */
export function duplicatePoiIndices(items) {
  const suppressed = new Set();
  const list = items || [];
  if (list.length < 2) return suppressed;

  const groups = [];
  const byKey = new Map();
  list.forEach((item, idx) => {
    const keys = poiIdentityKeys(item);
    let g = null;
    for (const k of keys) { if (byKey.has(k)) { g = byKey.get(k); break; } }
    if (!g) { g = { idxs: [] }; groups.push(g); }
    g.idxs.push(idx);
    for (const k of keys) byKey.set(k, g);
  });

  for (const g of groups) {
    if (g.idxs.length < 2) continue;
    // Keep the strongest; suppress the rest (stable: ties keep lowest index).
    const winner = g.idxs.reduce((best, idx) =>
      (dupeRank(list[idx]) > dupeRank(list[best]) ? idx : best), g.idxs[0]);
    for (const idx of g.idxs) if (idx !== winner) suppressed.add(idx);
  }
  return suppressed;
}

/**
 * Tier a city's activity list for display. Returns { must, worth, more, active },
 * each an array of { item, idx } (idx = original index into `items`).
 *
 * With rate data (schema v12): every sight is ranked by poiScore, and the
 * "must" shelf keeps only the top slice (proportional to catalogue size,
 * capped at MUST_CAP) of rate-3 sights - so the genuinely famous places rise
 * and the technically-rated-3-but-obscure ones demote to "worth". Without
 * rates (older data / Wikivoyage-sourced cities) the list order is already
 * importance-sorted, so we fall back to positional tiers.
 */
export function tieredActivities(items, eligibleIdx = null) {
  const sights = [];
  const active = [];
  (items || []).forEach((item, idx) => {
    if (eligibleIdx && !eligibleIdx.has(idx)) return;
    if (isTransportInfraPoi(item)) return;
    (item.active ? active : sights).push({ item, idx });
  });
  const hasRates = sights.some(({ item }) => item.rate != null);
  let must, worth, more;
  if (hasRates) {
    // Stable sort: score ties keep the harvest's importance order.
    const ranked = [...sights].sort((a, b) => poiScore(b.item) - poiScore(a.item));
    const mustN = Math.min(MUST_CAP, Math.max(3, Math.round(sights.length * 0.18)));
    must = ranked.filter(({ item }) => (item.rate ?? 0) >= 3).slice(0, mustN);
    const inMust = new Set(must);
    const rest = ranked.filter((e) => !inMust.has(e));
    worth = rest.filter(({ item }) => (item.rate ?? 0) >= 2).slice(0, WORTH_CAP);
    const inWorth = new Set(worth);
    more = rest.filter((e) => !inWorth.has(e));
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

// Honest per-kind visit durations (minutes at an unhurried-but-normal pace):
// a cathedral is not a fountain, and a museum is not a photo stop. Used both
// to budget drafted days and to show "~1 h visit" on every planned stop, so
// an "8 min walk" day never reads as an 8-minute day.
const KIND_DWELL = {
  Museum: 90, Gallery: 60, Aquarium: 75, Zoo: 120,
  Castle: 75, Palace: 80, Fortress: 60, Citadel: 60,
  Church: 25, Cathedral: 40, Basilica: 35, Chapel: 15,
  Monastery: 45, Convent: 30, Synagogue: 30, Mosque: 30, Temple: 30,
  Theatre: 25, Opera: 25,
  Square: 25, Monument: 15, Memorial: 15, Statue: 10, Fountain: 10,
  Gate: 10, Bridge: 15, Tower: 45, Lighthouse: 25, Viewpoint: 25,
  'Ancient site': 60, Ruins: 50, 'Roman site': 60,
  Market: 45, Brewery: 60, Winery: 75,
  Park: 45, Garden: 40, Lake: 45, Beach: 90, 'Nature reserve': 90,
  Cave: 60, Waterfall: 30, Peak: 75, Canyon: 75, Dunes: 60, Glacier: 90,
  Trail: 120, Hiking: 150, Cycling: 120, Climbing: 120,
  Diving: 150, Snorkeling: 90, Surfing: 120, Kayaking: 120, Rafting: 150,
  Skiing: 180, Golf: 180, 'Horse riding': 90, Swimming: 75,
  'Water park': 180, 'Theme park': 240, 'Ferris wheel': 30,
  'Sauna & baths': 120, 'Thermal baths': 120,
};

/** Estimated time at a stop, scaled by the traveller's visit style. */
export function dwellMinutes(kind, factor = 1) {
  return Math.max(10, Math.round((KIND_DWELL[kind] ?? 40) * factor));
}

/** "How long do you like at each stop?" - scales every dwell estimate. */
export const VISIT_PACES = [
  { key: 'quick', label: 'Quick looks', desc: 'Pop in, take it in, move on. You see more places', factor: 0.7 },
  { key: 'standard', label: 'A good look around', desc: 'Enough time to properly take each place in', factor: 1 },
  { key: 'deep', label: 'Take my time', desc: 'Linger and sit down. Fewer stops, deeper visits', factor: 1.45 },
];

/** "How much do you want to do that day?" - the traveller sets the ambition,
 *  Carta acts on it: it shifts how many stops a drafted day may hold. */
export const FILL_LEVELS = [
  { key: 'light', label: 'Keep it light', desc: 'A few highlights with plenty of breathing room', stopsDelta: -2 },
  { key: 'balanced', label: 'A good balance', desc: 'The essentials at a comfortable rhythm', stopsDelta: 0 },
  { key: 'packed', label: 'Pack it in', desc: 'See as much as one day allows', stopsDelta: 2 },
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
 *  the balanced pace when the traveller skipped the questions. `fill` (how
 *  much to do) shifts the stop count; `visit` (how long per stop) scales the
 *  dwell estimates, so "take my time" days naturally hold fewer places. */
export function feasibilityLimits({ dayLen, walk, fill, visit } = {}) {
  const d = DAY_LENGTHS.find((x) => x.key === dayLen) || DAY_LENGTHS[1];
  const w = WALK_LEVELS.find((x) => x.key === walk) || WALK_LEVELS[1];
  const f = FILL_LEVELS.find((x) => x.key === fill) || FILL_LEVELS[1];
  const v = VISIT_PACES.find((x) => x.key === visit) || VISIT_PACES[1];
  return {
    stopsMax: Math.max(2, d.stops + w.stopsDelta + f.stopsDelta),
    budgetMin: d.budgetMin,
    maxKmFromCentroid: w.maxKm,
    dwellFactor: v.factor,
  };
}

// Anything farther than this from the city's own centre is data noise for a
// walkable day plan (e.g. a POI across a strait on another island) - it can
// only produce impossible "walk over the sea" days.
export const MAX_POI_KM_FROM_CITY = 20;

// ...but a truly great sight beyond walking range (Mont-Saint-Michel from
// Saint-Malo, Versailles from Paris) is still worth surfacing as its own
// excursion, as long as it's a realistic day-trip distance away.
export const FAR_POI_MAX_KM = 90;

/**
 * Genuinely worth-the-detour sights OUTSIDE the walkable radius: strong
 * evidence only (top rate plus heritage/Wikipedia corroboration), sorted by
 * strength, with the distance so the traveller can judge the trek.
 * Returns [{ item, idx, km }], idx = original index into `items`.
 */
export function farWorthySights(items, cityDest, { limit = 6 } = {}) {
  const centre = cityCoords(cityDest);
  if (centre.lat == null) return [];
  return (items || [])
    .map((item, idx) => ({
      item, idx,
      km: item.lat != null && item.lon != null
        ? haversineKm(centre.lat, centre.lon, item.lat, item.lon)
        : null,
    }))
    .filter(({ item }) => !isTransportInfraPoi(item))
    .filter(({ item, km }) => km != null && km > MAX_POI_KM_FROM_CITY && km <= FAR_POI_MAX_KM
      && !item.active && poiScore(item) >= 3.4)
    .sort((a, b) => poiScore(b.item) - poiScore(a.item))
    .slice(0, limit);
}

// Kinds that make a walk between two sights genuinely nicer to pass by.
const SCENIC_KINDS = new Set([
  'Viewpoint', 'Bridge', 'Square', 'Fountain', 'Garden', 'Park', 'Gate',
  'Beach', 'Lighthouse', 'Waterfall', 'Lake', 'Statue', 'Monument',
]);

/**
 * "Make the walk itself beautiful": scan the planned day's legs for photogenic
 * places (viewpoints, bridges, squares, gardens...) that sit almost ON the
 * path - a tiny detour, not a new destination - and suggest the best ones.
 * Returns [{ idx, item, afterPos, extraMin, km }] sorted by quality;
 * afterPos = insert after this position in the current order.
 */
export function scenicSuggestions(orderIdx, items, { maxDetourKm = 0.5, limit = 2 } = {}) {
  // Positions in the day's order, keeping only routable stops.
  const seq = orderIdx
    .map((i, pos) => ({ pos, it: items[i] }))
    .filter((e) => e.it && e.it.lat != null && e.it.lon != null);
  if (seq.length < 2) return [];
  const inPlan = new Set(orderIdx);
  const out = [];
  items.forEach((item, idx) => {
    if (inPlan.has(idx) || item.active || item.lat == null || item.lon == null) return;
    if (!SCENIC_KINDS.has(item.kind)) return;
    if ((item.rate ?? 0) < 2 && !item.heritage) return;
    let best = null;
    for (let i = 0; i < seq.length - 1; i += 1) {
      const a = seq[i].it; const b = seq[i + 1].it;
      const direct = haversineKm(a.lat, a.lon, b.lat, b.lon);
      const viaA = haversineKm(a.lat, a.lon, item.lat, item.lon);
      const viaB = haversineKm(item.lat, item.lon, b.lat, b.lon);
      if (direct == null || viaA == null || viaB == null) continue;
      const detour = viaA + viaB - direct;
      if (detour <= maxDetourKm && (!best || detour < best.detour)) {
        best = { detour, afterPos: seq[i].pos };
      }
    }
    if (best) {
      out.push({
        idx, item,
        afterPos: best.afterPos,
        extraMin: Math.max(1, Math.round((best.detour / 4.8) * 60)),
        km: best.detour,
      });
    }
  });
  return out.sort((a, b) => poiScore(b.item) - poiScore(a.item)).slice(0, limit);
}

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

/** Same sanity cut as saneItemsForCity, but as a Set of ORIGINAL indices, so
 *  the planner can keep the full list (stable indices, searchable, far sights
 *  included) while tiers and drafts stay within walkable range. */
export function walkableIdxSet(items, cityDest) {
  const centre = cityCoords(cityDest);
  const set = new Set();
  (items || []).forEach((it, idx) => {
    if (isTransportInfraPoi(it)) return;
    if (it.lat == null || it.lon == null || centre.lat == null) { set.add(idx); return; }
    const km = haversineKm(centre.lat, centre.lon, it.lat, it.lon);
    if (km == null || km <= MAX_POI_KM_FROM_CITY) set.add(idx);
  });
  return set;
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
export function candidateDeck(items, interests, limit = 16, eligibleIdx = null) {
  const iset = interests instanceof Set ? interests : new Set(interests || []);
  const all = (items || []).map((item, idx) => ({ item, idx }))
    .filter(({ item, idx }) => item.lat != null && item.lon != null
      && (!eligibleIdx || eligibleIdx.has(idx)));
  const score = ({ item }) => {
    // Sights ride the composite poiScore (rate + heritage + Wikipedia
    // presence/fame) with a must-see bonus, so the deck leads with the
    // places genuinely worth the day; actives are interest-gated as before.
    const base = item.active
      ? (kindDirectMatch(item.kind, iset) ? 2.5 : -1) + (item.heritage ? 0.25 : 0) + popBoost(item)
      : poiScore(item) + (isMustSee(item) ? 0.6 : 0);
    return base + (kindDirectMatch(item.kind, iset) ? 0.75 : 0);
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
export function draftDays({ items, numDays, interests, paceKey, dwellFn, stopsMax, budgetMin, maxKmFromCentroid, eligibleIdx }) {
  const paceBase = PACES.find((p) => p.key === paceKey) || PACES[1];
  // Feasibility overrides (day length, walking appetite) win over the pace.
  const pace = {
    stops: stopsMax || paceBase.stops,
    budgetMin: budgetMin || paceBase.budgetMin,
  };
  const maxKm = maxKmFromCentroid || 3.5;
  const all = (items || []).map((item, idx) => ({ item, idx }))
    .filter(({ item, idx }) => item.lat != null && item.lon != null
      && (!eligibleIdx || eligibleIdx.has(idx)));

  // Rank: interest-matching actives join the sights; direct interest matches
  // get a boost so a beach person's draft actually contains the beach. Genuine
  // must-sees get their own bonus, so Carta's drafts always lead with the most
  // beautiful, highest-rated places. If the interest filter can't fill the
  // asked-for days, relax it to everything - the score boost still leads with
  // what they love, topped up with the city's best of the rest.
  let pool = all.filter(({ item }) => kindMatchesInterests(item.kind, interests));
  if (pool.length < pace.stops * numDays) pool = all;
  const score = ({ item }) => {
    const base = item.active
      ? (kindDirectMatch(item.kind, interests) ? 2.5 : -1) + (item.heritage ? 0.25 : 0) + popBoost(item)
      : poiScore(item) + (isMustSee(item) ? 0.6 : 0);
    return base + (kindDirectMatch(item.kind, interests) ? 0.75 : 0);
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
