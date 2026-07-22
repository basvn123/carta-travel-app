/**
 * dayDraft.js, pure logic for the Day planner's guided planning:
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
 * speak in ORIGINAL INDICES into that array, the same indices the planner's
 * saved assignments use.
 */
import { haversineKm, cityCoords } from '../lib/runtime_pricing.js';

/** Reorders a day's assigned activity indices to minimize backtracking, a
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

// The harvest files whole villages under kind "Square" (Bellagio, Varenna...):
// their Wikipedia summaries say "comune"/"municipality"/"village". Relabel so
// the planner never suggests "Bellagio, Square, ~25 min visit".
const MUNICIPALITY_RE = /\b(comune|municipality|municipio|gemeente|commune)\b|\bis a (village|hamlet|small town|town|frazione)\b|small (community|town|village)/i;
export function poiKind(item) {
  if (!item) return '';
  const kind = item.kind || '';
  if ((kind === 'Square' || kind === '') && MUNICIPALITY_RE.test(item.desc || '')) return 'Village';
  return kind;
}

// The bulk harvests (Overture's broad 'landmark'/'attraction' categories above
// all) drag in commercial noise: apartment blocks called "Condo Gardens
// Brussels", lounge bars named after the beach they face, ice-cream shops
// filed under kind "Glacier" (the Romance-language false friend). Their names
// give them away. Anything matching here in one of the loose kinds is not a
// sight at all and stays out of the planner's decks.
const COMMERCIAL_RE = /\b(apartments?|aparthotel|hostels?|hotels?|b&b|guesthouse|guest house|residence|suites?|rooms|store|shops?|boutique|bar|pub|lounge|restaurants?|ristorante|pizzeria|trattoria|osteria|bistro|brasserie|tavern|taverna|cafe|caff[eè]|coffee|helader[ií]a|gelateria|ice cream|takeaway|kebab|camping|campsite|parking|garage|car park|offices?|agency|rentals?|hire|barber|hairdresser|nightclub|casino|supermarket|shopping cent(?:er|re)|mall)\b/i;
const LOOSE_KINDS = new Set(['Landmark', 'Attraction', 'Glacier', 'Theme park', '']);
export function isCommercialNoisePoi(item) {
  if (!item) return false;
  if (!LOOSE_KINDS.has(item.kind || '')) return false;
  return COMMERCIAL_RE.test(item.name || '');
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

// The plain-language buckets a traveller actually filters by, not the 40
// harvested POI kinds. Nature covers beaches, lakes, parks, gardens, views and
// the like (whether you visit them or do something active there); food covers
// markets, breweries and wineries; everything else is a "sight".
const NATURE_RE = /beach|lido|spiaggia|strand|plage|playa|lake|lago|\bsee\b|meer|park|garden|giardino|jardin|garten|trail|falls|cascat|gorge|cliff|island|isola|\bisle\b|nature|riserva|reserve|\bbay\b|mountain|monte|\bpeak\b|viewpoint|panoram|waterfall|dune|glacier|\bcave\b|grotto|grotta|forest|foresta|valley|valle|meadow|hill/i;
const FOOD_RE = /market|mercato|marche|markt|brewery|birrificio|winery|vineyard|vigneto|cantina|distillery/i;

/** Which plain-language category a POI belongs to: 'sight' | 'nature' |
 *  'active' | 'food'. Drives the picker's filter chips. Parenthetical
 *  disambiguators are dropped first, so a villa named "... (Lake Como)" isn't
 *  miscounted as nature on the strength of its location suffix. */
export function poiCategory(item) {
  const name = (item.name || '').replace(/\([^)]*\)/g, ' ');
  // A lounge bar named after the playa it faces is not the playa: commercial
  // names classify by their harvested kind alone, never by name keywords. And
  // a commercial "Glacier" is an ice-cream shop, not ice.
  const commercial = COMMERCIAL_RE.test(name);
  const t = commercial
    ? (item.kind === 'Glacier' ? '' : item.kind || '')
    : `${item.kind || ''} ${name}`;
  if (NATURE_RE.test(t)) return 'nature';
  if (item.active) return 'active';
  if (FOOD_RE.test(t)) return 'food';
  return 'sight';
}

