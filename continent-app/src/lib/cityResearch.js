/**
 * cityResearch.js, adding a town Carta has never catalogued.
 *
 * The catalogue holds 1,570 destinations, so a traveller staying in Ghent who
 * asks for Lokeren is asking for a town that genuinely isn't in the data. The
 * old answer was to snap them to the nearest catalogued city, which quietly
 * moved their day 20 km away. This module does the other thing: it goes and
 * researches the town live, from the same open sources the offline pipeline
 * uses, and builds a destination record the day planner can plan against.
 *
 *   Nominatim   the town itself: authoritative centre coordinates, country,
 *               ISO2, population and (often) its Wikipedia article
 *   Wikipedia   the town's blurb and hero image, plus every article with
 *               coordinates inside the search radius, which is a strong
 *               notability filter: a place with an article is worth seeing
 *   Overpass    OpenStreetMap's tourism / historic / leisure / natural
 *               features, which cover what Wikipedia never bothered writing
 *               about (the park, the belfry, the market square)
 *
 * Two rules the harvest never breaks:
 *   - Coordinates come from the sources, never from a language model. A pin
 *     in the wrong field is worse than no pin.
 *   - Sight names stay in the local language, matching the street signs and
 *     Google Maps (see i18n/index.jsx). English Wikipedia only ever supplies
 *     the description, the image and the article link.
 *
 * Prices are NOT researched. A discovered town inherits its country-level
 * cost basket and transport profile from the nearest catalogued town in the
 * same country (those are modelled per country upstream) and carries no
 * accommodation figures at all, because a nightly rate that wasn't measured
 * in that town is a made-up number.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Tried in order. Any host added here also belongs in vercel.json's
// connect-src, or the browser blocks the call before it is sent.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// How wide the harvest looks around the town centre. Comfortably more than a
// walking day (the planner's own walkable radius is 20 km) without dragging in
// the next town's sights.
const RADIUS_M = 8000;
const RADIUS_BIG_M = 12000;   // for cities above BIG_POP
const BIG_POP = 120000;

const WIKI_GEO_LIMIT = 45;
const WIKI_EXTRACT_BATCH = 20;
const OVERPASS_LIMIT = 220;
const POI_CAP = 70;
// Below this a "day plan" would be three stops and a walk home, so the town is
// reported as too thin rather than shipped as a working destination.
const MIN_POIS = 4;

const REQUEST_MS = 20000;
const OVERPASS_MS = 45000;

/** Which Wikipedia a country's places are actually written up in. Only the
 *  languages the catalogue's countries use; anything unlisted falls back to
 *  English alone. */
const WIKI_LANG_BY_ISO2 = {
  AL: 'sq', AD: 'ca', AT: 'de', BE: 'nl', BA: 'bs', BG: 'bg', HR: 'hr',
  CY: 'el', CZ: 'cs', DK: 'da', EE: 'et', FO: 'fo', FI: 'fi', FR: 'fr',
  DE: 'de', GI: 'es', GR: 'el', HU: 'hu', IS: 'is', IE: 'en', IT: 'it',
  XK: 'sq', LV: 'lv', LI: 'de', LT: 'lt', LU: 'de', MT: 'mt', MD: 'ro',
  MC: 'fr', ME: 'sr', NL: 'nl', MK: 'mk', NO: 'no', PL: 'pl', PT: 'pt',
  RO: 'ro', RS: 'sr', SK: 'sk', SI: 'sl', ES: 'es', SE: 'sv', CH: 'de',
  TR: 'tr', UA: 'uk', GB: 'en',
};

/* ---------------------------------------------------------------- fetching */

async function getJson(url, { ms = REQUEST_MS, ...init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, headers: { Accept: 'application/json', ...(init.headers || {}) } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((v) => Number.isFinite(v))) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Lowercase, unaccented, punctuation-free: the key two spellings of the same
 *  place collapse onto. */
function fold(s) {
  return (s || '')
    // Wikipedia disambiguates titles that OpenStreetMap doesn't ("Markt
    // (Lokeren)" against "Markt"), so parentheticals never take part in
    // matching, or the same place lands twice.
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(s) {
  return fold(s).replace(/\s+/g, '-').slice(0, 48) || 'place';
}

/** The opening sentence of a Wikipedia intro, which is reliably the "what is
 *  this place" line. Splits on ". " so abbreviations ("St. Niklaas") survive. */
function firstSentence(text, limit) {
  const s = (text || '').trim();
  if (!s) return '';
  const cut = s.split('. ')[0];
  const one = cut.length < s.length ? `${cut}.` : cut;
  return one.length > limit ? `${one.slice(0, limit).replace(/[\s,;:]+$/, '')}...` : one;
}

/* ------------------------------------------------------- 1. the town itself */

/**
 * Nominatim's record for the town: the centre coordinate every later step
 * measures from. `hint` is whatever the caller already believed (an AI
 * suggestion's coordinates, a geocode hit); a lookup landing more than
 * FAR_HINT_KM from it is treated as the wrong "Lokeren" and the hint wins.
 */
const FAR_HINT_KM = 60;

// The town itself, versus the administrative area named after it. Nominatim
// returns both for "Lokeren", and the municipality's centroid sits 5 km north
// of the town in the fields it administers: harvesting around that one gave
// Lokeren a day of churches in Moerbeke and Eksaarde. The town wins.
const CENTRE_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'borough', 'suburb', 'locality', 'island']);
const AREA_TYPES = new Set(['municipality', 'administrative', 'county', 'state', 'region', 'province']);

