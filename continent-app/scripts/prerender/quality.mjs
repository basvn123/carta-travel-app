/**
 * quality.mjs, the page quality bar (T1076, ROADMAP K2).
 *
 * The page floor (floor.mjs) asks whether a page is complete enough to exist.
 * The bar asks whether it is good enough to be indexed: Google judges a site
 * by its weakest pages, so a thin generated page is `noindex,follow` and out
 * of the sitemap until the data behind it lifts it over the bar. A page that
 * clears the bar is promoted by the next prerender, with no list to edit.
 *
 * Source: docs/research/2026-11-launch-plan-research.md, "Page quality gate".
 *
 *   Place (dest): a licensed photo, an intro of at least 120 words, a bed
 *     price and a food price, twelve months of climate, a rating, and at
 *     least five internal links.
 *   Trail: a licensed photo, at least 60 words of prose, a length, a climb
 *     and a difficulty, a map (a bounding box to draw), a linked place (a
 *     destination page that links to it), and a season.
 *
 * It is one pure function per kind over data the build already holds, so no
 * wire key and no schema change are needed: the `indexable` flag lives in the
 * prerender manifest, which the sitemap reads. Cost pages keep the floor alone; the research bar for them
 * needs monthly data the wire does not carry yet (see the T1076 report).
 * T1113 adds the layer, cycling and trip bars below.
 */

