/**
 * The Carta URL scheme (T223). The written version is docs/SEO.md; this file is
 * the one place the rules live in code, so the app, the prerender (T221) and the
 * sitemap build (T222) cannot disagree about a path.
 *
 * Pure functions only: no window, no import.meta, no data fetches. That keeps
 * the module importable from a Node script (scripts/verify_url_scheme.mjs) and
 * from the build.
 *
 * Shape of a path, lower case, no query string, no trailing slash:
 *
 *   [/{lang}]/{country}                              country guide
 *   [/{lang}]/{country}/{dossier-slug}               destination (slug is `country/place`)
 *   [/{lang}]/{country}/{section}[/{page}]           section list, paginated on the path
 *   [/{lang}]/{country}/trails/{id}-{title-slug}     trail, stage or parent
 *   [/{lang}]/{country}/cycling/{id}-{title-slug}    cycling route
 *   [/{lang}]/{country}/cycling/tours/{slug}         cycling tour
 *   [/{lang}]/{country}/beaches|lakes|mountains/{wire-id}
 *   [/{lang}]/{country}/regions/{id}--{name-slug}
 *   [/{lang}]/trips/{id}   /journeys/{id}   /guides/{id}   cross-country pages
 *
 * English is the root and the x-default; nl, de, fr, es and it are prefixes.
 */

/** Section words, reserved inside every country namespace. */
export const SECTION_WORDS = Object.freeze([
  'trails', 'beaches', 'lakes', 'mountains', 'cycling', 'regions', 'trips', 'cost',
]);

/** Top-level words that are never a country: cross-country pages and hosting. */
export const TOP_WORDS = Object.freeze([
  'trips', 'journeys', 'guides', 'routes', 'sitemap', 'assets', 'api', 'static',
  'about',
]);

/** `{n}-days` and `{n}-day`, the T224 trip-length pages. */
export const DAYS_RE = /^\d{1,2}-days?$/;

/** Language prefixes. English has none. */
export const LANG_PREFIXES = Object.freeze(['nl', 'de', 'fr', 'es', 'it']);

/** ISO 3166 alpha-2 to country path word. These are the first segment of every dossier slug. */
export const COUNTRY_SLUGS = Object.freeze({
  AD: 'andorra', AL: 'albania', AT: 'austria', BA: 'bosnia-and-herzegovina',
  BE: 'belgium', BG: 'bulgaria', CH: 'switzerland', CY: 'cyprus', CZ: 'czechia',
  DE: 'germany', DK: 'denmark', EE: 'estonia', ES: 'spain', FI: 'finland',
  FO: 'faroe-islands', FR: 'france', GB: 'united-kingdom', GR: 'greece',
  HR: 'croatia', HU: 'hungary', IE: 'ireland', IS: 'iceland', IT: 'italy',
  LI: 'liechtenstein', LT: 'lithuania', LU: 'luxembourg', LV: 'latvia',
  MC: 'monaco', MD: 'moldova', ME: 'montenegro', MK: 'north-macedonia',
  MT: 'malta', NL: 'netherlands', NO: 'norway', PL: 'poland', PT: 'portugal',
  RO: 'romania', RS: 'serbia', SE: 'sweden', SI: 'slovenia', SK: 'slovakia',
  SM: 'san-marino', XK: 'kosovo',
});

const SLUG_TO_CC = Object.freeze(
  Object.fromEntries(Object.entries(COUNTRY_SLUGS).map(([cc, s]) => [s, cc])));

/** The longest title slug in a path; the id in front keeps it unique. */
export const MAX_SLUG = 48;