function placeRank(r) {
  if (r.category === 'place' && CENTRE_TYPES.has(r.type)) return 3;
  if (CENTRE_TYPES.has(r.addresstype)) return 2;
  if (AREA_TYPES.has(r.addresstype)) return 1;
  return 0;
}

export async function lookupPlace(name, { country = '', hint = null } = {}) {
  const q = [name, country].filter(Boolean).join(', ').trim();
  if (q.length < 2) return null;
  // accept-language=en on purpose: city and country names are lookup keys all
  // over the app (country insights, transport profiles, the catalogue itself),
  // so a town has to arrive as "Ghent, Belgium", not "Gent, Belgie / Belgique
  // / Belgien". Sight names, which must match street signs, come from
  // OpenStreetMap and the local Wikipedia instead, and stay local.
  const url = `${NOMINATIM}?format=jsonv2&accept-language=en&limit=5&addressdetails=1&extratags=1&q=${encodeURIComponent(q)}`;
  const rows = await getJson(url);
  const list = Array.isArray(rows) ? rows : [];
  const scored = list
    .map((r) => {
      const lat = num(r.lat);
      const lon = num(r.lon);
      if (lat == null || lon == null) return null;
      const km = hint ? haversineKm(hint.lat, hint.lon, lat, lon) : null;
      return { r, lat, lon, km, rank: placeRank(r) };
    })
    .filter(Boolean)
    .filter((x) => x.km == null || x.km <= FAR_HINT_KM)
    // Best-shaped answer first (a town beats the municipality around it, and
    // both beat a street of the same name), then nearest to whatever the
    // caller already believed.
    .sort((a, b) => (b.rank - a.rank) || ((a.km ?? 0) - (b.km ?? 0)));

  // No hit means no such place, and the caller's own coordinates are NOT a
  // fallback: harvesting around them would build a town out of whatever its
  // neighbour has, under a name nobody can find on a map. A suggestion Carta
  // cannot geocode is a suggestion it declines.
  const best = scored[0];
  if (!best) return null;
  const { r } = best;
  const addr = r.address || {};
  const localName = r.name || (r.display_name || '').split(',')[0].trim() || name;
  return {
    name: localName,
    country: addr.country || country || '',
    iso2: (addr.country_code || '').toUpperCase(),
    lat: best.lat,
    lon: best.lon,
    population: num(r.extratags?.population),
    // "nl:Lokeren" when OSM knows the article, which saves guessing the title.
    wikipedia: typeof r.extratags?.wikipedia === 'string' ? r.extratags.wikipedia : '',
  };
}

/* ---------------------------------------------------------- 2. Wikipedia */

