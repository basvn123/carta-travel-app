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
 * prerender manifest, which the sitemap reads. Kinds not listed here keep the
 * floor alone (beach, lake, mountain, cycle, cost); the research bar for them
 * needs monthly data the wire does not carry yet (see the T1076 report).
 */

export const PLACE_MIN_WORDS = 120;
export const PLACE_MIN_LINKS = 5;
export const TRAIL_MIN_WORDS = 60;
export const BAR_KINDS = Object.freeze(['dest', 'trail']);

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

/** The bar for any page; null for kinds it does not apply to. */
export function pageBar(page, { dos = null, row = null, cc = null, linkedFrom = null } = {}) {
  if (page.kind === 'dest' && dos) return placeBar(page, dos);
  if (page.kind === 'trail' && row) return trailBar(page, row, cc, linkedFrom);
  return null;
}
