/**
 * countryMatch.js, the Where quiz answered with the catalogue rather than with
 * adjectives.
 *
 * The screen this feeds used to offer six "vibe" tiles and score them off the
 * `categories` tags alone. That had two problems. The tags are thin where the
 * trip types are strongest (party:5, beer:4, skiing:44 across all of Europe),
 * and a tag count is not a reason: "great for hiking" is a claim the traveller
 * cannot check. Meanwhile the app had already published five layers that count
 * the very things the quiz asks about, per country, with a score attached.
 *
 * So every trip type here resolves to signals of two kinds:
 *
 *   catalogue   destinations carrying a theme's tags, weighted by how good the
 *               places are (a strong match in a strong place counts for more),
 *               the same idea the old vibeFit had.
 *   layers      the published per-country counts: trails (n_trips), beaches
 *               (n, best), lakes (n, swimmable), mountains (n, best), cycling
 *               (n_routes). These are the numbers a reason can quote.
 *
 * Every reason returned is an i18n key plus the variables behind it, so the
 * caller renders "148 rated trails", never "great for hiking". A trip type
 * with no signal in a country produces no reason and no score, which is the
 * point: the recommendation has to be able to say why, or it does not appear.
 *
 * Pure and node-runnable, like lib/countryBrief.js: no React, no fetch, no
 * DOM. The caller loads the five indexes and hands them in.
 */
import { cityKeyName } from './placeName.js';


/**
 * The trip types the quiz offers, in their four groups.
 *
 * `tags` extends THEME_GROUPS in lib/countryBrief.js for the types that file
 * never had (trail running, cycling, road trips, festivals, family). `layers`
 * names which published layer counts the type, `months` gates a type to a
 * season when it genuinely has one (nobody skis in July), and `warm` scales it
 * by whether the chosen month is warm enough for it.
 *
 * A place counts for a trip type when it carries one of the type's tags OR
 * when the type's `match` predicate says so.
 *
 * The predicates exist because the tag vocabulary is uneven. It is rich where
 * the catalogue was built by hand (2,723 `historic`, 1,176 `village`) and
 * nearly empty where the quiz asks hardest: 33 `nightlife` tags, 16 `music`,
 * 5 `party` across the whole of Europe. A question answered from five tagged
 * cities is not answered. Where a structured field measures the same thing for
 * every destination, the predicate reads that instead:
 *
 *   place.class          metro / city / town / village, on all 3,868
 *   place.base           how well the place works as a base, 0..1
 *   beauty.components    urban / heritage / nature / beach intensities, 0..1
 *   rating.fame          how well known, which is what a nightlife or a
 *                        festival question is really asking about a city
 */
const isBig = (d) => d.place?.class === 'metro' || d.place?.class === 'city';