/** The town's own article: blurb + hero image. */
async function wikiSummary(wl, title) {
  if (!wl || !title) return null;
  const url = `https://${wl}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const j = await getJson(url);
  if (!j || j.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return null;
  return {
    title: j.title || title,
    extract: j.extract || '',
    img: j.thumbnail?.source || j.originalimage?.source || '',
    page: j.content_urls?.desktop?.page || '',
  };
}

// Wikidata's one-line description tells us what an article is ABOUT, which is
// both the cheapest sight filter there is and a decent source of POI kinds.
// Written in the language of the wiki being read, so the vocabulary covers the
// languages WIKI_LANG_BY_ISO2 sends us to, not just English. Without this a
// geosearch around Lokeren offers the neighbouring municipalities of Zele and
// Waasmunster as things to see.
const NOT_A_SIGHT_RE = new RegExp([
  // settlements and administrative units
  'human settlement|municipalit|\\bcommune\\b|village|town in|city in|hamlet|neighbou?rhood|suburb|district of|province|county|region of|arrondissement|administrative',
  'gemeente|deelgemeente|dorp|gehucht|plaats in|provincie|wijk',
  'gemeinde|ortsteil|ortschaft|stadtteil|landkreis|bezirk',
  'comune|frazione|quartiere|provincia',
  'municipio|localidad|barrio|concelho|freguesia',
  'gmina|wies|wieś|powiat|dzielnica|miasto w',
  // streets, roads and transport
  'street in|road in|motorway|highway|railway|railroad|train station|metro station|bus station|airport',
  'straat|weg in|station in|spoorlijn|snelweg',
  'strasse|straße|bahnhof|autobahn',
  '\\brue\\b|\\bgare\\b|autoroute|\\bcalle\\b|estacion|estación|\\bvia\\b|stazione|ulica|stacja',
  // institutions and organisations that are not places to visit
  'school|college|university|hospital|clinic|prison|barracks|cemetery|graveyard',
  'schule|universitat|universität|krankenhaus|friedhof|ecole|école|hopital|hôpital|cimetiere|cimetière',
  'basisschool|middelbare|ziekenhuis|begraafplaats|kerkhof',
  'company|business|manufacturer|brewery group|football club|sports club|association football|voetbalclub|sportclub',
  // works and people, which geosearch drags in via birthplaces and settings
  'band|album|song|film|novel|newspaper|magazine|political part|surname|given name|family name|list of|census',
].join('|'), 'i');

// [pattern, catalogue kind, is it heritage]. First match wins, so the specific
// rules sit above the general ones. Deliberately NOT word-bounded on the
// compounding languages: Dutch writes "kerkgebouw", German "Rathausturm".
const WIKI_KIND_RULES = [
  [/cathedral|kathedraal|kathedrale|cattedrale|catedral|\bduomo\b/i, 'Cathedral', true],
  [/basilica|basiliek|basilika|basilique/i, 'Basilica', true],
  [/abbey|monaster|priory|convent|abdij|klooster|kloster|abbaye|abbazia|begijnhof|beguinage/i, 'Monastery', true],
  [/synagog/i, 'Synagogue', true],
  [/mosque|moskee|moschee|mosquee|mosquée|moschea/i, 'Mosque', true],
  [/church|chapel|kerk|kapel|kirche|kapelle|eglise|église|chapelle|chiesa|iglesia|ermita|kosciol|kościół|templom/i, 'Church', true],
  [/castle|chateau|château|kasteel|schloss|\bburg\b|castello|castillo|fortress|fortification|citadel|zamek|vesting/i, 'Castle', true],
  [/palace|paleis|palais|palazzo|palacio|palast/i, 'Palace', true],
  [/museum|musee|musée|museo|muzeum/i, 'Museum', false],
  [/art gallery|gallery|galerie|galleria|kunsthal/i, 'Gallery', false],
  [/theatre|theater|opera|schouwburg|teatro|teatr/i, 'Theatre', false],
  [/town hall|city hall|stadhuis|rathaus|hotel de ville|belfry|belfort|beffroi/i, 'Landmark', true],
  [/windmill|watermill|\bmill\b|molen|muhle|mühle|moulin|molino/i, 'Landmark', true],
  [/monument|memorial|statue|standbeeld|obelisk|denkmal|gedenk|pomnik/i, 'Monument', true],
  [/city gate|gatehouse|stadspoort|\bpoort\b|stadttor|porte de ville/i, 'City gate', true],
  [/\btower\b|belltower|toren|\bturm\b|torre|wieża|wieza/i, 'Tower', true],
  [/bridge|\bbrug\b|\bpont\b|ponte|brucke|brücke|\bmost\b/i, 'Bridge', false],
  [/nature reserve|natuurgebied|natuurreservaat|naturschutzgebiet|reserve naturelle|riserva naturale/i, 'Nature reserve', false],
  [/national park|nationaal park|nationalpark|parc national/i, 'National park', false],
  [/\bpark\b|garden|arboretum|\btuin\b|jardin|giardino|garten|\bpark in\b/i, 'Park', false],
  [/beach|strand|plage|spiaggia|playa/i, 'Beach', false],
  [/\blake\b|\bmeer\b|\bsee\b|\blac\b|\blago\b|jezioro|vijver|\bpond\b/i, 'Lake', false],
  [/\briver\b|canal|kanaal|rivier|fluss|fleuve|fiume/i, 'River', false],
  [/mountain|\bpeak\b|\bhill\b|summit|\bberg\b|montagne|montagna|colline/i, 'Peak', false],
  [/\bsquare\b|\bplein\b|\bplatz\b|piazza|\bplaza\b|place publique|\bmarkt\b|market/i, 'Square', false],
  [/archaeolog|archeolog|excavation|roman ruins|opgraving/i, 'Archaeological site', true],
  [/ruins?|ruine|historic house|manor|\bestate\b|country house|landhuis|herenhuis|farmhouse|hoeve|historisch gebouw|historic building/i, 'Historic site', true],
  [/\bzoo\b|animal park|dierentuin|tierpark/i, 'Zoo', false],
  [/theme park|amusement park|pretpark|freizeitpark/i, 'Theme park', false],
  [/stadium|stadion|arena/i, 'Stadium', false],
  [/lighthouse|vuurtoren|leuchtturm|phare/i, 'Lighthouse', true],
];

/** `matched` says a real sight kind was recognised, as opposed to falling
 *  through to the generic label: the caller uses it to decide whether an
 *  uncorroborated Wikipedia article belongs in a day at all. */
function kindFromText(text) {
  for (const [re, kind, heritage] of WIKI_KIND_RULES) {
    if (re.test(text)) return { kind, heritage, matched: true };
  }
  return { kind: 'Landmark', heritage: false, matched: false };
}

/** Every article with coordinates inside the radius, with its thumbnail and
 *  Wikidata description. Cheap: one request, no extracts yet. */
async function wikiGeoSearch(wl, lat, lon, radiusM) {
  if (!wl) return [];
  const url = `https://${wl}.wikipedia.org/w/api.php?action=query&format=json&origin=*`
    + `&generator=geosearch&ggscoord=${lat}%7C${lon}&ggsradius=${Math.min(10000, radiusM)}`
    + `&ggslimit=${WIKI_GEO_LIMIT}&prop=coordinates%7Cpageimages%7Cdescription`
    // colimit and pilimit default to TEN, whatever the generator's own limit
    // says, and the pages past that come back with no coordinates and are then
    // discarded as unplaceable. Without these two the harvest silently reads
    // the nearest ten articles and calls it a town.
    + '&colimit=max&pilimit=max&piprop=thumbnail&pithumbsize=500';
  const j = await getJson(url);
  const pages = j?.query?.pages;
  if (!pages) return [];
  return Object.values(pages)
    .map((p) => {
      const c = (p.coordinates || [])[0];
      if (!c) return null;
      return {
        wl,
        pageid: p.pageid,
        title: p.title || '',
        desc: p.description || '',
        lat: num(c.lat),
        lon: num(c.lon),
        img: p.thumbnail?.source || '',
      };
    })
    .filter((p) => p && p.lat != null && p.lon != null && p.title);
}

