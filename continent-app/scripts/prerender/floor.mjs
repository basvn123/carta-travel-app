/**
 * floor.mjs, the page floor (docs/SEO.md "The page floor", register T205-d).
 *
 * A row earns an indexable URL and a sitemap line only when its page carries
 * all four of: a title, coordinates, one image with a licence on record, and
 * at least three facts that render as sentences. The test reads the page
 * model the prerender builds (so it judges what a crawler would see) plus,
 * for trails and cycling routes, the wire row, because those page models do
 * not render a photograph and the wire's `img` has no licence field.
 *
 * Applies to the six catalogue kinds below. Countries, section lists, NUTS2
 * regions, trips, journeys and tours are containers or composed pages, not
 * catalogue rows, and are not floored.
 *
 * listedFloor() does the same count for the listed-only rows (`t: 'l'`), which
 * have no page at all; it answers how many of them would clear the floor if
 * they were given one, from the wire fields the page builders read.
 */

export const FLOORED = Object.freeze(['dest', 'trail', 'cycle', 'beach', 'lake', 'mountain']);
export const MIN_FACTS = 3;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const has = (v) => v !== null && v !== undefined && v !== '';

/** The wire image of a trail or cycling route: licensed only when it says so. */
const wireImageLicensed = (img) => Boolean(img && img.u && (img.lic || img.licence));

/**
 * { title, coords, image, facts, ok } for one page model, or null for a kind
 * the floor does not apply to. `row` is the wire row for trail and cycle.
 */
export function pageFloor(page, row) {
  if (!FLOORED.includes(page.kind)) return null;
  const g = page.subject?.geo;
  const f = {
    title: Boolean(String(page.title || '').trim() && String(page.h1 || '').trim()),
    coords: isNum(g?.latitude) && isNum(g?.longitude),
    image: page.image ? Boolean(page.image.src && page.image.licence) : wireImageLicensed(row?.img),
    facts: (page.facts || []).length >= MIN_FACTS,
  };
  return { ...f, ok: f.title && f.coords && f.image && f.facts };
}

// The wire fields each layer's page turns into facts (pages.mjs layerPage,
// trailPage, cyclePage). A listed row has the fields it has; the count is how
// many of them are present.
const FACT_FIELDS = {
  beach: [(r) => r.water?.class, (r) => r.surface, (r) => r.lengthM, (r) => r.size?.areaKm2, (r) => r.prot, (r) => r.aspect],
  lake: [(r) => r.swim, (r) => r.size?.areaKm2, (r) => r.size?.depthM, (r) => r.water?.class, (r) => r.access],
  mountain: [(r) => r.ele, (r) => r.prom, (r) => r.range, (r) => r.lift, (r) => r.season, (r) => r.acc],
  cycle: [(r) => r.km, (r) => r.asc, (r) => r.dur?.min, (r) => r.paved, (r) => r.free, (r) => r.ref],
  trail: [(r) => r.distance_m, (r) => r.ascent_m, (r) => r.duration_min, (r) => r.difficulty, (r) => r.f?.se?.from, (r) => r.ele?.max],
};

/** { title, coords, image, facts, ok } for a listed-only wire row of `kind`. */
export function listedFloor(kind, row) {
  const im = (row.images || [])[0];
  const image = kind === 'trail' || kind === 'cycle' ? wireImageLicensed(row.img) : Boolean(im?.u && im.lic);
  const coords = isNum(row.lat) && isNum(row.lon)
    ? true
    : Array.isArray(row.bbox) && row.bbox.length === 4 && row.bbox.every(isNum);
  const f = {
    title: has(row.name) || has(row.ref),
    coords,
    image,
    facts: (FACT_FIELDS[kind] || []).filter((get) => has(get(row))).length >= MIN_FACTS,
  };
  return { ...f, ok: f.title && f.coords && f.image && f.facts };
}

/** A tally with the same four criteria, for the build's pass one. */
export function newTally() {
  return { total: 0, title: 0, coords: 0, image: 0, facts: 0, ok: 0, imageOnlyMiss: 0 };
}

export function addToTally(t, f) {
  t.total += 1;
  for (const k of ['title', 'coords', 'image', 'facts', 'ok']) if (f[k]) t[k] += 1;
  if (!f.image && f.title && f.coords && f.facts) t.imageOnlyMiss += 1;
}