export const TRIP_TYPES = [
  // Unwind
  { key: 'beach', group: 'unwind', tags: ['beach', 'coast', 'island'], layers: ['beaches'], warm: true },
  {
    key: 'wellness',
    group: 'unwind',
    tags: ['spa', 'thermal'],
    layers: [],
    // 54 spa/thermal tags is too few to rank countries on, but a quiet,
    // well-rated small place is the other half of what a spa week means.
    match: (d) => (d.place?.class === 'town' || d.place?.class === 'village')
      && (d.rating?.score ?? 0) >= 7.5 && (d.crowding?.tier ?? 2) <= 2,
  },
  { key: 'lakes', group: 'unwind', tags: ['lake', 'lakes', 'countryside', 'quiet'], layers: ['lakes'] },
  // Explore
  {
    key: 'city',
    group: 'explore',
    tags: ['city', 'modern', 'university'],
    layers: [],
    // The `city` tag is carried by 716 places and withheld from plenty of real
    // cities; place.class is assigned to all of them. A city break also means
    // a city worth a break, so the urban beauty component gates it.
    match: (d) => isBig(d) && (d.beauty?.components?.urban ?? 0) >= 0.4,
  },
  {
    key: 'culture',
    group: 'explore',
    tags: ['unesco', 'historic', 'medieval', 'roman', 'castle', 'fortress', 'art', 'cathedral', 'baroque', 'renaissance', 'gothic'],
    layers: [],
    match: (d) => (d.beauty?.components?.heritage ?? 0) >= 0.6 || d.beauty?.unesco === true,
  },
  {
    key: 'food',
    group: 'explore',
    tags: ['food', 'wine', 'beer'],
    layers: [],
    // 176 food/wine/beer tags, concentrated in the obvious places. Eating well
    // is a thing cities and famous towns do, so fame carries the rest.
    match: (d) => isBig(d) && (d.rating?.fame ?? 0) >= 1200,
  },
  {
    key: 'nightlife',
    group: 'explore',
    tags: ['nightlife', 'party', 'music'],
    layers: [],
    // The thinnest tag in the catalogue (5 `party` tags in Europe). A night
    // out happens in big, busy, well-known cities, all three of which are
    // measured for every destination.
    match: (d) => isBig(d) && (d.rating?.fame ?? 0) >= 1500 && (d.place?.base ?? 0) >= 0.6,
  },
  { key: 'romantic', group: 'explore', tags: ['romantic', 'fairytale'], layers: [] },
  { key: 'hidden', group: 'explore', tags: ['remote', 'quiet', 'village'], layers: [], gem: true },
  // Active
  { key: 'hiking', group: 'active', tags: ['hiking', 'national-park', 'wilderness', 'mountains', 'alps'], layers: ['trails', 'mountains'] },
  { key: 'trailrun', group: 'active', tags: ['hiking', 'mountains', 'national-park'], layers: ['trails', 'mountains'] },
  { key: 'cycling', group: 'active', tags: ['countryside', 'lake'], layers: ['cycling'] },
  { key: 'water', group: 'active', tags: ['surf', 'diving', 'sailing', 'beach', 'lake'], layers: ['beaches', 'lakes'], warm: true },
  { key: 'ski', group: 'active', tags: ['skiing', 'alps', 'mountains', 'winter'], layers: ['mountains'], months: [12, 1, 2, 3, 4] },
  { key: 'roadtrip', group: 'active', tags: ['countryside', 'coast', 'valley', 'nature'], layers: [] },
  // Who / how
  { key: 'backpack', group: 'who', tags: ['affordable', 'town', 'village'], layers: [] },
  {
    key: 'family',
    group: 'who',
    tags: ['family', 'beach', 'lake'],
    layers: ['beaches'],
    match: (d) => (d.place?.base ?? 0) >= 0.5 && (d.crowding?.tier ?? 2) <= 2,
  },
  { key: 'islands', group: 'who', tags: ['island', 'islands', 'coast'], layers: ['beaches'], warm: true },
  {
    key: 'festivals',
    group: 'who',
    tags: ['music', 'party', 'culture'],
    layers: [],
    // country_insights lists real, dated festivals per country; that is the
    // signal, and it is read per country rather than per place (see below).
    match: (d) => isBig(d) && (d.rating?.fame ?? 0) >= 1500,
    events: true,
  },
];

export const TRIP_TYPE_BY_KEY = new Map(TRIP_TYPES.map((x) => [x.key, x]));

/** The four group headings, in the order the quiz shows them. */
export const TRIP_GROUPS = ['unwind', 'explore', 'active', 'who'];

/** How many trip types a traveller may pick. More than three and the ranking
 *  is an average of everything, which recommends the biggest country. */
export const MAX_TRIP_TYPES = 3;

/** Q2: how you like to spend, and what it sets downstream. The `budget`
 *  values are the country_insights budget_level bands each answer fits. */
export const SPEND_CHOICES = [
  { key: 'budget', style: 'budget', levels: ['budget', 'cheap', 'low'] },
  { key: 'standard', style: 'standard', levels: ['mid', 'moderate', 'medium'] },
  { key: 'luxury', style: 'luxury', levels: ['high', 'expensive', 'pricey'] },
];