/** Which glyph a POI wears on the explore map (the map speaks town/beach/
 *  sight/active): villages and towns get the town roofline, nature gets the
 *  beach/nature mark, food folds into the sight star. */
export function poiMapCat(item) {
  const cat = poiCategory(item);
  if (cat === 'nature') return 'beach';
  if (cat === 'active') return 'active';
  if (cat === 'sight') {
    const k = poiKind(item);
    return (k === 'Village' || k === 'Town') ? 'town' : 'sight';
  }
  return 'sight'; // food
}

/**
 * A display rating (0-10) for a single POI, read off the SAME composite quality
 * signal the planner ranks by (poiScore: importance rate + heritage listing +
 * Wikipedia presence + real-world fame), just rescaled so the tiers read
 * naturally: a genuine must-see lands ~8.5-9.5, a solid rated place ~7, a
 * modest one ~5.5. Returns { score, tier (1-3), label } - tier drives the same
 * rt-1/2/3 chip colours the rest of the app uses.
 */
export function poiRating(item) {
  const s = poiScore(item);
  const score = Math.max(4.5, Math.min(9.6, 4.8 + s * 0.95));
  const must = isMustSee(item);
  const tier = must ? 3 : ((item.rate ?? 0) >= 2 || s >= 2.6) ? 2 : 1;
  const label = must ? 'Must-see' : tier === 2 ? 'Highly rated' : 'Worth a look';
  return { score: Math.round(score * 10) / 10, tier, label };
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
  'w', 'na', 'i', 'z', 'ze', 'przy', 'v', 'u', 'nad', 'pod', 'pri', 'ob',
  'in', 'ul', 'ulica', 'ulicy',
  // dedication phrasing: "pw." (pod wezwaniem), "im." (imienia), "św."...
  'pw', 'im', 'imienia', 'wezwaniem',
  // generic place kinds that translate but denote the same thing
  'castle', 'castello', 'castel', 'chateau', 'schloss', 'burg', 'castillo',
  'zamek', 'hrad', 'kasteel', 'castelo', 'castelul', 'dvorac', 'grad',
  'var', 'kastely', 'slott', 'slot', 'linna', 'pilis', 'pils', 'loss',
  'church', 'chiesa', 'iglesia', 'eglise', 'kirche', 'kerk',
  'kosciol', 'parafia', 'cerkiew', 'kostel', 'kostol', 'chram', 'crkva',
  'cerkev', 'biserica', 'igreja', 'templom', 'kirke', 'kyrka', 'kyrkja',
  'kirkko', 'kirik', 'baznica', 'baznycia', 'pfarrkirche', 'parroquia',
  'parrocchia', 'paroisse', 'parish', 'parochie',
  'cathedral', 'cattedrale', 'catedral', 'cathedrale', 'dom', 'duomo',
  'katedra', 'katedrala', 'catedrala', 'kathedraal', 'domkirke', 'domkyrka',
  'szekesegyhaz', 'se',
  'basilica', 'bazylika', 'bazilika', 'basiliek',
  'chapel', 'cappella', 'chapelle', 'kapelle', 'kaplica', 'kaple',
  'kaplnka', 'kapolna', 'capela', 'kapel', 'ermita',
  'monastery', 'monastero', 'monasterio', 'monastere', 'kloster', 'klooster',
  'klasztor', 'klaster', 'klastor', 'kolostor', 'samostan', 'manastir',
  'manastire', 'manastirea', 'mosteiro', 'convento', 'couvent', 'convent',
  'sanktuarium', 'santuario', 'priory', 'minster', 'munster',
  'museum', 'museo', 'musee', 'muzeum', 'museu', 'muzeul', 'muziejus',
  'palace', 'palazzo', 'palais', 'palast', 'palacio', 'palac', 'palota',
  'paleis', 'palatul',
  'tower', 'torre', 'tour', 'turm', 'toren', 'wieza', 'vez', 'torony',
  'toranj', 'turnul', 'torn', 'bokstas',
  'bridge', 'ponte', 'pont', 'brucke', 'brug', 'most', 'hid', 'podul', 'bro',
  'square', 'piazza', 'place', 'platz', 'plein', 'plaza', 'plac', 'rynek',
  'namesti', 'namestie', 'ter', 'trg', 'piata', 'praca', 'markt',
  'garden', 'gardens', 'giardino', 'jardin', 'garten', 'ogrod', 'zahrada',
  'kert', 'jardim', 'tuin',
  'park', 'parco', 'parc',
  'abbey', 'abbazia', 'abbaye', 'abdij', 'opactwo',
  'fort', 'fortress', 'fortezza', 'forteresse', 'festung',
  'saint', 'santa', 'santo', 'san', 'sant', 'st', 'sainte', 'santi',
  'sw', 'swietego', 'swietej', 'swietych', 'sv', 'svateho', 'svaty', 'svata',
  'svate', 'sveti', 'sveta', 'svete', 'svetog', 'svetega', 'szent', 'sankt',
  'sao', 'sint', 'sfantul', 'sfanta', 'heilige', 'heiligen',
  'ratusz', 'radnice', 'radnica', 'rathaus',
]);
function nameCore(name) {
  return (name || '')
    // parenthetical disambiguators are location, not identity: "Villa
    // Cipressi (Varenna)" must not inherit the town's name as evidence.
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    // letters NFD can't decompose ("Kościół" must become "kosciol", not "koscio")
    .replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/[đð]/g, 'd')
    .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ß/g, 'ss')
    .replace(/þ/g, 'th').replace(/ħ/g, 'h')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NAME_STOPWORDS.has(w))
    .join(' ')
    .trim();
}