/** Folds a title into a path word: no accents, lower case, hyphens only. */
export function slugify(text, max = MAX_SLUG) {
  const s = String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .replace(/đ/g, 'd').replace(/ł/g, 'l').replace(/þ/g, 'th').replace(/ð/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf('-');
  return (at > 12 ? cut.slice(0, at) : cut).replace(/-+$/, '');
}

/** True when a segment may not be used as a country or a place word. */
export function isReservedSegment(seg) {
  return SECTION_WORDS.includes(seg) || TOP_WORDS.includes(seg)
    || LANG_PREFIXES.includes(seg) || seg === 'en' || DAYS_RE.test(seg);
}

/** Checks dossier slugs against the reserved words. Returns the offenders. */
export function reservedCollisions(slugs) {
  const bad = [];
  for (const s of slugs) {
    const parts = String(s).split('/');
    if (parts.length !== 2 || parts.some((p) => !/^[a-z0-9-]+$/.test(p))
      || !SLUG_TO_CC[parts[0]] || isReservedSegment(parts[1])) bad.push(s);
  }
  return bad;
}

const langPrefix = (lang) => (LANG_PREFIXES.includes(lang) ? `/${lang}` : '');
const cw = (cc) => COUNTRY_SLUGS[String(cc || '').toUpperCase()] || null;
const withTitle = (id, title) => {
  const s = slugify(title);
  return s ? `${id}-${s}` : String(id);
};

/** Wire ids carry a Wikidata Q in capitals; paths are lower case. */
const lowerId = (id) => String(id).toLowerCase();
const restoreQ = (seg) => seg.replace(/-q(\d+)$/, '-Q$1');

/** Builders. Each returns a path, or null when the country has no path word. */
export const paths = {
  country: (cc, lang) => (cw(cc) ? `${langPrefix(lang)}/${cw(cc)}` : null),
  dest: (slug, lang) => (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(slug || '') ? `${langPrefix(lang)}/${slug}` : null),
  cost: (slug, lang) => (paths.dest(slug, lang) ? `${paths.dest(slug, lang)}/cost` : null),
  section: (cc, section, page = 1, lang) => {
    if (!cw(cc) || !SECTION_WORDS.includes(section) || section === 'cost') return null;
    const base = `${langPrefix(lang)}/${cw(cc)}/${section}`;
    return page > 1 ? `${base}/${Math.floor(page)}` : base;
  },
  days: (cc, n, band, lang) => (cw(cc) ? `${langPrefix(lang)}/${cw(cc)}/${n}-days${band ? `/under-${band}` : ''}` : null),
  trail: (cc, id, title, lang) => (cw(cc) ? `${langPrefix(lang)}/${cw(cc)}/trails/${withTitle(id, title)}` : null),
  cycle: (cc, id, title, lang) => (cw(cc) ? `${langPrefix(lang)}/${cw(cc)}/cycling/${withTitle(id, title)}` : null),
  tour: (cc, slug, lang) => (cw(cc) ? `${langPrefix(lang)}/${cw(cc)}/cycling/tours/${slug}` : null),
  beach: (cc, id, lang) => (cw(cc) ? `${langPrefix(lang)}/${cw(cc)}/beaches/${lowerId(id)}` : null),
  lake: (cc, id, lang) => (cw(cc) ? `${langPrefix(lang)}/${cw(cc)}/lakes/${lowerId(id)}` : null),
  mountain: (cc, id, lang) => (cw(cc) ? `${langPrefix(lang)}/${cw(cc)}/mountains/${lowerId(id)}` : null),
  region: (cc, id, name, lang) => {
    if (!cw(cc)) return null;
    const n = slugify(name);
    return `${langPrefix(lang)}/${cw(cc)}/regions/${lowerId(id)}${n ? `--${n}` : ''}`;
  },
  trip: (id, lang) => `${langPrefix(lang)}/trips/${id}`,
  journey: (id, lang) => `${langPrefix(lang)}/journeys/${id}`,
  guide: (id, lang) => `${langPrefix(lang)}/guides/${id}`,
};

const SEC_KIND = { beaches: 'beach', lakes: 'lake', mountains: 'mountain' };

/**
 * Reads a pathname back into what it names. Returns null for anything that is
 * not a Carta content path (the app shell at `/`, assets, unknown words).
 * Never throws.
 */
export function parsePath(pathname) {
  let p = String(pathname || '').split(/[?#]/)[0].replace(/\/+$/, '');
  if (!p.startsWith('/') || p === '') return null;
  let segs = p.slice(1).split('/');
  let lang = 'en';
  if (LANG_PREFIXES.includes(segs[0])) { lang = segs[0]; segs = segs.slice(1); }
  if (!segs.length || segs.some((s) => !/^[a-z0-9_-]+$/.test(s))) return null;

  const [a, b, c, d] = segs;
  if (a === 'trips' && b && segs.length === 2) return { kind: 'trip', id: b, lang };
  if (a === 'journeys' && b && segs.length === 2) return { kind: 'journey', id: b, lang };
  if (a === 'guides' && b && segs.length === 2) return { kind: 'guide', id: b, lang };

  const cc = SLUG_TO_CC[a];
  if (!cc) return null;
  const base = { cc, lang };
  if (segs.length === 1) return { kind: 'country', ...base };

  if (segs.length === 2 && !isReservedSegment(b)) {
    return { kind: 'dest', slug: `${a}/${b}`, ...base };
  }
  if (segs.length === 3 && c === 'cost' && !isReservedSegment(b)) {
    return { kind: 'cost', slug: `${a}/${b}`, ...base };
  }
  if (DAYS_RE.test(b || '')) {
    if (segs.length === 2) return { kind: 'days', days: parseInt(b, 10), ...base };
    if (segs.length === 3 && /^under-\d{1,4}$/.test(c)) {
      return { kind: 'days', days: parseInt(b, 10), band: parseInt(c.slice(6), 10), ...base };
    }
    return null;
  }
  if (!SECTION_WORDS.includes(b) || b === 'cost') return null;
  if (segs.length === 2) return { kind: 'section', section: b, page: 1, ...base };
  if (segs.length === 3 && /^\d{1,4}$/.test(c) && ['trails', 'beaches', 'lakes', 'mountains', 'cycling', 'regions', 'trips'].includes(b)) {
    const page = parseInt(c, 10);
    if (page >= 2) return { kind: 'section', section: b, page, ...base };
  }
  if (b === 'trails' && segs.length === 3 && /^\d+(-|$)/.test(c)) {
    return { kind: 'trail', id: parseInt(c, 10), ...base };
  }
  if (b === 'cycling' && segs.length === 3 && /^\d+(-|$)/.test(c)) {
    return { kind: 'cycle', id: parseInt(c, 10), ...base };
  }
  if (b === 'cycling' && segs.length === 4 && c === 'tours' && /^[a-z0-9-]{3,80}$/.test(d)) {
    return { kind: 'tour', slug: d, ...base };
  }
  if (SEC_KIND[b] && segs.length === 3 && /^[a-z0-9-]{3,80}$/.test(c)) {
    return { kind: SEC_KIND[b], id: restoreQ(c), ...base };
  }
  if (b === 'regions' && segs.length === 3 && /^[a-z0-9_-]{2,64}$/.test(c.split('--')[0])) {
    return { kind: 'region', id: c.split('--')[0].toUpperCase(), ...base };
  }
  return null;
}

/** A parsed path back into the legacy boot hash the nine readers understand. */
export function pathToLegacyHash(parsed) {
  if (!parsed) return null;
  const q = (o) => `#${new URLSearchParams(o).toString()}`;
  switch (parsed.kind) {
    case 'trail': return q({ trail: String(parsed.id), tc: parsed.cc });
    case 'cycle': return q({ cycle: String(parsed.id), cc: parsed.cc });
    case 'tour': return q({ tour: parsed.slug });
    case 'beach': return q({ beach: parsed.id, bc: parsed.cc });
    case 'lake': return q({ lake: parsed.id, lc: parsed.cc });
    case 'mountain': return q({ mtn: parsed.id, mc: parsed.cc });
    case 'region': return q({ region: parsed.id });
    case 'trip': return q({ itin: parsed.id });
    case 'guide': return q({ guide: parsed.id });
    default: return null; // dest needs a slug to id table; see docs/SEO.md
  }
}

/**
 * A legacy hash into the path it now lives at, or null when the hash is not
 * ours or the path cannot be built from the hash alone (a destination hash
 * carries the id, not the slug). Titles are not in the hash, so the path is
 * id-only; the prerender serves the slugged canonical (see canonicalFor).
 *
 * Except for an id of four digits or fewer (T221): /switzerland/trails/5134
 * reads back as page 5134 of the trail list, so such an id gets a placeholder
 * word (/switzerland/trails/5134-trail), which reads back as the trail and is
 * answered with the page and its real canonical. 468 trail and 152 cycling
 * ids on the wire of 2026-10-03 are that short.
 */
const LIST_PAGE_MAX = 9999;
const idOnly = (id, word) => (id <= LIST_PAGE_MAX ? word : undefined);

export function legacyHashToPath(hash) {
  const h = String(hash || '');
  if (!h.startsWith('#')) return null;
  const p = new URLSearchParams(h.slice(1));
  const cc = (k) => String(p.get(k) || '').toUpperCase();
  const tid = Number(p.get('trail'));
  const cid = Number(p.get('cycle'));
  if (p.has('trail') && tid > 0) return paths.trail(cc('tc'), tid, idOnly(tid, 'trail'));
  if (p.has('cycle') && cid > 0) return paths.cycle(cc('cc'), cid, idOnly(cid, 'route'));
  if (p.has('tour')) {
    // A tour slug starts with its country code (be-ravel-..., de-ammer-...).
    const t = String(p.get('tour'));
    return paths.tour(t.slice(0, 2).toUpperCase(), t);
  }
  if (p.has('beach')) return paths.beach(cc('bc'), p.get('beach'));
  if (p.has('lake')) return paths.lake(cc('lc'), p.get('lake'));
  if (p.has('mtn')) return paths.mountain(cc('mc'), p.get('mtn'));
  if (p.has('region')) {
    const id = String(p.get('region'));
    const m = /^(?:COAST_|RANGE_)?([A-Z]{2})/i.exec(id);
    return m ? paths.region(m[1], id) : null;
  }
  if (p.has('itin')) return paths.trip(p.get('itin'));
  if (p.has('guide')) return paths.guide(p.get('guide'));
  return null;
}

/**
 * Canonical and indexing for one entity page.
 *
 *   e.kind   'trail' | 'cycle' | 'beach' | ... (a builder name)
 *   e.cls    trail hierarchy class: standalone, stage, parent, variant
 *   e.of     the line a variant varies, as { cc, id, title }
 *   e.dupOf  the overlap test's chosen line (T205-e), same shape
 *   e.belowFloor  true when the row fails the page floor (T222 decides)
 *   e.lang   the language of this page
 *
 * Returns { canonical, indexable, sitemap }. Every page is its own canonical
 * except a variant, which names the line it varies, and a duplicate, which
 * names the line the overlap test picked. A stage is never folded into its
 * parent. A row below the floor renders and carries noindex but is not a
 * canonical target for anyone else.
 */
export function canonicalFor(e) {
  const self = selfPath(e);
  let canonical = self;
  let indexable = !e.belowFloor;
  let sitemap = indexable;
  if ((e.kind === 'trail' || e.kind === 'cycle') && e.dupOf) {
    canonical = selfPath({ ...e, ...e.dupOf, lang: e.lang });
    sitemap = false;
  } else if (e.kind === 'trail' && e.cls === 'variant' && e.of) {
    canonical = selfPath({ kind: 'trail', ...e.of, lang: e.lang });
    sitemap = false;
  }
  return { canonical, indexable, sitemap };
}

function selfPath(e) {
  switch (e.kind) {
    case 'trail': return paths.trail(e.cc, e.id, e.title, e.lang);
    case 'cycle': return paths.cycle(e.cc, e.id, e.title, e.lang);
    case 'tour': return paths.tour(e.cc, e.slug, e.lang);
    case 'beach': return paths.beach(e.cc, e.id, e.lang);
    case 'lake': return paths.lake(e.cc, e.id, e.lang);
    case 'mountain': return paths.mountain(e.cc, e.id, e.lang);
    case 'region': return paths.region(e.cc, e.id, e.title, e.lang);
    case 'dest': return paths.dest(e.slug, e.lang);
    case 'trip': return paths.trip(e.id, e.lang);
    case 'journey': return paths.journey(e.id, e.lang);
    default: return null;
  }
}

/** The reciprocal hreflang set for a path: every language plus x-default. */
export function alternates(path) {
  const parsed = parsePath(path);
  if (!parsed) return [];
  const bare = parsed.lang === 'en' ? path : path.replace(/^\/[a-z]{2}(?=\/)/, '');
  const out = [{ hreflang: 'en', path: bare }, { hreflang: 'x-default', path: bare }];
  for (const l of LANG_PREFIXES) out.push({ hreflang: l, path: `/${l}${bare}` });
  return out;
}