export const GETTING_AROUND = ['flytrain', 'car', 'trainonly', 'any'];
export const DISTANCE_CHOICES = ['short', 'anywhere'];
export const PACE_CHOICES = ['base', 'fewstops', 'moving'];
export const AVOID_CHOICES = ['crowds', 'heat', 'car', 'longdays'];

/** A short hop, in straight-line km from the origin. Two hours of flying at
 *  the cruise speed a budget carrier actually averages over a European leg,
 *  including the climb: about 700 km. */
const SHORT_HOP_KM = 1100;

/** Above this drive, "road trip from home" stops being a holiday and becomes
 *  the holiday. Hours, from lib/regions.js driveHoursEstimate. */
const MAX_DRIVE_H = 14;

/** Straight-line km between two {lat, lon}. A local copy of the haversine in
 *  lib/nearby.js, which imports browser-only code; this file stays runnable
 *  under plain node so its numbers can be checked without a build. */
function distanceKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = ((b.lon ?? b.lng) - (a.lon ?? a.lng)) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Drive hours for a straight-line distance, the same blunt model the region
 *  chips use. Kept local for the same node-runnable reason as distanceKm. */
function driveHours(km) {
  if (typeof km !== 'number' || !isFinite(km) || km <= 0) return null;
  return 0.6 + (km * 1.3) / 72;
}

/** The layer index rows keyed by country code. The five indexes disagree about
 *  the column name (trails and cycling say `country`, the other three say
 *  `cc`), so this is where that is reconciled once. */
function byCc(rows) {
  const out = new Map();
  for (const r of rows || []) {
    const cc = String(r?.cc || r?.country || '').toUpperCase();
    if (cc.length === 2) out.set(cc, r);
  }
  return out;
}

/**
 * The five published indexes, reduced to one lookup per country code.
 *
 * @param layerIndexes { trails?, beaches?, lakes?, mountains?, cycling? } as
 *        the lib/*.js loaders resolve them (each with a `countries` array), or
 *        null for a layer that has not been fetched.
 */
export function indexLayers(layerIndexes = {}) {
  const trails = byCc(layerIndexes.trails?.countries);
  const beaches = byCc(layerIndexes.beaches?.countries);
  const lakes = byCc(layerIndexes.lakes?.countries);
  const mountains = byCc(layerIndexes.mountains?.countries);
  const cycling = byCc(layerIndexes.cycling?.countries);
  return {
    trails: (cc) => {
      const r = trails.get(cc);
      return r ? { n: r.n_trips || 0, best: null } : null;
    },
    beaches: (cc) => {
      const r = beaches.get(cc);
      return r ? { n: r.n || 0, best: r.best ?? null } : null;
    },
    lakes: (cc) => {
      const r = lakes.get(cc);
      return r ? { n: r.n || 0, best: r.best ?? null, swimmable: r.swimmable || 0 } : null;
    },
    mountains: (cc) => {
      const r = mountains.get(cc);
      return r ? { n: r.n || 0, best: r.best ?? null } : null;
    },
    cycling: (cc) => {
      const r = cycling.get(cc);
      return r ? { n: r.n_routes || 0, best: null } : null;
    },
  };
}

/**
 * How much a layer count is worth, on the 0..1 scale the catalogue side uses.
 *
 * Saturating, and saturating EARLY, on purpose. A raw layer count measures how
 * thoroughly a country has been mapped at least as much as what is in it:
 * Germany publishes 4,674 trail trips and Austria 570, which says a great deal
 * about OSM contributors in Germany and very little about which of the two is
 * the better walking holiday. So the count is treated as a threshold ("there
 * is plenty here") rather than a quantity to be maximised, and the layer's
 * `best` score, which IS a quality measurement, carries the rest.
 */
function countWeight(n, half) {
  if (!n) return 0;
  return n / (n + half);
}

/** The layer half-saturation points, one per layer. Low, so that "enough to
 *  fill a holiday" reaches most of the available credit and the rest is
 *  decided on quality. */
const HALF = { trails: 60, beaches: 25, lakes: 15, mountains: 8, cycling: 10 };