// Sibling kinds the harvesters use interchangeably for the same real place
// (Wikipedia says "Basilica", OSM says "Church"), identity keys speak in the
// family so the kind wobble alone never splits a duplicate pair.
const KIND_FAMILIES = {
  church: 'worship', cathedral: 'worship', basilica: 'worship',
  chapel: 'worship', monastery: 'worship', convent: 'worship',
  abbey: 'worship', synagogue: 'worship', mosque: 'worship',
  temple: 'worship', shrine: 'worship',
  castle: 'castle', fortress: 'castle', citadel: 'castle', fort: 'castle',
  'ancient site': 'ruins', ruins: 'ruins', 'roman site': 'ruins',
  museum: 'museum', gallery: 'museum',
};
function kindFamily(kind) {
  const k = (kind || '').toLowerCase();
  return KIND_FAMILIES[k] || k;
}

/**
 * The strong identity keys for a POI, the same real place under a translated
 * or alternate name shares at least one: its thumbnail image, its proper-name
 * core paired with its kind family ("castle::vezio"), or its kind family
 * within ~120m ("castle@46.010,9.283"). A proper-name core only counts
 * alongside its kind family, so "Palazzo Reale" and "Teatro Reale" (same
 * adjective, different places) stay separate while "Castle of Vezio" /
 * "Castello di Vezio" collapse.
 */
export function poiIdentityKeys(item) {
  const keys = [];
  if (!item) return keys;
  const kind = (item.kind || '').toLowerCase();
  // EXACT image match only: normalizing away the thumbnail size looks
  // tempting, but Wikipedia's city articles reuse landmark lead photos at
  // another size ("Milan" carries the Galleria's photo), which would weld a
  // city entry to its landmark. True twins share name+coords and are caught
  // by the pairwise pass regardless.
  if (item.img) keys.push(`img:${item.img}`);
  const core = nameCore(item.name);
  // The core pairs with the kind FAMILY ("Church of X" / "Basilica of X" is
  // one place), but the geo cell keeps the RAW kind: old-town churches sit
  // shoulder to shoulder, and a family-wide 110m cell would weld neighbours.
  if (core && core.length >= 3) keys.push(`core:${kindFamily(item.kind)}::${core}`);
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

// Tokens match tolerant of Slavic/Romance inflection: identical, or sharing a
// stem of >=5 characters that reaches to within 3 of the longer token's end
// ("wawel"/"wawelu", "mariacki"/"mariackiego" match; "marina"/"marittima"
// doesn't). A whole-prefix relation of >=6 chars also counts, because German
// and Nordic names fuse the kind word into the token ("theodul" must match
// "theodulgletscher").
function tokensAlike(a, b) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 5) return false;
  let p = 0;
  while (p < n && a[p] === b[p]) p += 1;
  return (p >= 5 && p >= Math.max(a.length, b.length) - 3) || (p === n && p >= 6);
}

