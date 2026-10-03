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
 * Applies to the six catalogue kinds below and to the destination cost page
 * (T224), which carries one more test: at least one of its two figures, the
 * bed or the food, is measured in or near the town. A week built only from
 * national figures says the same thing as every other town in its country,
 * and a few thousand such pages are the near-duplicates the floor exists to
 * keep out of the index. Countries, section lists, NUTS2 regions, trips,
 * journeys and tours are containers or composed pages, not catalogue rows,
 * and are not floored. The country and trip-length pages (T224) have their
 * own floor, daysPlan() below: a page that would list too few places is not
 * written at all.
 *
 * listedFloor() does the same count for the listed-only rows (`t: 'l'`), which
 * have no page at all; it answers how many of them would clear the floor if
 * they were given one, from the wire fields the page builders read.
 */

export const FLOORED = Object.freeze(['dest', 'trail', 'cycle', 'beach', 'lake', 'mountain', 'cost']);
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
  if (page.kind === 'cost') f.measured = Boolean(page.measured);
  return { ...f, ok: f.title && f.coords && f.image && f.facts && f.measured !== false };
}

/** The fewest places a country and trip-length page may list (T224). */
export const DAYS_MIN_PLACES = 5;
/** The largest share of the length page a budget page may list. */
export const DAYS_MAX_SHARE = 0.8;

/**
 * Which country and trip-length pages a country gets (T224, docs/SEO.md "up
 * to 43 countries x 3 lengths x 3 bands, emitted only above the floor").
 * `perDays` are the day costs of the country's priced places. Every length
 * gets its page when the country has DAYS_MIN_PLACES priced places. A budget
 * page is added only when it lists at least that many, leaves out at least a
 * fifth of the length page, and lists at least DAYS_MIN_PLACES more than the
 * next lower budget page that exists. A budget that (almost) every place
 * meets, or that adds a place or two to the one below it, would be a copy of
 * a page that already exists: Austria under 100 a day was 52 of 53 places.
 */
export function daysPlan(perDays, lengths, bands) {
  const total = perDays.length;
  if (total < DAYS_MIN_PLACES) return [];
  const out = [];
  for (const days of lengths) {
    out.push({ days, band: null, places: total });
    let last = 0;
    for (const band of bands) {
      const k = perDays.filter((v) => v < band).length;
      if (k >= DAYS_MIN_PLACES && k <= total * DAYS_MAX_SHARE && k - last >= DAYS_MIN_PLACES) {
        out.push({ days, band, places: k });
        last = k;
      }
    }
  }
  return out;
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