export const PLACE_MIN_WORDS = 120;
export const PLACE_MIN_LINKS = 5;
export const TRAIL_MIN_WORDS = 60;
export const LAYER_MIN_WORDS = 60;
export const LAYER_MIN_LINKS = 3;
export const CYCLE_MIN_WORDS = 60;
export const TRIP_MIN_STOPS = 1;
export const TRIP_MIN_LINKS = 4;
export const BAR_KINDS = Object.freeze(['dest', 'trail', 'beach', 'lake', 'mountain', 'cycle', 'trip']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Words in a string, counted on whitespace. */
export function words(s) {
  const t = String(s || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Internal links a page model carries: its breadcrumbs and every link row. */
export function internalLinks(page) {
  const paths = new Set();
  for (const c of page.crumbs || []) if (c.path) paths.add(c.path);
  for (const s of page.sections || []) for (const l of s?.links || []) if (l.path) paths.add(l.path);
  for (const l of page.pager || []) if (l.path) paths.add(l.path);
  paths.delete(page.path);
  return paths.size;
}

/** Whole text of the intro of a dossier: the body, or short + body when the body does not repeat it. */
export function introWords(dos) {
  const short = String(dos?.intro?.short || '').trim();
  const body = String(dos?.intro?.body || '').trim();
  if (body && short && !body.startsWith(short)) return words(`${short} ${body}`);
  return words(body || short);
}

/** Twelve months of climate: twelve normals rows with a temperature each. */
export function hasYearOfClimate(dos) {
  const n = dos?.when?.normals;
  return Array.isArray(n) && n.length === 12 && n.every((m) => Array.isArray(m) && isNum(m[0]) && isNum(m[1]));
}

/**
 * { photo, intro, price, climate, rating, links, ok } for a destination.
 * `dos` is the dossier, `page` the page model destPage built from it.
 */
export function placeBar(page, dos) {
  const facts = page.facts || [];
  const hasFact = (label) => facts.some((f) => f.label === label);
  const f = {
    photo: Boolean(page.image?.src && page.image?.licence),
    intro: introWords(dos) >= PLACE_MIN_WORDS,
    price: hasFact('Bed, a night') && hasFact('Food, a day'),
    climate: hasYearOfClimate(dos),
    rating: hasFact('Carta score'),
    links: internalLinks(page) >= PLACE_MIN_LINKS,
  };
  return { ...f, ok: Object.values(f).every(Boolean) };
}

/**
 * { photo, prose, length, climb, difficulty, map, place, season, ok } for a
 * trail. `row` is the wire row, `page` its page model, `linkedFrom` the set of
 * `cc/id` keys that a destination page links to.
 */
export function trailBar(page, row, cc, linkedFrom) {
  const facts = page.facts || [];
  const hasFact = (label) => facts.some((x) => x.label === label);
  const prose = [...(page.lead || []), ...(page.sections || []).flatMap((s) => s?.paras || [])].join(' ');
  const f = {
    photo: Boolean(row?.img?.u && (row.img.lic || row.img.licence)),
    prose: words(prose) >= TRAIL_MIN_WORDS,
    length: hasFact('Distance'),
    climb: hasFact('Climb'),
    difficulty: hasFact('Difficulty'),
    map: Array.isArray(row?.bbox) && row.bbox.length === 4 && row.bbox.every(isNum),
    place: Boolean(row && linkedFrom && linkedFrom.has(`${cc}/${row.id}`)),
    season: hasFact('Season'),
  };
  return { ...f, ok: Object.values(f).every(Boolean) };
}

const pageProse = (page) => words([...(page.lead || []), ...(page.sections || []).flatMap((s) => s?.paras || [])].join(' '));
const factLabels = (page) => new Set((page.facts || []).map((f) => f.label));

// The fact that stands for "monthly data" on each layer page (T1113): the wire
// carries no twelve-month series for them, so the bar asks for the one
// seasonal or measured fact each layer prints.
const LAYER_SEASON_FACT = { beach: ['Bathing water'], lake: ['Swim season', 'Swimming'], mountain: ['Snow free'] };

/**
 * { photo, prose, season, place, rating, links, ok } for a beach, lake or
 * mountain page (T1113, K2): a licensed photo, 60 words of page prose, the
 * layer's seasonal or measured fact, a parent place (the nearest town, which
 * links to a destination page), a Carta score and three internal links.
 */
export function layerBar(page) {
  const labels = factLabels(page);
  const f = {
    photo: Boolean(page.image?.src && page.image?.licence),
    prose: pageProse(page) >= LAYER_MIN_WORDS,
    season: (LAYER_SEASON_FACT[page.kind] || []).some((l) => labels.has(l)),
    place: labels.has('Nearest town'),
    rating: labels.has('Carta score'),
    links: internalLinks(page) >= LAYER_MIN_LINKS,
  };
  return { ...f, ok: Object.values(f).every(Boolean) };
}

/**
 * { photo, prose, length, climb, rating, links, ok } for a cycling route.
 * The page renders no photograph, so the photo is the wire row's, as in the
 * page floor.
 */
export function cycleBar(page, row) {
  const labels = factLabels(page);
  const f = {
    photo: Boolean(row?.img?.u && (row.img.lic || row.img.licence)),
    prose: pageProse(page) >= CYCLE_MIN_WORDS,
    length: labels.has('Distance'),
    climb: labels.has('Climb'),
    rating: labels.has('Carta score'),
    links: internalLinks(page) >= LAYER_MIN_LINKS,
  };
  return { ...f, ok: Object.values(f).every(Boolean) };
}

/**
 * { stops, cost, season, links, ok } for a trip: at least one stop that links
 * to a destination page (the parent place), a cost per day, a season and four
 * internal links.
 */
export function tripBar(page) {
  const labels = factLabels(page);
  const stops = (page.sections || []).find((s) => s?.h2 === 'Where you stay')?.links || [];
  const f = {
    stops: stops.filter((l) => l.path).length >= TRIP_MIN_STOPS,
    cost: labels.has('A day for one person, estimated'),
    season: labels.has('Season'),
    links: internalLinks(page) >= TRIP_MIN_LINKS,
  };
  return { ...f, ok: Object.values(f).every(Boolean) };
}

/**
 * Near-duplicate trips (T1113). Two trips of a country that visit the same
 * set of towns differ only in nights, pace or order: one page is the
 * representative and the others carry its canonical. The representative is the
 * best scored, then the shortest id. Returns Map(tripId -> representative id)
 * holding only the trips that are not their own representative.
 */
export function canonicalTrips(trips) {
  const groups = new Map();
  for (const t of trips || []) {
    const stops = (t.cities || []).map((c) => `${c.cc}|${String(c.city || '').toLowerCase()}`);
    if (stops.length < 1) continue;
    const key = `${t.cc}#${[...new Set(stops)].sort().join('+')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = new Map();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || String(a.id).length - String(b.id).length || String(a.id).localeCompare(String(b.id)));
    for (const t of g.slice(1)) out.set(t.id, g[0].id);
  }
  return out;
}

/** The bar for any page; null for kinds it does not apply to. */
export function pageBar(page, { dos = null, row = null, cc = null, linkedFrom = null } = {}) {
  if (page.kind === 'dest' && dos) return placeBar(page, dos);
  if (page.kind === 'trail' && row) return trailBar(page, row, cc, linkedFrom);
  if (page.kind === 'beach' || page.kind === 'lake' || page.kind === 'mountain') return layerBar(page);
  if (page.kind === 'cycle') return cycleBar(page, row);
  if (page.kind === 'trip') return tripBar(page);
  return null;
}