/** Intro paragraphs + canonical URLs for the pages we decided to keep. */
async function wikiExtracts(wl, pageids) {
  const out = new Map();
  for (let i = 0; i < pageids.length; i += WIKI_EXTRACT_BATCH) {
    const batch = pageids.slice(i, i + WIKI_EXTRACT_BATCH);
    const url = `https://${wl}.wikipedia.org/w/api.php?action=query&format=json&origin=*`
      + `&pageids=${batch.join('%7C')}&prop=extracts%7Cinfo&inprop=url`
      + `&exintro=1&explaintext=1&exlimit=${WIKI_EXTRACT_BATCH}`;
    // Sequential on purpose: exlimit caps a batch at 20 pages, and the API asks
    // for one request at a time rather than a burst.
    const j = await getJson(url);
    Object.values(j?.query?.pages || {}).forEach((p) => {
      out.set(p.pageid, { desc: p.extract || '', wiki: p.fullurl || '' });
    });
  }
  return out;
}

/* ------------------------------------------------------------ 3. Overpass */

const OVERPASS_FILTERS = [
  'nwr["tourism"~"^(attraction|museum|artwork|gallery|viewpoint|zoo|theme_park|aquarium)$"]["name"]',
  'nwr["historic"]["name"]',
  'nwr["leisure"~"^(park|garden|nature_reserve|water_park)$"]["name"]',
  'nwr["amenity"~"^(theatre|arts_centre|marketplace|place_of_worship)$"]["name"]',
  'nwr["natural"~"^(beach|peak|cave_entrance)$"]["name"]',
  'nwr["man_made"~"^(lighthouse|windmill|watermill)$"]["name"]',
];

function overpassQuery(lat, lon, radiusM) {
  const around = `(around:${radiusM},${lat},${lon})`;
  const body = OVERPASS_FILTERS.map((f) => `  ${f}${around};`).join('\n');
  return `[out:json][timeout:40];\n(\n${body}\n);\nout center tags ${OVERPASS_LIMIT};`;
}

const WORSHIP_KIND = {
  christian: 'Church', jewish: 'Synagogue', muslim: 'Mosque', buddhist: 'Landmark',
};