/** The fewest tagged destinations a country needs before its share of them
 *  means anything. See catalogueFit. */
const MIN_TAGGED = 6;

/** What the best thing in a country is worth, from a layer's `best` score on
 *  the app's 0..10 scale. Below 7 nothing in that layer is a reason to go. */
function bestWeight(best) {
  if (typeof best !== 'number' || best <= 7) return 0;
  return Math.min(1, (best - 7) / 2.5);
}

/**
 * The catalogue side of one trip type in one country: how many of its
 * destinations carry the type's tags, how good those places are, and what
 * share of the country they make up.
 *
 * The share matters because without it every question is won by whichever
 * country has the most destinations. Italy holds more castles than Slovenia
 * and also more of everything else; what makes a country a hiking holiday is
 * that hiking is what it is FULL of.
 *
 * Returns { n, weight } where n is the plain count a reason can quote and
 * weight is the 0..1 contribution to the score.
 */
function catalogueFit(type, rows) {
  const tags = new Set(type.tags || []);
  let n = 0;
  let quality = 0;
  for (const d of rows) {
    const cats = d.categories || [];
    const tagged = cats.some((c) => tags.has(c));
    const hit = tagged
      || (type.gem && d.rating?.hidden_gem === true)
      || (type.match ? type.match(d) : false);
    if (!hit) continue;
    n += 1;
    // Rating is the app's 0..10 place score; a place with no score still
    // counts as a place, at the value of a middling one.
    quality += (d.rating?.score ?? 5) / 10;
  }
  if (!n) return { n: 0, weight: 0, share: 0 };
  // Below this many tagged places a country has not shown us a pattern, it has
  // shown us a coincidence. It matters because the tag vocabulary is thin
  // exactly where the quiz is most eager: across the whole of Europe the
  // catalogue carries 33 `nightlife`, 16 `music` and 5 `party` tags, so Spain
  // has five tagged nightlife cities and Denmark two. Ranking countries on
  // that is ranking noise, and a share computed from it (2 of 66) reads as
  // conviction. Under the floor the country keeps no catalogue weight and can
  // still be recommended on a layer count, which is measured properly.
  if (n < MIN_TAGGED) return { n, share: 0, weight: 0, thin: true };
  const avgQuality = quality / n;
  // Share needs a floor on the denominator, or a country with four catalogued
  // places and one beach reads as 25% beach and beats Spain.
  const share = n / Math.max(25, rows.length);
  const depth = countWeight(n, 12);
  // Share is NOT clamped to 1 at a low threshold. Clamping it there made a
  // country that is 44% coastal score exactly like one that is 68% coastal,
  // which is the difference between a country with a coast and a country that
  // IS a coast, and it is the whole question being asked.
  //
  // Depth and share are weighted evenly, and quality multiplies both.
  //
  // Leaning onto share alone elected whichever country had the SMALLEST
  // catalogue: Finland's 15 qualifying cities (average rating 6.1) outranked
  // Spain's 86 (average 7.3), because 15 of 28 is a bigger fraction than 86 of
  // 300. Both fractions are true and neither answers "where should I go for a
  // city break", which asks how many good places there are and how good.
  //
  // Quality is stretched around the European mean before it is applied.
  // Average ratings only span about 5.6 to 7.3, so used raw they move a score
  // by a sixth and decide nothing; centred on 6.6 and scaled, the same spread
  // becomes the factor of two it deserves to be.
  const q = Math.max(0.3, Math.min(1.7, 1 + (avgQuality * 10 - 6.6) / 2.2));
  return { n, share, weight: (depth * 0.5 + Math.min(1, share * 1.4) * 0.5) * q };
}

/** Month fit from country_insights best_months, 1..12. Null when the country
 *  has no guide, so a missing guide never counts against it. */
function monthFit(rec, month) {
  const best = Array.isArray(rec?.best_months) ? rec.best_months : null;
  if (!best || !best.length || !month) return null;
  if (best.includes(month)) return 1;
  // Either side of a listed month is still shoulder season.
  const near = best.some((m) => Math.abs(m - month) === 1 || Math.abs(m - month) === 11);
  return near ? 0.5 : 0;
}

