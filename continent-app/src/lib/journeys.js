/**
 * journeys.js, the curated trip library: 253 editorial week-long trips in
 * ten styles (cycling, trail running, city, cozy towns, road trips, hiking,
 * culinary, winter sports, nature escapes, water sports), written by hand
 * and unified by the Trips/carta-unified pipeline.
 *
 * Three artifacts, written by pipeline/journeys/build_wire.py:
 *   /journeys/index.json          the ten styles, a hero photo and count each
 *   /journeys/type/{slug}.json    one style's trips as CARDS
 *   /journeys/journey/{id}.json   one trip in full: 7 days, budget, logistics
 *
 * Same repo gotcha as trips.js and friends: under public/ a missing JSON is
 * served as the SPA index with status 200, so every fetch checks the content
 * type and resolves null instead of throwing on "<!doctype".
 */

const SLUG_RE = /^[a-z-]{3,30}$/;
const ID_RE = /^[a-z]{2}-[a-z0-9-]{3,90}$/;

function isJson(res) {
  return res.ok && (res.headers.get('content-type') || '').includes('json');
}

function loadJson(url) {
  return fetch(url)
    .then((r) => (isJson(r) ? r.json() : null))
    .catch(() => null);
}

const cache = new Map();

function cached(url) {
  if (!cache.has(url)) cache.set(url, loadJson(url));
  return cache.get(url);
}

/** The ten styles, in schema order, each with n, countries and a hero. */
export function loadJourneyIndex() {
  return cached('/journeys/index.json').then((raw) => {
    if (!raw || !Array.isArray(raw.types)) return null;
    const types = raw.types.filter((t) => t && t.slug && t.n > 0);
    return types.length ? { ...raw, types } : null;
  });
}

/** Every trip of one style, as cards, or null. */
export function loadJourneyType(slug) {
  const key = String(slug || '');
  if (!SLUG_RE.test(key)) return Promise.resolve(null);
  return cached(`/journeys/type/${key}.json`).then((raw) => {
    if (!raw || !Array.isArray(raw.trips)) return null;
    return raw.trips.filter((t) => t && t.id);
  });
}

/** One trip in full, or null. */
export function loadJourney(id) {
  const key = String(id || '');
  if (!ID_RE.test(key)) return Promise.resolve(null);
  return cached(`/journeys/journey/${encodeURIComponent(key)}.json`)
    .then((raw) => ((raw && raw.id && Array.isArray(raw.itinerary)) ? raw : null));
}

/* ── Labels ──────────────────────────────────────────────────────────────── */

// Style slug -> the i18n key naming it. The wire's own `name` field is the
// English fallback for a slug this map has not met.
export const TYPE_LABEL_KEY = {
  cycling: 'journey.typeCycling',
  'trail-running': 'journey.typeTrailRunning',
  city: 'journey.typeCity',
  'cozy-towns': 'journey.typeCozyTowns',
  'road-trip': 'journey.typeRoadTrip',
  hiking: 'journey.typeHiking',
  culinary: 'journey.typeCulinary',
  'winter-sports': 'journey.typeWinterSports',
  'nature-escape': 'journey.typeNatureEscape',
  'water-sports': 'journey.typeWaterSports',
};

export const typeLabel = (slug, t, fallback = '') => {
  const key = TYPE_LABEL_KEY[slug];
  return key ? t(key) : (fallback || slug);
};

// Difficulty labels are a five-word enum in the schema; translated here.
const DIFF_KEY = {
  Easy: 'journey.diffEasy',
  Moderate: 'journey.diffModerate',
  Active: 'journey.diffActive',
  Demanding: 'journey.diffDemanding',
  Expert: 'journey.diffExpert',
};

export const diffLabel = (label, t) => (DIFF_KEY[label] ? t(DIFF_KEY[label]) : (label || ''));

/** "May, Jun, Sep" from a month-number array, in the app language. */
export function monthsShort(months, lang) {
  if (!Array.isArray(months) || !months.length) return '';
  try {
    const fmt = new Intl.DateTimeFormat(lang, { month: 'short' });
    return months
      .filter((m) => m >= 1 && m <= 12)
      .map((m) => fmt.format(new Date(2026, m - 1, 1)))
      .join(', ');
  } catch {
    return months.join(', ');
  }
}

/** "€950-1,400" from a {low, high} pair, or '' when the record has neither. */
export function eurRange(pair, lang) {
  if (!pair) return '';
  const fmt = (n) => Math.round(n).toLocaleString(lang);
  const { low, high } = pair;
  if (Number.isFinite(low) && Number.isFinite(high) && low !== high) {
    return `€${fmt(low)}-${fmt(high)}`;
  }
  if (Number.isFinite(low)) return `€${fmt(low)}`;
  if (Number.isFinite(high)) return `€${fmt(high)}`;
  return '';
}

/**
 * The source prose carries **bold** markers. Rendered as segments rather
 * than dangerouslySetInnerHTML, so harvested text can never become markup.
 */
export function boldSegments(text) {
  const parts = String(text || '').split('**');
  return parts.map((chunk, i) => ({ text: chunk, bold: i % 2 === 1 }));
}