/** OSM tags to the catalogue's POI vocabulary (the kinds dayDraft.js ranks,
 *  categorises and draws glyphs for). */
function kindFromTags(tg) {
  const t = tg || {};
  const historic = t.historic || '';
  if (historic) {
    if (/^(castle|fort|fortress|city_walls|bunker)$/.test(historic)) return { kind: 'Castle', heritage: true };
    if (historic === 'city_gate') return { kind: 'City gate', heritage: true };
    if (/^(monument|memorial)$/.test(historic)) return { kind: 'Monument', heritage: true };
    if (historic === 'archaeological_site') return { kind: 'Archaeological site', heritage: true };
    if (historic === 'church' || historic === 'chapel') return { kind: 'Church', heritage: true };
    if (historic === 'tower') return { kind: 'Tower', heritage: true };
    if (historic === 'aqueduct' || historic === 'bridge') return { kind: 'Bridge', heritage: true };
    return { kind: 'Historic site', heritage: true };
  }
  if (t.tourism === 'museum') return { kind: 'Museum', heritage: false };
  if (t.tourism === 'gallery') return { kind: 'Gallery', heritage: false };
  if (t.tourism === 'artwork') return { kind: 'Sculpture', heritage: false };
  if (t.tourism === 'viewpoint') return { kind: 'Viewpoint', heritage: false };
  if (t.tourism === 'zoo') return { kind: 'Zoo', heritage: false };
  if (t.tourism === 'aquarium') return { kind: 'Aquarium', heritage: false };
  if (t.tourism === 'theme_park') return { kind: 'Theme park', heritage: false };
  if (t.amenity === 'place_of_worship') {
    if (t.building === 'cathedral' || /cathedral|kathedraal|dom|duomo/i.test(t.name || '')) {
      return { kind: 'Cathedral', heritage: true };
    }
    return { kind: WORSHIP_KIND[t.religion] || 'Church', heritage: true };
  }
  if (t.amenity === 'theatre') return { kind: 'Theatre', heritage: false };
  if (t.amenity === 'arts_centre') return { kind: 'Performing arts', heritage: false };
  if (t.amenity === 'marketplace') return { kind: 'Square', heritage: false };
  if (t.leisure === 'park') return { kind: 'Park', heritage: false };
  if (t.leisure === 'garden') return { kind: 'Garden', heritage: false };
  if (t.leisure === 'nature_reserve') return { kind: 'Nature reserve', heritage: false };
  if (t.leisure === 'water_park') return { kind: 'Water park', heritage: false };
  if (t.natural === 'beach') return { kind: 'Beach', heritage: false };
  if (t.natural === 'peak') return { kind: 'Peak', heritage: false };
  if (t.natural === 'cave_entrance') return { kind: 'Cave', heritage: false };
  if (t.man_made === 'lighthouse') return { kind: 'Lighthouse', heritage: true };
  if (/^(windmill|watermill)$/.test(t.man_made || '')) return { kind: 'Landmark', heritage: true };
  return { kind: 'Landmark', heritage: false };
}

// Roadside furniture, not a stop on anyone's day: OSM files wayside crosses,
// boundary stones and war graves under the same historic key as the castle.
const OSM_NOISE_HISTORIC = new Set([
  'wayside_cross', 'wayside_shrine', 'boundary_stone', 'milestone', 'cannon',
  'charcoal_pile', 'highwater_mark', 'tomb', 'grave', 'anchor', 'railway_car',
  'district', 'city', 'village', 'farm', 'yes',
]);