/** The share of a country's destinations that are crowded (tier 3) in the
 *  month asked about. Crowding is an annual figure, so this is a property of
 *  the country, not of the date. Null when nothing is measured. */
function crowdShare(rows) {
  const tiers = rows.map((d) => d.crowding?.tier).filter((x) => x != null);
  if (!tiers.length) return null;
  return tiers.filter((x) => x >= 3).length / tiers.length;
}

/** The median daytime high across a country's destinations in `month`, from
 *  the climate normals each destination carries. Null when none do. */
function medianHigh(rows, month) {
  if (!month) return null;
  const highs = [];
  for (const d of rows) {
    const m = d.climate?.m;
    if (Array.isArray(m) && m[month - 1] && typeof m[month - 1][0] === 'number') {
      highs.push(m[month - 1][0]);
    }
  }
  if (!highs.length) return null;
  highs.sort((a, b) => a - b);
  return highs[highs.length >> 1];
}

/** Above this daytime high, "avoid heat" is a real complaint about a month. */
const HOT_C = 30;

/**
 * How well a month's weather suits a trip type that needs warmth.
 *
 * Without this, a beach question is won by whichever country has the highest
 * SHARE of coastline in the catalogue, and Sweden (44% coastal, 21C in July)
 * outranks Spain (44% coastal, 29C in July). Both shares are true; the
 * temperature is what makes one of them a beach holiday. The normals are
 * already on every destination, so this is a measurement, not a guess.
 *
 * Returns 0..1, or null when nothing in the country carries climate normals.
 */
function warmFit(rows, month) {
  const high = medianHigh(rows, month);
  if (high == null) return null;
  if (high >= 26) return 1;      // swimming weather
  if (high <= 17) return 0;      // a coast to walk on, not to swim off
  return (high - 17) / 9;
}

/**
 * Rank every country in the catalogue against the quiz answers.
 *
 * Nothing here invents a fact. A country only scores on a trip type it has
 * measured signal for, and every reason carries the number it came from.
 *
 * @param destinations  data.destinations (the { [id]: dest } map)
 * @param insights      { [countryName]: record } from useCountryInsights
 * @param layerIndexes  { trails, beaches, lakes, mountains, cycling } indexes
 * @param answers       { types: string[], spend, around, distance, pace,
 *                        avoid: string[] }
 * @param month         1..12, the month of travel (from the When step)
 * @param origin        { lat, lon } | null, from the From step
 * @returns [{ iso2, country, score, reasons: [{key, vars}], topPlaces }]
 *          sorted best first. An empty answers.types returns [].
 */