// Does the shorter name's core essentially live inside the longer one's?
// ("matki bozej nieustajacej pomocy" inside "parafia matki bozej nieustajacej
// pomocy" once kind words strip away). Every token of the smaller side must
// match; returns how many did (0 = no containment), so the caller can demand
// stronger evidence for riskier merges.
function coreContainment(tokensA, tokensB) {
  const [small, big] = tokensA.length <= tokensB.length
    ? [tokensA, tokensB] : [tokensB, tokensA];
  if (!small.length) return 0;
  let chars = 0;
  for (const t of small) {
    if (!big.some((o) => tokensAlike(t, o))) return 0;
    chars += t.length;
  }
  // A lone short leftover ("reale") is noise, never identity.
  return (small.length >= 2 || chars >= 6) ? small.length : 0;
}

// Two entries this close with essentially the same name are one real place.
const DUPE_RADIUS_KM = 0.25;

// Group a list's near-duplicates with a union-find: entries sharing any exact
// identity key (image / core+kind-family / geo-cell+kind) merge, and a second
// pairwise pass catches the harvest's ugliest twins, the same church under
// two names AND two kinds ("Parafia ..." filed as Square next to "Kosciol
// pw. ..." filed as Church), which share no kind-qualified key but sit 40m
// apart with the same proper-name core.
function poiDupeGroups(list) {
  const n = list.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };

  // An image URL attached to 3+ entries is a harvester fallback photo (Berlin
  // has five unrelated POIs wearing one Museumsinsel shot), not identity, it
  // would weld a whole neighbourhood into one "duplicate" group.
  const imgCount = new Map();
  list.forEach((item) => {
    if (item?.img) imgCount.set(item.img, (imgCount.get(item.img) || 0) + 1);
  });
  const byKey = new Map();
  list.forEach((item, idx) => {
    for (const k of poiIdentityKeys(item)) {
      if (k.startsWith('img:') && (imgCount.get(item.img) || 0) >= 3) continue;
      if (byKey.has(k)) union(byKey.get(k), idx); else byKey.set(k, idx);
    }
  });

  // Tokens shared across a large slice of THIS list, the city's own name,
  // mostly ("... w Krakowie", "... de Santander"), carry no identity signal:
  // without this, "Berlin Cathedral" (core: just "berlin") would swallow every
  // Berlin-named neighbour. Drop them before the pairwise comparison.
  const rawTokens = list.map((item) => nameCore(item?.name).split(' ').filter(Boolean));
  const df = new Map();
  rawTokens.forEach((ts) => new Set(ts).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  const maxDf = Math.max(3, Math.ceil(n * 0.08));
  const meta = list.map((item, i) => ({
    tokens: rawTokens[i].filter((t) => (df.get(t) || 0) < maxDf),
    fam: kindFamily(item?.kind),
    lat: item?.lat ?? null,
    lon: item?.lon ?? null,
  }));
  for (let i = 0; i < n; i += 1) {
    const a = meta[i];
    if (!a.tokens.length) continue;
    for (let j = i + 1; j < n; j += 1) {
      if (find(i) === find(j)) continue;
      const b = meta[j];
      if (!b.tokens.length) continue;
      const matched = coreContainment(a.tokens, b.tokens);
      if (!matched) continue;
      // Across kind families a single shared token is weak evidence (a church
      // and the square it stands on often share a name), demand two.
      if (matched < 2 && a.fam !== b.fam) continue;
      if (a.lat != null && b.lat != null) {
        const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
        if (km != null && km <= DUPE_RADIUS_KM) union(i, j);
      } else if (a.lat == null && b.lat == null && matched >= 2) {
        // Limited-data lists carry no coordinates to corroborate; only an
        // essentially identical multi-word core is safe evidence there.
        union(i, j);
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()];
}

/**
 * Detect near-duplicate POIs in a city's harvested list, the same real place
 * appearing twice under a translated or alternate name (e.g. "Castello di
 * Vezio" and "Castle of Vezio"). Duplicates collapse into one group (see
 * poiDupeGroups); the strongest entry survives and the rest come back as
 * `suppressed` (a Set of indices) so callers can hide them WITHOUT reindexing
 * the array, saved assignments and toggles keep speaking in the original,
 * stable indices. `canon` maps each suppressed index to its surviving twin,
 * so already-saved plans that reference a duplicate can be repaired in place.
 */
export function canonicalPoiIndices(items) {
  const suppressed = new Set();
  const canon = new Map();
  const list = items || [];
  if (list.length < 2) return { suppressed, canon };
  for (const g of poiDupeGroups(list)) {
    if (g.length < 2) continue;
    // Keep the strongest; suppress the rest (stable: ties keep lowest index).
    const winner = g.reduce((best, idx) =>
      (dupeRank(list[idx]) > dupeRank(list[best]) ? idx : best), g[0]);
    for (const idx of g) if (idx !== winner) { suppressed.add(idx); canon.set(idx, winner); }
  }
  return { suppressed, canon };
}

export function duplicatePoiIndices(items) {
  return canonicalPoiIndices(items).suppressed;
}

/**
 * Tier a city's activity list for display. Returns { must, worth, more, active },
 * each an array of { item, idx } (idx = original index into `items`).
 *
 * With rate data (schema v12): every sight is ranked by poiScore, and the
 * "must" shelf keeps only the top slice (proportional to catalogue size,
 * capped at MUST_CAP) of rate-3 sights, so the genuinely famous places rise
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
    if (isCommercialNoisePoi(item)) return;
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

// Which interests each catalogued kind speaks to, the Day planner's superset
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
  // Overture / Wikidata spellings of concepts the OTM taxonomy already names
  // (Opera house vs Opera, Archaeological site vs Ancient site), plus the
  // broad kinds those sources default to. Without these, half the catalogue
  // (Overture alone is 50% of items) sat outside every interest filter.
  Landmark: ['photo'], 'Historic site': ['culture'],
  'Archaeological site': ['culture'], 'Opera house': ['culture'],
  'Performing arts': ['culture'], Sculpture: ['photo'],
  Fortification: ['architecture', 'photo'], 'City gate': ['architecture'],
  Stadium: ['sports'], 'National park': ['outdoors'],
  River: ['outdoors'], Island: ['outdoors', 'photo'],
  Cliffs: ['outdoors', 'photo'], Geyser: ['outdoors', 'photo'],
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

/** 0..0.8 fame boost from Wikipedia pageviews, enough to lift a world-famous
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
  Square: 25, Village: 90, Town: 90, Monument: 15, Memorial: 15, Statue: 10, Fountain: 10,
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
  // Overture / Wikidata kinds (see the KIND_INTERESTS note): without these,
  // 27% of the catalogue fell through to the generic 40-minute default.
  Landmark: 30, Attraction: 40, 'Historic site': 50, 'Archaeological site': 60,
  'Opera house': 25, 'Performing arts': 25, Sculpture: 10, Fortification: 45,
  'City gate': 10, Stadium: 60, 'National park': 180, River: 20, Island: 120,
  Cliffs: 45, Geyser: 45, Activity: 90,
};

/** Estimated time at a stop, scaled by the traveller's visit style. */
export function dwellMinutes(kind, factor = 1) {
  return Math.max(10, Math.round((KIND_DWELL[kind] ?? 40) * factor));
}

/** "How long do you like at each stop?", scales every dwell estimate. */
export const VISIT_PACES = [
  { key: 'quick', label: 'Quick looks', desc: 'Pop in, take it in, move on. You see more places', factor: 0.7 },
  { key: 'standard', label: 'A good look around', desc: 'Enough time to properly take each place in', factor: 1 },
  { key: 'deep', label: 'Take my time', desc: 'Linger and sit down. Fewer stops, deeper visits', factor: 1.45 },
];

/** "How much do you want to do that day?", the traveller sets the ambition,
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
// walkable day plan (e.g. a POI across a strait on another island), it can
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
    .filter(({ item }) => !isTransportInfraPoi(item) && !isCommercialNoisePoi(item))
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
 * path, a tiny detour, not a new destination, and suggest the best ones.
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

// How tight "the city centre / around my stay" is for the area question. Big
// enough to hold a whole historic core, small enough to exclude the suburbs
// a 20 km walkable radius lets in.
export const AREA_KM = 3.5;

/**
 * "Where should Carta focus this day?", the guidance step for LARGE cities,
 * whose 20 km walkable radius spans far more than a day can cover. Without it
 * an auto-draft can legally anchor a day in the outskirts (technically the
 * highest-scoring cluster) when the traveller obviously meant the centre.
 *
 * Builds the choosable areas from the data itself:
 *   centre  POIs within AREA_KM of the city's own centre (always offered
 *           when it holds enough material)
 *   stay    POIs within AREA_KM of the traveller's stay, only when the stay
 *           is meaningfully outside the centre (otherwise it IS the centre)
 *   all     everything walkable (the old behaviour, explicitly chosen)
 *
 * Returns [{ key, label, sub, count, idx: Set }], `idx` are ORIGINAL item
 * indices, ready to intersect with the draft's eligible set. When the whole
 * catalogue already sits in the centre there is nothing to guide, so only
 * 'all' comes back and the UI can skip the question entirely.
 */
export function cityAreaOptions(items, cityDest, stayPoint, eligibleIdx) {
  const centre = cityCoords(cityDest);
  const all = new Set();
  const centreSet = new Set();
  const staySet = new Set();
  const stayOk = stayPoint && stayPoint.lat != null && stayPoint.lon != null;
  (items || []).forEach((it, idx) => {
    if (eligibleIdx && !eligibleIdx.has(idx)) return;
    all.add(idx);
    if (it.lat == null || it.lon == null) {
      // No coordinates: can't place it in an area, but it stays draftable.
      centreSet.add(idx);
      staySet.add(idx);
      return;
    }
    if (centre.lat != null) {
      const km = haversineKm(centre.lat, centre.lon, it.lat, it.lon);
      if (km != null && km <= AREA_KM) centreSet.add(idx);
    }
    if (stayOk) {
      const km = haversineKm(stayPoint.lat, stayPoint.lon, it.lat, it.lon);
      if (km != null && km <= AREA_KM) staySet.add(idx);
    }
  });

  const options = [];
  const cityName = cityDest?.city || 'town';
  const MIN_AREA_POIS = 5; // fewer than this can't fill a day - not worth offering
  if (centre.lat != null && centreSet.size >= MIN_AREA_POIS) {
    options.push({
      key: 'centre',
      label: `${cityName} centre`,
      sub: 'The historic core and everything close to it',
      count: centreSet.size,
      idx: centreSet,
    });
  }
  // The stay area only earns a chip when it's genuinely its own neighbourhood.
  const stayFarFromCentre = stayOk && centre.lat != null
    && (haversineKm(stayPoint.lat, stayPoint.lon, centre.lat, centre.lon) ?? 0) > 2;
  if (stayFarFromCentre && staySet.size >= MIN_AREA_POIS) {
    options.push({
      key: 'stay',
      label: 'Around my stay',
      sub: 'Places you can reach from your door',
      count: staySet.size,
      idx: staySet,
    });
  }
  options.push({
    key: 'all',
    label: 'Anywhere in reach',
    sub: 'Let Carta roam the whole area',
    count: all.size,
    idx: all,
  });
  // Nothing meaningfully outside the centre? Then there is nothing to ask.
  const centreOpt = options.find((o) => o.key === 'centre');
  if (options.length === 2 && centreOpt && all.size - centreOpt.count < 6) {
    return [options[options.length - 1]];
  }
  return options;
}

/**
 * "What kind of day?" styles for the guided picker. Tourists don't know a
 * city's geography or its 40 POI kinds, they know whether they feel like
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
 * behind for this style, best first. Only worthwhile places make the deck,  * rate-2+ sights, heritage sites, and (for active styles) matching outdoor
 * kinds, so the traveller is never asked to judge filler.
 */
export function candidateDeck(items, interests, limit = 16, eligibleIdx = null) {
  const iset = interests instanceof Set ? interests : new Set(interests || []);
  const all = (items || []).map((item, idx) => ({ item, idx }))
    .filter(({ item, idx }) => item.lat != null && item.lon != null
      && !isTransportInfraPoi(item) && !isCommercialNoisePoi(item)
      && (!eligibleIdx || eligibleIdx.has(idx)));
  // Worth-the-day score, independent of the chosen mood: sights ride the
  // composite poiScore (rate + heritage + Wikipedia presence/fame) with a
  // must-see bonus; actives only count when their kind matches the mood.
  const base = ({ item }) => (item.active
    ? (kindDirectMatch(item.kind, iset) ? 2.5 : -1) + (item.heritage ? 0.25 : 0) + popBoost(item)
    : poiScore(item) + (isMustSee(item) ? 0.6 : 0));
  const score = (c) => base(c) + (kindDirectMatch(c.item.kind, iset) ? 0.75 : 0);

  // Every genuinely worthwhile place in town, best first.
  const worthwhile = all.filter((c) => base(c) > 0.5).sort((a, b) => score(b) - score(a));
  // Lead with the ones that fit the chosen mood...
  const onMood = worthwhile.filter((c) => kindMatchesInterests(c.item.kind, iset));
  // ...then, if the mood is thin here, backfill with the town's other strongest
  // spots so the picker is never near-empty. A single filter never dead-ends.
  const seen = new Set(onMood.map((c) => c.idx));
  const backfill = worthwhile.filter((c) => !seen.has(c.idx));
  return [...onMood, ...backfill].slice(0, limit);
}

/**
 * The picks-step deck: every genuinely worthwhile place in town, across ALL
 * categories (sights, nature & beaches, active, food), best-first with a gentle
 * nudge toward the chosen mood. Unlike candidateDeck, which narrows hard to
 * the mood so an auto-draft stays on-theme, this stays deliberately broad, so
 * the traveller can filter it by category and actually discover the lake's
 * beaches and viewpoints, not just its towns. Near-duplicate entries (the same
 * place under two names) are folded out.
 */
export function pickerDeck(items, interests, limit = 32, eligibleIdx = null) {
  const iset = interests instanceof Set ? interests : new Set(interests || []);
  const suppressed = duplicatePoiIndices(items || []);
  const all = (items || []).map((item, idx) => ({ item, idx }))
    .filter(({ item, idx }) => item.lat != null && item.lon != null
      && !isTransportInfraPoi(item) && !isCommercialNoisePoi(item)
      && !suppressed.has(idx)
      && (!eligibleIdx || eligibleIdx.has(idx)));
  // Category-agnostic quality on an absolute scale: sights and nature/active
  // spots alike ride poiScore, so a famous beach can outrank a minor church.
  const quality = ({ item }) => poiScore(item) + (isMustSee(item) ? 0.6 : 0);
  const score = (c) => quality(c) + (kindDirectMatch(c.item.kind, iset) ? 0.7 : 0);
  return all
    .filter((c) => quality(c) > 0.7)
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
 * filler, better an honest half-empty day 3 than three mediocre days.
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
      && !isTransportInfraPoi(item) && !isCommercialNoisePoi(item)
      && (!eligibleIdx || eligibleIdx.has(idx)));

  // Rank: interest-matching actives join the sights; direct interest matches
  // get a boost so a beach person's draft actually contains the beach. Genuine
  // must-sees get their own bonus, so Carta's drafts always lead with the most
  // beautiful, highest-rated places. If the interest filter can't fill the
  // asked-for days, relax it to everything, the score boost still leads with
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

  const dayLoad = days.map((d, i) => (d.length ? dwellFn(poiKind(items[d[0]])) : 0));
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
      const cost = dwellFn(poiKind(cand.item)) + WALK_EST_MIN;
      if (dayLoad[d] + cost > pace.budgetMin) continue;
      const c = centroid(days[d]);
      const dist = haversineKm(c.lat, c.lon, cand.item.lat, cand.item.lon) ?? Infinity;
      if (dist > maxKm) continue;
      if (dist < bestDist) { bestDist = dist; bestDay = d; }
    }
    if (bestDay < 0) continue;
    days[bestDay].push(cand.idx);
    dayLoad[bestDay] += dwellFn(poiKind(cand.item)) + WALK_EST_MIN;
    used.add(cand.idx);
  }

  return days.map((d) => optimizeOrder(d, items));
}