async function overpassPois(lat, lon, radiusM) {
  const body = `data=${encodeURIComponent(overpassQuery(lat, lon, radiusM))}`;
  // Overpass instances rate-limit and go down independently, and a day plan is
  // not worth failing over one of them: try the mirrors in turn.
  let j = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    j = await getJson(endpoint, {
      ms: OVERPASS_MS,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (Array.isArray(j?.elements) && j.elements.length) break;
  }
  const els = Array.isArray(j?.elements) ? j.elements : [];
  return els.map((el) => {
    const t = el.tags || {};
    const name = t.name || '';
    const plat = num(el.lat ?? el.center?.lat);
    const plon = num(el.lon ?? el.center?.lon);
    if (!name || plat == null || plon == null) return null;
    if (OSM_NOISE_HISTORIC.has(t.historic || '')) return null;
    if (t.historic === 'memorial' && /^(plaque|stone|stele|bench|tree)$/.test(t.memorial || '')) return null;
    const { kind, heritage } = kindFromTags(t);
    return {
      name,
      kind,
      lat: plat,
      lon: plon,
      // A heritage listing, a Wikidata item or an article is real-world
      // corroboration; a bare OSM node is a place that merely exists.
      heritage: heritage || !!t.heritage || !!t['heritage:operator'],
      hasWikidata: !!t.wikidata,
      osm: true,
      source: 'osm',
    };
  }).filter(Boolean);
}

/* --------------------------------------------------- 4. merge, rank, build */

/** Importance 1-3, the same scale the offline harvest writes, so every tiering,
 *  badge and auto-draft downstream treats a researched town like any other. */
const STRONG_KINDS = new Set([
  'Castle', 'Cathedral', 'Museum', 'Palace', 'Monastery', 'Basilica',
  'Historic site', 'Archaeological site', 'National park', 'City gate', 'Zoo',
]);

function rateOf(p) {
  const corroborated = !!p.wiki || p.hasWikidata;
  if (corroborated && (p.heritage || STRONG_KINDS.has(p.kind))) return 3;
  if (corroborated || STRONG_KINDS.has(p.kind)) return 2;
  return 1;
}

// Mirrors dayDraft.js poiScore (plus a distance term, since the harvest circle
// reaches into the next village and the town that was asked for should win the
// cap), so what survives here is what the planner would have ranked highest.
function score(p, radiusKm = 8) {
  let s = p.rate ?? 0;
  if (p.heritage) s += 0.6;
  if (p.wiki) s += 0.35;
  if (p.img) s += 0.15;
  // The circle reaches the next town, and every lakeside village has a
  // heritage-listed church with an article. Fading the bonus to nothing at
  // half the radius keeps the cap filled with the town that was asked for.
  if (Number.isFinite(p.km)) s += 1.4 * Math.max(0, 1 - p.km / (radiusKm * 0.5));
  return s;
}

// A parish church is heritage-listed and has a Wikipedia article, which is
// exactly the evidence that earns rate 3, and a Flemish town has fourteen of
// them. Left alone the harvest returns a day of churches. Quotas run over the
// ranked list, so the town's best of a kind keeps its standing and the tail
// steps down or drops out.
const KIND_QUOTA = 8;       // most of one kind in the list at all
const KIND_MUST_QUOTA = 3;  // most of one kind allowed to stay rate 3

/** A stateful filter (one per harvest) that applies both quotas in rank order
 *  and demotes rather than drops wherever it can. */
function kindQuota() {
  const seen = new Map();
  return (entry) => {
    const kind = entry.poi.kind || 'Landmark';
    const n = (seen.get(kind) || 0) + 1;
    seen.set(kind, n);
    if (n > KIND_QUOTA) return false;
    if (n > KIND_MUST_QUOTA && entry.poi.rate >= 3) entry.poi.rate = 2;
    return true;
  };
}

/** One place, one entry. Same folded name, or the same name within 250 m, is
 *  the same place arriving from two sources; the richer record wins and takes
 *  whatever fields the other one had. */
function mergePois(lists) {
  const out = [];
  const byName = new Map();
  // Two records on the same point to four decimals (about 11 m) are one place
  // under two names, which is how "Kasteel Verloren Bos" and "Kasteelpark
  // Verloren Bos" both arrive. Translated twins that sit a few metres apart
  // ("Kasteel van Sterrebeek" / "Sterrebeek Castle") are left to the planner's
  // own canonical-POI pass, which knows the stopwords for that.
  const byPoint = new Map();
  const pointKey = (p) => `${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`;
  for (const p of lists.flat()) {
    const key = fold(p.name);
    if (!key) continue;
    let twinIdx = byName.get(key) ?? byPoint.get(pointKey(p));
    // Same kind, near enough to be the same building: "Grottoes of Catullus"
    // from the English wiki and "Grotte di Catullo" from the Italian one are
    // one ruin 70 m apart in two datasets. Kept to same-kind pairs so two
    // churches across a square stay two churches.
    if (twinIdx == null) {
      twinIdx = out.findIndex((o) => o.kind === p.kind
        && (haversineKm(o.lat, o.lon, p.lat, p.lon) ?? 9) < 0.15);
      if (twinIdx < 0) twinIdx = null;
    }
    const twin = twinIdx != null ? out[twinIdx] : null;
    if (twin && (haversineKm(twin.lat, twin.lon, p.lat, p.lon) ?? 9) < 0.25) {
      out[twinIdx] = {
        ...p,
        ...twin,
        // "Sint-Laurentiuskerk" reads better on a day card than
        // "Sint-Laurentiuskerk (Lokeren)", and both name the same door.
        name: (twin.name.includes('(') && !p.name.includes('(')) ? p.name : twin.name,
        // Keep every piece of evidence either source found.
        heritage: twin.heritage || p.heritage,
        hasWikidata: twin.hasWikidata || p.hasWikidata,
        osm: twin.osm || p.osm,
        matched: twin.matched || p.matched,
        img: twin.img || p.img,
        // The NAME stays as first registered (the local wiki is queried
        // first, so it wins), but an English article's description and link
        // are the better read, so those are taken from English when it has
        // the place. Same split the catalogue keeps.
        desc: (p.wl === 'en' && p.desc) ? p.desc : (twin.desc || p.desc),
        wiki: (p.wl === 'en' && p.wiki) ? p.wiki : (twin.wiki || p.wiki),
        kind: twin.kind === 'Landmark' ? p.kind : twin.kind,
      };
      continue;
    }
    byName.set(key, out.length);
    byPoint.set(pointKey(p), out.length);
    out.push({ ...p });
  }
  return out;
}

/** The costs and transport profile a discovered town inherits. Both are
 *  modelled per COUNTRY upstream, so borrowing them from a neighbour states
 *  what the data already says. Accommodation is deliberately not inherited:
 *  Carta only ever quotes nightly rates it measured in the town itself. */
function inheritedModels(nearest) {
  const out = {};
  if (nearest?.costs) {
    out.costs = { ...nearest.costs, level: 'country', price_source: 'nearest_catalogue' };
  }
  if (nearest?.local_transport) {
    const lt = nearest.local_transport;
    out.local_transport = {
      car_needed: lt.car_needed ?? false,
      transit_quality: lt.transit_quality ?? 'basic',
      rental_eur_per_day: lt.rental_eur_per_day ?? null,
      road_connected: lt.road_connected ?? true,
      reason: '',
      source: 'nearest_catalogue',
    };
  }
  return out;
}

/**
 * Research a town and return a destination record the day planner can use.
 *
 *   name     what to research ("Lokeren")
 *   country  optional, sharpens the geocode
 *   lat/lon  optional prior belief (an AI suggestion, a geocode hit); used to
 *            disambiguate, never trusted as the final centre
 *   nearest  the nearest catalogued destination, for country-level models
 *   onStage  ({ key, vars }) progress: locate | read | osm | build
 *
 * Resolves { ok: true, dest } or { ok: false, code } where code is one of
 * not_found, no_sights, network.
 */
export async function researchCity({
  name, country = '', lat = null, lon = null, nearest = null, onStage = () => {},
}) {
  const stage = (key, vars) => { try { onStage({ key, vars }); } catch { /* a bad listener never blocks the harvest */ } };
  const hint = (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lon } : null;

  stage('locate', { name });
  const place = await lookupPlace(name, { country, hint });
  if (!place || !Number.isFinite(place.lat)) return { ok: false, code: 'not_found' };

  const radius = (place.population || 0) >= BIG_POP ? RADIUS_BIG_M : RADIUS_M;
  const radiusKm = radius / 1000;
  // The local-language Wikipedia is where a small town is actually written up
  // (Dutch has eight articles on Lokeren, English has none), so getting this
  // right decides whether the harvest finds anything. When the geocoder
  // couldn't say which country we're in, the neighbouring catalogue town can.
  const iso2 = place.iso2 || nearest?.iso2 || '';
  const localWl = WIKI_LANG_BY_ISO2[iso2] || '';
  const wikis = [...new Set([localWl, 'en'].filter(Boolean))];

  stage('read', { city: place.name });
  const [enSummary, localSummary, ...geoLists] = await Promise.all([
    wikiSummary('en', place.name),
    localWl ? wikiSummary(localWl, place.name) : null,
    ...wikis.map((wl) => wikiGeoSearch(wl, place.lat, place.lon, radius)),
  ]);
  // English first for the town blurb, matching every other city tagline in the
  // app. OSM's own wikipedia tag is the last resort, for towns whose article
  // sits under a title the geocoder's name doesn't match.
  let summary = enSummary || localSummary;
  if (!summary && place.wikipedia.includes(':')) {
    const [tagLang, ...rest] = place.wikipedia.split(':');
    summary = await wikiSummary(tagLang, rest.join(':'));
  }

  // The town's own article is the blurb, not a stop on its own day.
  const selfKeys = new Set([fold(place.name), fold(summary?.title || '')].filter(Boolean));

  // English is queried second, so a local-language name registered first keeps
  // the entry and the English page only contributes desc / image / link.
  const wikiPois = [];
  const extractIds = new Map(); // wl -> [pageid]
  for (const list of geoLists) {
    for (const p of list) {
      if (selfKeys.has(fold(p.title))) continue;
      if (NOT_A_SIGHT_RE.test(p.desc)) continue;
      const km = haversineKm(place.lat, place.lon, p.lat, p.lon);
      if (km == null || km > radiusKm) continue;
      const { kind, heritage, matched } = kindFromText(`${p.desc} ${p.title}`);
      wikiPois.push({
        // A title disambiguated by the town it stands in ("Markt (Lokeren)")
        // is just the place, once you are already in the town.
        name: p.title.replace(/\s*\(([^)]*)\)\s*$/, (m, inner) => (selfKeys.has(fold(inner)) ? '' : m)).trim() || p.title,
        kind,
        km,
        lat: p.lat,
        lon: p.lon,
        heritage,
        hasWikidata: true, // an article implies a Wikidata item
        matched,
        osm: false,
        img: p.img,
        desc: '',
        wiki: '',
        pageid: p.pageid,
        wl: p.wl,
        source: 'wikipedia',
      });
      if (!extractIds.has(p.wl)) extractIds.set(p.wl, []);
      extractIds.get(p.wl).push(p.pageid);
    }
  }

  stage('osm', { n: wikiPois.length });
  const [osmPois, ...extractMaps] = await Promise.all([
    overpassPois(place.lat, place.lon, radius),
    ...[...extractIds.entries()].map(async ([wl, ids]) => [wl, await wikiExtracts(wl, ids.slice(0, 40))]),
  ]);

  const extractsByWl = new Map(extractMaps);
  wikiPois.forEach((p) => {
    const rec = extractsByWl.get(p.wl)?.get(p.pageid);
    if (rec) { p.desc = rec.desc; p.wiki = rec.wiki; }
  });

  stage('build', { n: osmPois.length });
  // OpenStreetMap is the authority on "is this a place people visit": it tags
  // the museum, the castle and the park as such. So an article that isn't
  // corroborated by an OSM feature has to look like a sight on its own terms,
  // or it stays out. Skipped when Overpass gave us nothing (every mirror down),
  // since then there is nothing to corroborate against.
  const gateOnOsm = osmPois.length > 0;
  const merged = mergePois([wikiPois, osmPois])
    .filter((p) => !selfKeys.has(fold(p.name)))
    .filter((p) => p.osm || p.matched || !gateOnOsm)
    .map((p) => {
      const km = p.km ?? haversineKm(place.lat, place.lon, p.lat, p.lon);
      const out = {
        name: p.name,
        kind: p.kind,
        lat: p.lat,
        lon: p.lon,
        heritage: !!p.heritage,
      };
      if (p.img) out.img = p.img;
      if (p.desc) out.desc = p.desc;
      if (p.wiki) out.wiki = p.wiki;
      out.rate = rateOf({ ...out, wiki: p.wiki, hasWikidata: p.hasWikidata });
      // A listed church in the next village along is a fine thing to pass, but
      // it is not this town's must-see, and the day planner builds its route
      // around whatever wears that badge.
      if (out.rate >= 3 && km > radiusKm * 0.6) out.rate = 2;
      return { poi: out, rank: score({ ...out, km }, radiusKm) };
    })
    .sort((a, b) => b.rank - a.rank)
    .filter(kindQuota())
    .slice(0, POI_CAP)
    .map((x) => x.poi);

  if (merged.length < MIN_POIS) return { ok: false, code: 'no_sights' };

  const dest = {
    id: `found:${slugify(place.name)}${iso2 ? `-${iso2.toLowerCase()}` : ''}`,
    tier: 'found',
    iata: null,
    city: place.name,
    country: place.country || nearest?.country || '',
    iso2,
    lat: place.lat,
    lon: place.lon,
    city_lat: place.lat,
    city_lon: place.lon,
    categories: [],
    tags: [],
    blurb: summary?.extract ? firstSentence(summary.extract, 220) : '',
    no_ryanair_route: true,
    anchor_airport: nearest?.anchor_airport ?? null,
    transfer: null,
    ...inheritedModels(nearest),
    activities: {
      source: 'live_research',
      items: merged.slice(0, 12).map((p) => ({ name: p.name, kind: p.kind })),
      items_full: merged,
    },
    // What this record is and where every part of it came from, so the UI can
    // say so and a later catalogue release can replace it knowingly.
    discovered: {
      at: new Date().toISOString(),
      sources: ['nominatim', ...wikis.map((w) => `${w}.wikipedia`), 'openstreetmap'],
      radius_km: Math.round(radius / 1000),
      n_pois: merged.length,
    },
  };
  if (place.population) dest.geonames = { population: place.population, settlement: 'town' };
  if (summary?.img) {
    dest.image = {
      url: summary.img, credit: summary.title || place.name, page: summary.page || '', source: 'wikipedia',
    };
  }
  return { ok: true, dest };
}