export function matchCountries({
  destinations, insights = null, layerIndexes = {}, answers = {}, month = null, origin = null,
} = {}) {
  const types = (answers.types || [])
    .map((k) => TRIP_TYPE_BY_KEY.get(k))
    .filter(Boolean)
    .slice(0, MAX_TRIP_TYPES);
  if (!types.length) return [];

  const layers = indexLayers(layerIndexes);
  const avoid = new Set(answers.avoid || []);

  // One pass to group the catalogue by country, carrying the centroid so the
  // distance questions can be answered without a second pass.
  //
  // One city per city. The catalogue keys a destination by AIRPORT, so Milan
  // is three rows (Malpensa, Bergamo, Linate), London four and Paris three.
  // Counting rows therefore counted terminals: it is why Italy looked like it
  // held 31 food cities and why the count rose with the number of runways
  // rather than the number of places. Each city is kept once, at its
  // best-rated row, which is also the row carrying the usable photograph.
  const byCountry = new Map();
  const seen = new Map(); // country + city key -> the index it was kept at
  for (const [id, d] of Object.entries(destinations || {})) {
    if (!d?.country || d.lat == null) continue;
    let g = byCountry.get(d.country);
    if (!g) {
      g = { country: d.country, iso2: d.iso2 || null, rows: [], ids: [], latSum: 0, lonSum: 0 };
      byCountry.set(d.country, g);
    }
    const key = `${d.country}|${cityKeyName(d.city).toLowerCase()}`;
    const at = seen.get(key);
    if (at != null) {
      // A city already seen: keep whichever row rates higher, so the one that
      // survives is the one the cards will want to show.
      const kept = g.rows[at];
      if ((d.rating?.score || 0) > (kept.rating?.score || 0)) {
        g.rows[at] = d;
        g.ids[at] = id;
      }
      continue;
    }
    seen.set(key, g.rows.length);
    g.rows.push(d);
    g.ids.push(id);
    g.latSum += d.lat;
    g.lonSum += d.lon;
  }

  const out = [];
  for (const g of byCountry.values()) {
    const cc = String(g.iso2 || '').toUpperCase();
    const rec = insights?.[g.country] || null;
    const centroid = { lat: g.latSum / g.rows.length, lon: g.lonSum / g.rows.length };
    const km = origin ? distanceKm(origin, centroid) : null;

    // ---- the hard filters: a "no" here drops the country, it does not
    // merely cost it points, because the traveller said they cannot go.
    if (answers.distance === 'short' && km != null && km > SHORT_HOP_KM) continue;
    if ((answers.around === 'car' || answers.around === 'trainonly') && km != null) {
      const h = driveHours(km);
      if (h != null && h > MAX_DRIVE_H) continue;
    }
    if (answers.around === 'trainonly' && rec && !rec.rail) continue;

    const reasons = [];
    let score = 0;
    const typeScores = [];

    for (const type of types) {
      // A seasonal type out of season scores nothing anywhere, and says so
      // once, at the top, rather than quietly ranking summer ski countries.
      if (type.months && month && !type.months.includes(month)) {
        typeScores.push({ key: type.key, s: 0, outOfSeason: true });
        continue;
      }
      const cat = catalogueFit(type, g.rows);
      let s = cat.weight;
      const layerBits = [];
      for (const name of type.layers || []) {
        const row = layers[name]?.(cc);
        if (!row || !row.n) continue;
        // Enough of them, and good ones. The count saturates early (see
        // countWeight) so that the layer's own quality score decides between
        // two countries that both have plenty.
        s += countWeight(row.n, HALF[name] || 30) * 0.45 + bestWeight(row.best) * 0.55;
        layerBits.push({ name, n: row.n, best: row.best });
      }
      // A type that needs warmth is scaled by whether the chosen month
      // delivers it, measured over the places that carry the type's own tags
      // rather than the whole country: what decides a Spanish beach week is
      // the coast in July, not the median of Madrid and the Pyrenees.
      //
      // Not a filter. A Baltic beach week in July is a real holiday and stays
      // on the list; it is just not what to recommend first to someone who
      // asked for a beach. The floor is low for that reason: at 21C the score
      // keeps a fifth of its value, enough to rank behind the Mediterranean
      // and ahead of a landlocked country.
      if (type.warm && month) {
        const tags = new Set(type.tags || []);
        const onTopic = g.rows.filter((d) => (d.categories || []).some((c) => tags.has(c)));
        const w = warmFit(onTopic.length ? onTopic : g.rows, month);
        if (w != null) s *= 0.2 + w * 0.8;
      }
      typeScores.push({ key: type.key, s, cat, layerBits });
      score += s;
    }

    // Nothing measured for anything they asked for: not a recommendation.
    if (score <= 0) continue;

    // ---- the reasons, richest signal first. A layer count is the strongest
    // thing we can say (it is a number with a published list behind it), the
    // catalogue count second.
    const ranked = typeScores.slice().sort((a, b) => b.s - a.s);
    // Two trip types can rest on the same layer (hiking and trail running both
    // count trails), and saying "868 rated trails" twice on one card is not two
    // reasons, it is one reason and a bug. A key is used once.
    const said = new Set();
    const say = (key, vars) => {
      if (said.has(key) || reasons.length >= 3) return;
      said.add(key);
      reasons.push({ key, vars });
    };
    for (const ts of ranked) {
      if (reasons.length >= 3 || ts.s <= 0) continue;
      // The strongest layer this type has that has not already been quoted,
      // so a second trails-based type contributes its mountains instead of
      // repeating the trails.
      const bits = (ts.layerBits || []).slice().sort((a, b) => b.n - a.n);
      const fresh = bits.find((b) => !said.has(`match.layer.${b.name}`));
      if (fresh) say(`match.layer.${fresh.name}`, { n: fresh.n });
      else if (ts.cat?.n) say(`match.type.${ts.key}`, { n: ts.cat.n });
    }

    // ---- the soft signals: month, spend and the avoid list. Each one moves
    // the score and, when it is worth saying, adds a reason.
    const mf = monthFit(rec, month);
    if (mf != null) {
      score += mf * 0.5;
      // "At its best this month" repeated the match line above it and, worse,
      // carried no number, which is the one thing every reason here promises.
      // How many months the guide calls good IS a number, and it says
      // something the header does not: a country with four good months is a
      // different proposition from one with eight.
      if (mf === 1 && reasons.length < 3 && month) {
        const n = (rec.best_months || []).length;
        if (n) say('match.bestMonth', { n });
      }
    }

    const spend = SPEND_CHOICES.find((x) => x.key === answers.spend);
    if (spend && rec?.budget_level) {
      const fits = spend.levels.includes(String(rec.budget_level).toLowerCase());
      score += fits ? 0.4 : -0.25;
      if (fits && reasons.length < 3 && Array.isArray(rec.daily_budget_eur)) {
        say('match.budget', { lo: rec.daily_budget_eur[0], hi: rec.daily_budget_eur[1] });
      }
    }

    if (answers.around === 'trainonly' && rec?.rail) {
      score += 0.35;
      if (rec.rail.operator) say('match.rail', { operator: rec.rail.operator });
    }
    if (answers.around === 'car' && rec?.driving) {
      score += 0.2;
    }

    if (avoid.has('crowds')) {
      const share = crowdShare(g.rows);
      if (share != null) {
        score += (1 - share) * 0.5 - 0.25;
        if (share <= 0.15) say('match.quiet', { pct: Math.round((1 - share) * 100) });
      }
    }
    if (avoid.has('heat')) {
      const high = medianHigh(g.rows, month);
      if (high != null) {
        if (high > HOT_C) score -= 0.6;
        else if (high <= 26) say('match.mildHeat', { c: Math.round(high) });
      }
    }
    if (avoid.has('car') && rec && !rec.rail && !rec.bus) score -= 0.4;
    if (avoid.has('longdays') && km != null && km > SHORT_HOP_KM) score -= 0.3;

    // Pace is about the shape of the trip, not the country, with one honest
    // exception: "one base with day trips" needs somewhere with enough within
    // reach, and "keep moving" needs enough places to move between.
    if (answers.pace === 'moving' && g.rows.length < 8) score -= 0.3;
    if (answers.pace === 'base' && g.rows.length >= 12) score += 0.15;

    // The places behind the recommendation: the best-rated destinations that
    // actually carry one of the chosen types, so the thumbnails are evidence
    // rather than decoration.
    const tagUnion = new Set(types.flatMap((x) => x.tags || []));
    const topPlaces = g.ids
      .map((id, i) => ({ id, d: g.rows[i] }))
      .filter(({ d }) => d.image?.url && (d.categories || []).some((c) => tagUnion.has(c)))
      .sort((a, b) => (b.d.rating?.score || 0) - (a.d.rating?.score || 0))
      .slice(0, 3)
      .map((x) => x.id);

    out.push({
      iso2: g.iso2,
      country: g.country,
      score,
      reasons: reasons.slice(0, 3),
      topPlaces,
      topType: ranked[0]?.s > 0 ? ranked[0].key : null,
      bestMonth: mf === 1 ? month : null,
      nPlaces: g.rows.length,
    });
  }

  return out.sort((a, b) => b.score - a.score || a.country.localeCompare(b.country));
}