// ---- Ready-made day routes -------------------------------------------------
// Instead of one invisible "Carta drafts something" button, the planner offers
// a handful of PREDEFINED routes, each built from the same research/rating
// signal (poiScore: importance + heritage + Wikipedia fame) but through a
// different lens. The traveller's answers rank them, they pick one, and the
// picked route lands as ordinary assignments, fully modifiable afterwards.
export const ROUTE_THEMES = [
  { key: 'icons', title: 'The icons', desc: 'The highest-rated must-sees, the route first-timers dream of', interests: [], styles: ['classic', 'mix'] },
  { key: 'culture', title: 'Culture & museums', desc: 'Museums, churches and the finest architecture', interests: ['museums', 'culture', 'architecture'], styles: ['culture'] },
  { key: 'outdoors', title: 'Nature & views', desc: 'Parks, water, viewpoints and the prettiest corners outdoors', interests: ['outdoors', 'beaches', 'photo'], styles: ['active'] },
  { key: 'flavour', title: 'Markets & local flavour', desc: 'Markets, food spots and the squares locals actually use', interests: ['food', 'shopping'], styles: ['foodie'] },
];

/**
 * Build one candidate route per theme with the traveller's feasibility limits
 * applied, ranked so the theme matching their chosen style leads. Near-
 * duplicate routes (small towns where every lens finds the same six places)
 * collapse into the first one. Returns [{ key, title, desc, recommended,
 * lists, stops:[{item,idx}], km, totalMin, avgScore }].
 */
export function routeCandidates({ items, numDays = 1, eligibleIdx = null, limits = {}, dwellFactor = 1, styleKey = 'mix' }) {
  const dwellFn = (kind) => dwellMinutes(kind, dwellFactor);
  const built = [];
  for (const theme of ROUTE_THEMES) {
    const lists = draftDays({
      items,
      numDays,
      interests: new Set(theme.interests),
      paceKey: 'balanced',
      dwellFn,
      eligibleIdx,
      ...limits,
    });
    const day1 = lists[0] || [];
    if (day1.length < 2) continue;
    // Skip a theme when it's basically a repeat of an earlier route.
    const dup = built.some((b) => {
      const prev = new Set(b.lists[0]);
      const overlap = day1.filter((i) => prev.has(i)).length;
      return overlap / day1.length >= 0.7;
    });
    if (dup) continue;
    let straightKm = 0;
    for (let i = 1; i < day1.length; i++) {
      const a = items[day1[i - 1]];
      const b = items[day1[i]];
      if (a?.lat != null && b?.lat != null) straightKm += haversineKm(a.lat, a.lon, b.lat, b.lon) ?? 0;
    }
    const walkKm = Math.round(straightKm * 1.25 * 10) / 10; // street factor
    const dwellSum = day1.reduce((m, i) => m + dwellFn(poiKind(items[i])), 0);
    const totalMin = Math.round(dwellSum + (walkKm / 4.5) * 60);
    const avgScore = Math.round(
      (day1.reduce((s, i) => s + poiRating(items[i]).score, 0) / day1.length) * 10,
    ) / 10;
    built.push({
      key: theme.key,
      title: theme.title,
      desc: theme.desc,
      recommended: theme.styles.includes(styleKey),
      lists,
      stops: day1.map((idx) => ({ item: items[idx], idx })),
      km: walkKm,
      totalMin,
      avgScore,
    });
  }
  // Recommended first, then by how strong the route's places are.
  return built.sort((a, b) => (b.recommended - a.recommended) || (b.avgScore - a.avgScore));
}
